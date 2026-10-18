import { Queue } from 'bullmq';
import { config } from '../config/config';
import {
  QUEUE_CONFIG,
  QueueName,
  QUEUE_NAMES,
  SCHEDULER_CONFIG,
  SchedulerName,
} from '../constants/appConstants';

// One Queue instance per queue name, created on demand and reused. Queues live
// in Redis, so scheduled jobs survive restarts and are shared across instances.
const queues = new Map<QueueName | SchedulerName, Queue>();

function getQueue(name: QueueName | SchedulerName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    // enableOfflineQueue: false — while Redis is down, adding a job fails
    // immediately instead of waiting in memory until Redis comes back, so the
    // API can answer the client right away. (Workers keep the default.)
    queue = new Queue(name, { connection: { ...config.redis, enableOfflineQueue: false } });
    // Without a listener, Redis connection errors are printed as raw stack
    // traces; log them like the worker does instead.
    queue.on('error', (err) => {
      console.error(`Queue ${name} connection error:`, err.message);
    });
    queues.set(name, queue);
  }
  return queue;
}

// Fail fast at startup if Redis is unreachable. The connection retries forever,
// so without a timeout startup would wait forever too; instead, give up after
// `timeoutMs` so the app exits rather than accepting requests it cannot serve.
export async function verifyRedisConnection(timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis not reachable within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    await Promise.race([getQueue(QUEUE_NAMES.ORDER_REMINDERS).waitUntilReady(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Add a job to a queue using that queue's configured delay/retry settings. A
// caller-supplied jobId makes the add idempotent: re-adding the same id while
// the job still exists is a no-op instead of a duplicate.
export async function addJob<T extends object>(
  queueName: QueueName,
  data: T,
  opts: { jobId?: string } = {},
) {
  const { jobName, delay, attempts, backoff, removeOnComplete, removeOnFail } =
    QUEUE_CONFIG[queueName];
  return getQueue(queueName).add(jobName, data, {
    delay,
    attempts,
    backoff,
    removeOnComplete,
    removeOnFail,
    jobId: opts.jobId,
  });
}

// Cancel a previously scheduled job. Safe if it has already run or was removed,
// and tolerant of the rare case where the job is active (mid-processing) and
// locked — the worker's own paid-status guard neutralises that job anyway.
export async function removeJob(queueName: QueueName, jobId: string) {
  const job = await getQueue(queueName).getJob(jobId);
  if (!job) return;
  try {
    await job.remove();
  } catch {
    // Job is active/locked; leave it — it will no-op on its status check.
  }
}

// Jobs of a queue that failed all their tries and are still kept in Redis
// (see `removeOnFail`).
export async function getFailedJobs(queueName: QueueName) {
  return getQueue(queueName).getFailed();
}

// Create the recurring job, or update it if it already exists. Safe to call on
// every app start: the scheduler id is the key, so restarts (or several app
// instances) never create a second schedule. A changed pattern replaces the
// old one; a changed scheduler id creates a NEW scheduler and leaves the old
// one running (remove it with queue.removeJobScheduler()).
export async function upsertScheduler(name: SchedulerName) {
  const { schedulerId, jobName, pattern, tz, attempts, backoff, removeOnComplete, removeOnFail } =
    SCHEDULER_CONFIG[name];
  return getQueue(name).upsertJobScheduler(
    schedulerId,
    { pattern, tz },
    { name: jobName, opts: { attempts, backoff, removeOnComplete, removeOnFail } },
  );
}

// The scheduler as stored in Redis, including `next`: its next run time.
export async function getScheduler(name: SchedulerName) {
  return getQueue(name).getJobScheduler(SCHEDULER_CONFIG[name].schedulerId);
}

// Run a scheduled job once, right now, outside its schedule. It goes through
// the same queue and worker, with the same retry settings.
export async function runSchedulerNow(name: SchedulerName) {
  const { jobName, attempts, backoff, removeOnComplete, removeOnFail } = SCHEDULER_CONFIG[name];
  return getQueue(name).add(jobName, {}, { attempts, backoff, removeOnComplete, removeOnFail });
}
