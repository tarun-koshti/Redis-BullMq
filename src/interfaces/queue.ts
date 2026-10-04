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

export interface ReminderJobData {
  orderId: string;
  notificationNo: number;
}
