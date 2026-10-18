// cronWorker.ts
import { Worker } from 'bullmq';
import { connection } from './connection';
import { CRON_QUEUE_NAME } from './cronQueue';

// A scheduled run is a normal job, so a normal Worker processes it. Start this
// in one or more terminals: each run is still processed only once, by one of
// them.
const worker = new Worker(
  CRON_QUEUE_NAME,

  async (job) => {
    // `opts.prevMillis` is the time this run was SCHEDULED for. Use it (not
    // "now") to decide what period the run covers: a late run or a retry then
    // still covers the right period.
    const scheduledFor = new Date(job.opts.prevMillis ?? job.timestamp);
    console.log(
      `[${new Date().toLocaleTimeString()}] ${job.name} for ${scheduledFor.toLocaleTimeString()}:`,
      job.data,
    );
  },

  { connection },
);

worker.on('failed', (job, err) => console.error(`  failed: ${job?.id} — ${err.message}`));
worker.on('error', (err) => console.error('  worker error:', err.message));
