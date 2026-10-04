// workerManualRetry.ts
//
// MANUAL RETRY EXAMPLE — an alternative to worker.ts.
//
// Instead of letting BullMQ retry (via `attempts` + `backoff` in the job
// options), the retry settings travel in the JOB BODY and this worker decides
// for itself whether to try again. On failure it adds a NEW job to the same
// queue with attempt + 1, delayed by retryDelayMs.
//
// Run EITHER this worker OR worker.ts — not both. They consume the same queue,
// so if both run they will compete for the same jobs.
//
// Trade-offs vs BullMQ's built-in retry:
//   * the retry is a NEW job with a NEW id (built-in retry reuses the same job
//     id and increments job.attemptsMade)
//   * because we CATCH the error, BullMQ never sees a failure — every attempt
//     is recorded as 'completed' and the 'failed' event never fires
// Use this only when you need that control; otherwise prefer `attempts` + `backoff`.
import { Queue, Worker } from 'bullmq';
import { connection, QUEUE_NAME, ReminderJobData } from './connection';

// A Queue handle, so the worker can put the NEXT attempt back on the same queue.
// Only needed because we are retrying manually.
const queue = new Queue(QUEUE_NAME, { connection });
queue.on('error', (err) => console.error('  queue error:', err.message));

// Simulated work — this is the part that can fail in real life (SMTP down,
// payment API timing out, etc.). It fails on attempt 1 and succeeds from
// attempt 2, so the retry path is easy to watch in the demo.
async function sendReminder(data: ReminderJobData): Promise<void> {
  if (data.attempt === 1) {
    throw new Error('payment provider timed out');
  }
  console.log(`  reminder sent for ${data.orderId} (${data.reason})`);
}

const worker = new Worker<ReminderJobData>(
  QUEUE_NAME,

  async (job) => {
    // The retry settings come from the job body, not the job options.
    const { attempt, maxAttempts, retryDelayMs } = job.data;

    console.log('Processing queue:', QUEUE_NAME);
    console.log(
      `[${new Date().toLocaleTimeString()}] job ${job.id} — attempt ${attempt}/${maxAttempts}`,
    );

    try {
      await sendReminder(job.data);
      console.log(`  success on attempt ${attempt}`);
    } catch (err) {
      const reason = (err as Error).message;

      if (attempt < maxAttempts) {
        // RESCHEDULE: add a NEW job to the same queue carrying an incremented
        // attempt counter, delayed by retryDelayMs. That delayed job becomes
        // "attempt 2", and this one finishes normally.
        //   arg 1 — same job name, so the same worker logic handles it
        //   arg 2 — the same body, with attempt bumped by 1
        //   arg 3 — delay: wait this long before the retry becomes available
        await queue.add(job.name, { ...job.data, attempt: attempt + 1 }, { delay: retryDelayMs });

        console.log(
          `  attempt ${attempt} failed (${reason}) — retrying in ${retryDelayMs / 1000}s as attempt ${attempt + 1}`,
        );
      } else {
        // No attempts left: stop here instead of scheduling another job.
        console.error(`  attempt ${attempt} failed (${reason}) — no attempts left, giving up`);
      }
    }
  },

  { connection },
);

// NOTE: 'completed' fires for every attempt here — including the ones whose
// work failed — because the error was caught above. 'failed' only fires for
// errors we did not catch.
worker.on('completed', (job) => console.log(`  done: ${job.id}`));
worker.on('failed', (job, err) => console.error(`  failed: ${job?.id} — ${err.message}`));

// Redis connection problems are reported here. Without these listeners, BullMQ
// prints a raw stack trace on every reconnect attempt.
worker.on('error', (err) => console.error('  worker error:', err.message));
