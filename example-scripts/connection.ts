// connection.ts
// Shared Redis connection for the article demo. Matches the Redis the rest of
// the project uses (docker compose up -d redis).
export const connection = { host: '127.0.0.1', port: 6379 };

export const QUEUE_NAME = 'demo-reminders';

// Shape of the job body (what the scheduler passes as `data`).
// The retry settings travel WITH the job, so the manual retry worker
// (workerManualRetry.ts) can decide on its own whether to reschedule and how
// long to wait.
export interface ReminderJobData {
  orderId: string;
  reason: string;
  attempt: number; // which attempt this is, 1-based
  maxAttempts: number; // how many attempts to make in total before giving up
  retryDelayMs: number; // how long to wait before the next attempt
}
