// cronScheduler.ts
import { Queue } from 'bullmq';
import { connection } from './connection';
import { CRON_QUEUE_NAME, SCHEDULER_ID } from './cronQueue';

const queue = new Queue(CRON_QUEUE_NAME, { connection });
queue.on('error', (err) => console.error('queue error:', err.message));

// Creates, lists or removes a recurring job (a Job Scheduler).
//   npx tsx example-scripts/cronScheduler.ts         -> create or update it
//   npx tsx example-scripts/cronScheduler.ts list    -> show all schedulers
//   npx tsx example-scripts/cronScheduler.ts remove  -> stop it for good
async function main() {
  const [action] = process.argv.slice(2);

  if (action === 'remove') {
    // Removes the scheduler and its next pending run. Nothing runs after this.
    await queue.removeJobScheduler(SCHEDULER_ID);
    console.log(`removed scheduler ${SCHEDULER_ID}`);
  } else if (action === 'list') {
    const schedulers = await queue.getJobSchedulers();
    for (const s of schedulers) {
      console.log(`${s.key}: '${s.pattern}' (${s.tz}), next run ${new Date(s.next!).toLocaleTimeString()}`);
    }
  } else {
    // upsertJobScheduler() = "insert or update". Run this script as many times
    // as you like: there is still only ONE scheduler with this id in Redis.
    //   arg 1 — scheduler id: the key that makes the upsert safe to repeat.
    //   arg 2 — when to run:
    //           `pattern` is a cron expression. This one has 6 fields, the first
    //           is seconds: '*/10 * * * * *' = every 10 seconds. With 5 fields
    //           ('0 0 * * *' = every day at midnight) there are no seconds.
    //           `tz` is the time zone the pattern is read in.
    //   arg 3 — the job template: every run is a normal job with this name,
    //           data and options (here: BullMQ's built-in retry).
    const firstJob = await queue.upsertJobScheduler(
      SCHEDULER_ID,
      { pattern: '*/10 * * * * *', tz: 'Asia/Kolkata' },
      {
        name: 'report',
        data: { type: 'order-summary' },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      },
    );
    console.log(`scheduler ${SCHEDULER_ID} saved, next run: ${firstJob.id}`);
  }

  // The schedule lives in Redis, not in this process, so the script can exit.
  await queue.close();
}

main();
