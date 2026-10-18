// cronQueue.ts
// Shared names for the cron example (cronScheduler.ts + cronWorker.ts). Uses
// the same Redis connection as the other examples (connection.ts).
export const CRON_QUEUE_NAME = 'demo-reports';

// The scheduler's id. Upserting the same id again updates this one scheduler;
// a different id creates a second one.
export const SCHEDULER_ID = 'demo-report';
