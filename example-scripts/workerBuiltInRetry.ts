// workerBuiltInRetry.ts
//
// BUILT-IN RETRY EXAMPLE — the recommended way.
//
// The worker simply THROWS when the work fails. BullMQ sees the failure and
// retries the SAME job automatically, using the `attempts` and `backoff`
// options given when the job was added (see scheduler.ts).
//
// Run EITHER this worker OR worker.ts / workerManualRetry.ts — not more than
// one. They consume the same queue, so they would compete for the same jobs.
import { Worker } from 'bullmq';
import { connection, QUEUE_NAME } from './connection';

// Simulated work — fails on the first attempt and succeeds on the second, so
// the retry is easy to watch.
async function sendReminder(orderId: string, attempt: number): Promise<void> {
  if (attempt === 1) {
    throw new Error('payment provider timed out');
  }
  console.log(`  reminder sent for ${orderId}`);
}

const worker = new Worker(
  QUEUE_NAME,

  async (job) => {
    // job.attemptsMade — how many attempts have already FAILED (0 on the first run)
    // job.opts.attempts — the total attempts allowed, set when the job was added
    const attempt = job.attemptsMade + 1;
    console.log(
      `[${new Date().toLocaleTimeString()}] job ${job.id} — attempt ${attempt}/${job.opts.attempts}`,
    );

    // No try/catch here: if this throws, BullMQ marks the attempt as failed,
    // waits according to `backoff`, and runs the same job again.
    await sendReminder(job.data.orderId, attempt);
  },

  { connection },
);

// 'failed' fires for every failed attempt; 'completed' fires once, when an
// attempt finally succeeds.
worker.on('completed', (job) => console.log(`  done: ${job.id}`));
worker.on('failed', (job, err) =>
  console.error(`  failed: ${job?.id} (attempt ${job?.attemptsMade}) — ${err.message}`),
);

// Redis connection problems are reported here. Without this listener, BullMQ
// prints a raw stack trace on every reconnect attempt.
worker.on('error', (err) => console.error('  worker error:', err.message));
