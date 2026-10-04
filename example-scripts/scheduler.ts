// scheduler.ts
import { Queue } from 'bullmq';
import { connection, QUEUE_NAME } from './connection';

// A Queue is the producer-side handle to a queue in Redis: you use it to ADD
// jobs and to look them up / remove them. It does not process anything — that's
// the worker's job.
//   arg 1 — queue name (must match the worker's queue name)
//   arg 2 — options, including the Redis connection
const queue = new Queue(QUEUE_NAME, { connection });

// Redis connection problems are reported here. Without this listener, BullMQ
// prints a raw stack trace on every reconnect attempt.
queue.on('error', (err) => console.error('queue error:', err.message));

// The SCHEDULER enqueues a delayed job, or cancels one before it runs.
//   npx tsx example-scripts/scheduler.ts            -> schedule a job (fires in 5s)
//   npx tsx example-scripts/scheduler.ts cancel <id> -> cancel that job
async function main() {
  // Read CLI args: e.g. `... scheduler.ts cancel 42` -> action="cancel", jobId="42"
  const [action, jobId] = process.argv.slice(2);

  if (action === 'cancel') {
    // getJob(id) looks a job up by id. Returns the Job, or undefined if it has
    // already run or was removed.
    const job = await queue.getJob(jobId);
    if (job) {
      // remove() deletes the job from the queue. For a delayed job that hasn't
      // run yet, this cancels it — the worker will never see it.
      await job.remove();
      console.log(`cancelled job ${jobId} — it will not run`);
    } else {
      console.log(`no job ${jobId} found (already ran or removed)`);
    }
  } else {
    const delayMs = 5000;

    // add() puts a new job on the queue.
    //   arg 1 — job name ('reminder'): a label the worker can switch on to
    //           handle different job types on the same queue.
    //   arg 2 — data: the payload, must be JSON-serializable. The worker reads
    //           this as job.data. The `attempt` / `maxAttempts` / `retryDelayMs`
    //           fields are only used by the manual retry worker
    //           (workerManualRetry.ts); the basic worker just logs them.
    //   arg 3 — options: here `delay` (ms) holds the job back so it only becomes
    //           available to the worker after that time. Other options live here
    //           too: `attempts`, `backoff`, `jobId`, `priority`, etc. (Recurring
    //           jobs are not an add() option — use queue.upsertJobScheduler().)
    //           `attempts` + `backoff` here drive BullMQ's built-in retry, used
    //           by workerBuiltInRetry.ts; the other workers never throw, so
    //           they are not affected.
    const job = await queue.add(
      'reminder',
      {
        orderId: 'order-123',
        reason: 'unpaid',
        attempt: 1,
        maxAttempts: 3,
        retryDelayMs: 3000,
      },
      { delay: delayMs, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
    console.log(`scheduled job ${job.id} to run in ${delayMs / 1000}s`);
    console.log(`cancel it with: npx tsx example-scripts/scheduler.ts cancel ${job.id}`);
  }

  // Close the connection so this short-lived script can exit (the worker, by
  // contrast, stays open to keep processing).
  await queue.close();
}

main();
