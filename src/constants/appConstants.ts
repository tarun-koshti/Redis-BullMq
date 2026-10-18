import type { QueueSettings, SchedulerSettings } from '../interfaces/queue';

export const QUEUE_NAMES = {
  ORDER_REMINDERS: 'order-reminders',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Queue tuning lives here (not in env) so it is versioned with the code. The
// env only carries connection configuration.
export const QUEUE_CONFIG: Record<QueueName, QueueSettings> = {
  [QUEUE_NAMES.ORDER_REMINDERS]: {
    jobName: 'unpaid-reminder',
    delay: 30_000,
    maxNotifications: 3,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    // BullMQ keeps finished jobs forever by default. Keep completed reminders
    // for 24h — the deterministic job id only de-duplicates while the job still
    // exists, so this must outlive the reminder chain — and failed ones for 7
    // days, for debugging. `age` is in seconds.
    removeOnComplete: { age: 24 * 60 * 60 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
};

// Recurring jobs. Each one has its own queue, named here, and runs on a cron
// pattern instead of a delay.
export const SCHEDULER_NAMES = {
  ORDER_REPORTS: 'order-reports',
} as const;

export type SchedulerName = (typeof SCHEDULER_NAMES)[keyof typeof SCHEDULER_NAMES];

export const SCHEDULER_CONFIG: Record<SchedulerName, SchedulerSettings> = {
  [SCHEDULER_NAMES.ORDER_REPORTS]: {
    schedulerId: 'daily-order-report',
    jobName: 'order-report',
    // Cron fields: minute hour day-of-month month day-of-week.
    // '0 0 * * *' = every day at 00:00 in `tz`. For testing, use '* * * * *'
    // (every minute) and set periodMs to 60_000.
    pattern: '0 0 * * *',
    tz: 'Asia/Kolkata',
    // One report covers the `periodMs` before its scheduled run time. Keep it
    // at 7 days or less: failed reminders are only kept for 7 days.
    periodMs: 24 * 60 * 60 * 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60 },
    removeOnFail: { age: 30 * 24 * 60 * 60 },
  },
};
