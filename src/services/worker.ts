import { Worker } from 'bullmq';
import { config } from '../config/config';
import { QUEUE_NAMES } from '../constants/appConstants';
import { processReminder } from './orderReminders';

// For this demo the worker runs in the same process as the API. In production
// you would usually run it as its own process so it can scale independently.
export const reminderWorker = new Worker(QUEUE_NAMES.ORDER_REMINDERS, processReminder, {
  connection: config.redis,
});

reminderWorker.on('failed', (job, err) => {
  console.error(
    `Reminder job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}):`,
    err.message,
  );
});

// Redis connection errors surface here. Without a listener, BullMQ prints a raw
// stack trace on every reconnect attempt, flooding the logs.
reminderWorker.on('error', (err) => {
  console.error('Reminder worker connection error:', err.message);
});
