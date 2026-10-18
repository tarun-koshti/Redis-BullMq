# BullMQ order app — delayed jobs, retries, cancel, and cron

A small Express + BullMQ + MongoDB app with two features, each from its own
article:

1. **Unpaid order reminders (delayed jobs)** — remind an unpaid order up to N
   times, retry each reminder if sending fails, and cancel the whole chain the
   moment the order is paid. Article:
   [Beyond Caching: Scheduling Jobs with Redis, Node.js and BullMQ](https://dev.to/tarun_koshti_122/beyond-caching-scheduling-jobs-with-redis-nodejs-and-bullmq-31a5).
2. **Daily order report (cron)** — a BullMQ Job Scheduler runs every night at
   midnight, aggregates the orders of the last 24 hours, and saves the result in
   the `analytics` collection. Article:
   [Beyond Caching: Cron Jobs with Redis, Node.js and BullMQ](https://dev.to/tarun_koshti_122/beyond-caching-cron-jobs-with-redis-nodejs-and-bullmq-hpd).
   See also [Cron: daily order report](#cron-daily-order-report).

When an order is created we schedule a delayed reminder. Each reminder, when it
runs, schedules the next one — until the order is paid or the reminder limit is
reached. Paying an order removes the pending reminder, which ends the chain.

## Two independent "3"s

The example deliberately keeps two different counters apart:

- **`maxNotifications`** — *business logic*. How many times to remind while the
  order is still unpaid (the reminder chain).
- **`attempts` + `backoff`** — *BullMQ infrastructure*. How many times a single
  reminder is retried if the send itself fails, and the spacing between retries.

Both are config values, not hardcoded.

## Stack

- **Node.js + TypeScript** — run with `tsx` in development
- **Express 5** — HTTP API
- **BullMQ 6** (+ `ioredis`) — delayed jobs, Job Schedulers (cron), retries,
  workers, backed by Redis
- **MongoDB** (Mongoose) — orders and reports
- **Docker Compose** — Redis 7 + MongoDB 8

## Prerequisites

- **Node.js 22 or later** (tested on 22) — check with `node --version`
- **Docker** with Docker Compose v2 — check with `docker compose version`
- **Git**

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/tarun-koshti/Redis-BullMq.git
   cd Redis-BullMq
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create your `.env` from the example (the defaults work as they are):

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env`.

4. Start Redis and MongoDB:

   ```bash
   docker compose up -d
   ```

   Check that both are running:

   ```bash
   docker compose ps
   ```

5. Start the app (API + worker in one process, restarts on file changes):

   ```bash
   npm run dev
   ```

   You should see:

   ```
   MongoDB connected
   Redis connected
   Order report scheduled: '0 0 * * *' (Asia/Kolkata), next run 2026-10-18T18:30:00.000Z
   API listening on http://localhost:3000
   Reminder delay: 30000ms
   ```

   (The next run is printed in UTC: midnight in India is 18:30 UTC.)

To run a production build instead:

```bash
npm run build
npm start
```

All npm scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the app with auto-restart on file changes |
| `npm run build` | Compile `src/` to `dist/` (the example scripts are not included) |
| `npm start` | Run the compiled app from `dist/` |
| `npm run example -- <file>` | Run one of the example scripts (see below) |
| `npm run typecheck` | Type-check the app and the example scripts |

When you're done, stop the containers with `docker compose down`. Your data is
kept in Docker volumes; use `docker compose down -v` to wipe it.

> **Port already in use?** If another Redis (6379) or MongoDB (27017) is running
> on your machine, `docker compose up` fails to start that container. Stop the
> other one, or change the host port in `docker-compose.yaml` (e.g.
> `"6380:6379"`) and the matching `REDIS_PORT` / `MONGO_URI` in `.env`.

## Try it

Create an order (schedules reminder 1; the rest follow every `delay`):

```bash
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{ "item": "Coffee mug", "amount": 499 }'
```

Copy the order's `_id` from the response and use it as `<ORDER_ID>` below.

**Pay in time** — before the first reminder fires — and the whole chain is
cancelled (nothing is logged):

```bash
curl -X POST http://localhost:3000/orders/<ORDER_ID>/pay
```

**Leave it unpaid** and the worker logs, `delay` apart:

```
Reminder 1/3: order <id> is still unpaid
Reminder 2/3: order <id> is still unpaid
Reminder 3/3: order <id> is still unpaid
```

Inspect an order any time:

```bash
curl http://localhost:3000/orders/<ORDER_ID>
```

> Tip: for a watchable demo, drop `delay` to e.g. `3000` in
> `src/constants/appConstants.ts`.

## Cron: daily order report

On every start, the app creates (or updates) a BullMQ **Job Scheduler** with
`queue.upsertJobScheduler()`. It runs every day at 00:00 `Asia/Kolkata` and, for
the 24 hours before that time, saves one report in the `analytics` collection:

- orders created in the period, by their current status: `total`, `pending`,
  `paid`
- the same split for the order `amount`
- `failedReminders`: reminder jobs that failed all their tries in the period
  (read from BullMQ's failed set)
- `trigger`: `schedule` or `manual`

How it works:

- **One schedule, however many instances.** The scheduler id
  (`daily-order-report`) is the key of the upsert, so restarts and extra app
  instances never add a second schedule, and each run is processed by exactly
  one worker.
- **The period comes from the scheduled time** (`job.opts.prevMillis`), not
  from "now", so a late run or a retry still reports the right period.
- **One report per period.** The report is saved with an upsert on
  `(reportType, periodEnd)`, backed by a unique index, so running a period again
  overwrites it instead of adding a duplicate.
- **Retries** use `attempts` + `backoff`, like any other job.

### Try it

The schedule lives in `SCHEDULER_CONFIG` in `src/constants/appConstants.ts`.
For a watchable demo, run it every minute — change **both** values, they belong
together:

```ts
pattern: '* * * * *',
periodMs: 60_000,
```

Restart the app, create a few orders (see [Try it](#try-it)), and at the next
full minute the app logs:

```
Order report 2026-10-18T08:20:00.000Z to 2026-10-18T08:21:00.000Z: {"orders":{"total":3,"pending":2,"paid":1},"amount":{"total":620,"pending":120,"paid":500},"failedReminders":0}
```

Then read the reports, check the schedule, or run a report now:

```bash
curl "http://localhost:3000/reports?limit=5"
curl http://localhost:3000/reports/schedule
curl -X POST http://localhost:3000/reports/run
```

Set `pattern` and `periodMs` back to the daily values (`'0 0 * * *'`,
`24 * 60 * 60 * 1000`) when you are done.

> **Changing the schedule.** Change the pattern and restart: the existing
> scheduler is updated. Don't rename `schedulerId`: a new id creates a second
> scheduler, and the old one keeps running until you remove it with
> `queue.removeJobScheduler('<old id>')`. Stopping the app or deleting the code
> doesn't remove a scheduler either; it lives in Redis.

## Example scripts

`example-scripts/` holds small standalone scripts from the articles. They need
only Redis (no Express or MongoDB), so start it first:

```bash
docker compose up -d redis
```

| File | What it shows |
| --- | --- |
| `connection.ts` | The shared Redis connection, queue name and job data shape |
| `worker.ts` | A basic worker that processes jobs when their delay elapses |
| `scheduler.ts` | Schedules a delayed job (fires in 5s), or cancels one before it runs |
| `workerManualRetry.ts` | Manual retry: the job body carries the retry settings and the worker re-adds the job |
| `workerBuiltInRetry.ts` | BullMQ's built-in retry: the worker throws and BullMQ retries the same job |
| `cronQueue.ts` | Queue name and scheduler id shared by the two cron scripts |
| `cronScheduler.ts` | Creates or updates a Job Scheduler (every 10s), or `list`s / `remove`s it |
| `cronWorker.ts` | Processes the scheduled runs and logs the time each run was scheduled for |

### Delayed jobs

Run a worker in one terminal:

```bash
npm run example -- example-scripts/worker.ts
```

Then schedule a job from another terminal, and cancel it if you like:

```bash
npm run example -- example-scripts/scheduler.ts
npm run example -- example-scripts/scheduler.ts cancel <jobId>
```

Run only **one** worker at a time (`worker.ts`, `workerManualRetry.ts` or
`workerBuiltInRetry.ts`): they all consume the same queue, so they would
compete for the same jobs.

### Cron

Run the cron worker in one terminal (or in several, to see that each run is
still processed only once):

```bash
npm run example -- example-scripts/cronWorker.ts
```

Then create, list, and remove the scheduler from another terminal:

```bash
npm run example -- example-scripts/cronScheduler.ts
npm run example -- example-scripts/cronScheduler.ts list
npm run example -- example-scripts/cronScheduler.ts remove
```

Running `cronScheduler.ts` again doesn't add a second schedule: it upserts the
same scheduler id. The cron scripts use their own queue, so they don't compete
with the delayed-job workers.

## API

| Method & path | Success | Errors |
| --- | --- | --- |
| `POST /orders` — body `{ "item": string, "amount": number }` | `201` `{ order }` | `400` missing/invalid fields · `503` reminder could not be scheduled (e.g. Redis down) — nothing is saved, retry |
| `POST /orders/:id/pay` | `200` `{ order }` (or `{ order, note: "already paid" }`) | `400` invalid order id · `404` order not found |
| `GET /orders/:id` | `200` `{ order }` | `400` invalid order id · `404` order not found |
| `GET /reports?limit=<n>` | `200` `{ reports }`, newest period first (default 10, max 100) | `500` MongoDB unreachable |
| `GET /reports/schedule` | `200` `{ scheduler, nextRun }` | `503` Redis unreachable, retry |
| `POST /reports/run` | `202` `{ jobId }`: a report run is queued, outside the schedule | `503` Redis unreachable — nothing was queued, retry |

Errors are returned as `{ "error": "<message>" }`. Unexpected errors return
`500` `{ "error": "internal error" }` and are logged on the server.

## Config

Two places, on purpose:

**`.env`** (see `.env.example`) — connection configuration only:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port of the API |
| `MONGO_URI` | `mongodb://localhost:27017/bullmq_demo` | MongoDB connection string |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_RETRY_DELAY_MS` | `2000` | Longest wait between Redis reconnect attempts |
| `REDIS_STARTUP_TIMEOUT_MS` | `20000` | How long startup waits for Redis before exiting |

**`src/constants/appConstants.ts`** — queue tuning: `jobName`, `delay`,
`maxNotifications`, `attempts`, `backoff`, and `removeOnComplete` /
`removeOnFail` (completed jobs are kept 24h, failed jobs 7 days, then deleted).

The same file has `SCHEDULER_CONFIG` for the cron: `schedulerId`, `jobName`,
`pattern` (`'0 0 * * *'`), `tz` (`Asia/Kolkata`), `periodMs` (24h — how much
time one report covers; keep it in step with `pattern` and at 7 days or less,
because failed reminders are only kept for 7 days), `attempts`, `backoff`, and
`removeOnComplete` / `removeOnFail` (completed runs kept 7 days, failed runs 30
days).

## How it works

- `POST /orders` → creates the order, then `scheduleReminder(orderId, 1)`.
- `POST /orders/:id/pay` → mark paid, then `cancelReminder(orderId)` removes the
  one pending reminder. The chain only extends when a reminder runs, so removing
  the pending job ends it permanently.
- The worker (`processReminder` in `src/services/orderReminders.ts`):
  1. Reloads the order and stops immediately if it is missing or already paid —
     this also neutralises any reminder that slips through a pay/cancel race.
  2. Advances the chain (schedules the next reminder) **before** sending, so a
     reminder that fails all its retries still does not break the chain.
  3. Sends the notification (here, `console.log`). If this throws, BullMQ retries
     it per `attempts` + `backoff`.

Reminders use a **deterministic job id** (`reminder:<orderId>:<n>`), so a BullMQ
retry re-scheduling the next reminder is idempotent rather than a duplicate.
That only works while the job still exists in Redis, which is why completed jobs
are kept for 24h rather than deleted immediately.

`addJob` / `removeJob` (in `src/services/queue.ts`) own the queue instances, so
the rest of the app never touches BullMQ directly.

## Failure handling

- **Redis down at startup** — the app waits up to `REDIS_STARTUP_TIMEOUT_MS`,
  then logs `Redis not reachable` and exits, instead of accepting requests it
  can't serve.
- **Redis goes down while running** — the Redis connections keep reconnecting
  (waiting up to `REDIS_RETRY_DELAY_MS` between attempts), so the API and the
  worker recover by themselves when Redis comes back. During the outage:
  - creating an order fails fast with `503`, and the order is not saved;
  - paying still succeeds — the reminder can't be cancelled yet, but the
    worker's paid-status check stops it when it runs.
- **Connection errors** are logged by `error` listeners on the queue and the
  worker, instead of raw stack traces.
- **Restarts** — Redis runs with the append-only file on and a `redis-data`
  volume (see `docker-compose.yaml`), so scheduled jobs and the cron schedule
  survive a restart or `docker compose down`.
- **Redis memory full** — Redis runs with `maxmemory 256mb` and
  `maxmemory-policy noeviction`, so it never deletes jobs or schedules to free
  memory; new writes fail with an OOM error instead.
- **Bad input** — malformed ids and invalid fields return `400`, never `500`.

## Project structure

```
example-scripts/                  standalone article examples (not part of the app build)
src/
  config/config.ts                connection config from env
  constants/appConstants.ts       queue + scheduler names and tuning (delay, cron pattern, retries, cleanup)
  controllers/orderController.ts  order request handlers (throw AppError, forward via next)
  controllers/reportController.ts report request handlers (list, schedule, run now)
  exceptions/appError.ts          AppError(message, statusCode) thrown by controllers
  interfaces/queue.ts             shared TypeScript interfaces
  middlewares/errorHandler.ts     global error handler (AppError / Mongoose errors → 4xx)
  models/order.ts                 Mongoose Order model
  models/analytics.ts             Mongoose Analytics model (collection `analytics`)
  routes/orderRoutes.ts           Express router at /orders (rejects malformed ids)
  routes/reportRoutes.ts          Express router at /reports
  services/queue.ts               addJob / removeJob / verifyRedisConnection + scheduler helpers
  services/orderReminders.ts      reminder domain logic (schedule/cancel/process)
  services/orderReport.ts         report logic (aggregate orders, count failed reminders, save)
  services/worker.ts              BullMQ worker for reminders
  services/reportWorker.ts        BullMQ worker for report runs
  index.ts                        app wiring + startup (upserts the report scheduler)
```

## Notes / limitations

- **Workers in-process.** For the demo both workers run in the API process; in
  production they would usually be their own process.
- **Missed cron runs are not caught up.** If no worker runs when a report is
  due, that run starts late when the app comes back, and the other missed runs
  never happen, so those periods have no report. There is no backfill here.
- **Fixed report period.** `periodMs` is a fixed 24 hours. That is exact for
  `Asia/Kolkata`; in a time zone with daylight saving time, a day can be 23 or
  25 hours, so compute the period from the previous scheduled run instead.
- **Pay/cancel race.** If payment lands in the exact moment a reminder is
  mid-execution, that reminder may still send once — the next one is then
  stopped by the paid-status guard. This is a deliberate simplification, not a
  distributed lock.
- **Switching the Mongo image** on an existing `mongo-data` volume needs
  `docker compose down -v` (the storage format differs between images).
