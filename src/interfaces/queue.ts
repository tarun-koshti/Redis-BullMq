import type { KeepJobs } from 'bullmq';

export interface QueueSettings {
  jobName: string;
  delay: number; // ms to wait before each reminder becomes active
  maxNotifications: number; // how many times to remind while still unpaid
  attempts: number; // total tries per job on failure (1 initial + retries)
  backoff: { type: 'exponential' | 'fixed'; delay: number }; // spacing between retries
  removeOnComplete: KeepJobs; // when BullMQ may delete completed jobs from Redis
  removeOnFail: KeepJobs; // when BullMQ may delete failed jobs from Redis
}

// A recurring job, run by a BullMQ Job Scheduler on a cron pattern.
export interface SchedulerSettings {
  schedulerId: string; // one scheduler per id; upserting the same id updates it
  jobName: string;
  pattern: string; // cron expression, e.g. '0 0 * * *' = every day at midnight
  tz: string; // time zone the pattern is read in
  periodMs: number; // how much time one report covers; match it to the pattern
  attempts: number; // total tries per run on failure (1 initial + retries)
  backoff: { type: 'exponential' | 'fixed'; delay: number }; // spacing between retries
  removeOnComplete: KeepJobs; // when BullMQ may delete completed runs from Redis
  removeOnFail: KeepJobs; // when BullMQ may delete failed runs from Redis
}

export interface ReminderJobData {
  orderId: string;
  notificationNo: number;
}
