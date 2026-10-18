import { Worker } from 'bullmq';
import { config } from '../config/config';
import { SCHEDULER_NAMES } from '../constants/appConstants';
import { processOrderReport } from './orderReport';

// Processes the order report runs. Like the reminder worker, it runs in the API
// process for this demo. With several app instances, each run is still
// processed once: BullMQ gives every job to exactly one worker.
export const reportWorker = new Worker(SCHEDULER_NAMES.ORDER_REPORTS, processOrderReport, {
  connection: config.redis,
});

reportWorker.on('failed', (job, err) => {
  console.error(
    `Report job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}):`,
    err.message,
  );
});

reportWorker.on('error', (err) => {
  console.error('Report worker connection error:', err.message);
});
