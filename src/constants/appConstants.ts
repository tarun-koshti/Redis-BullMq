import type { QueueSettings } from '../interfaces/queue';

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
