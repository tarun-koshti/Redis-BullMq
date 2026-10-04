// worker.ts
import { Worker } from 'bullmq';
import { connection, QUEUE_NAME } from './connection';

// The WORKER is the consumer side of the queue: it pulls jobs from Redis and processes them.
// Basically the worker contains the business logic to process the job's data, like sending emails, calling APIs and the database
// It does not reschedule or mark the job itself: returning normally marks the job completed, and throwing marks it failed — BullMQ then retries it according to the job's attempts/backoff options
// Keep it running in one terminal, then schedule jobs from another.
// The worker continuously pulls jobs for processing
//
// A Worker is bound to exactly ONE queue. If you have several queues you need to create a separate worker instance for every queue name
// The first argument is the queue name (Example: "DEMO_QUEUE")
// The second argument is the async function which contains the business logic
// The third argument is the connection configuration
const worker = new Worker(
  QUEUE_NAME,

  async (job) => {
    // job.id   — unique id of this job in the queue
    // job.name — the job's name (set by queue.add('reminder', ...) in
    //            scheduler.ts); use it to route different job types handled
    //            by the same worker
    // job.data — the payload passed when the job was scheduled
    console.log('Processing queue:', QUEUE_NAME);
    console.log(`[${new Date().toLocaleTimeString()}] processing job ${job.id}:`, job.data);
  },

  { connection },
);

// Lifecycle events. The worker keeps a long-lived connection to Redis and emits
// an event for every job it finishes.
worker.on('completed', (job) => console.log(`  done: ${job.id}`)); // job succeeded
worker.on('failed', (job, err) => console.error(`  failed: ${job?.id} — ${err.message}`)); // job threw

// Redis connection problems are reported here. Without this listener, BullMQ
// prints a raw stack trace on every reconnect attempt.
worker.on('error', (err) => console.error('  worker error:', err.message));
