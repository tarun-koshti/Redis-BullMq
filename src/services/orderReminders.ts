import { Job } from 'bullmq';
import { addJob, removeJob } from './queue';
import { QUEUE_NAMES, QUEUE_CONFIG } from '../constants/appConstants';
import { OrderModel } from '../models/order';
import { ReminderJobData } from '../interfaces/queue';

const QUEUE = QUEUE_NAMES.ORDER_REMINDERS;
const { maxNotifications } = QUEUE_CONFIG[QUEUE];

// Deterministic job id per (order, reminder number). Because it is
// deterministic, re-scheduling the same reminder (e.g. when BullMQ retries the
// processor after a failed send) is a no-op instead of a duplicate job.
function reminderJobId(orderId: string, notificationNo: number): string {
  return `reminder:${orderId}:${notificationNo}`;
}

// Schedule reminder N for an order and record the pending job id on the order
// so it can be cancelled on payment.
export async function scheduleReminder(orderId: string, notificationNo: number): Promise<string> {
  const jobId = reminderJobId(orderId, notificationNo);
  await addJob<ReminderJobData>(QUEUE, { orderId, notificationNo }, { jobId });
  await OrderModel.findByIdAndUpdate(orderId, { reminderJobId: jobId });
  return jobId;
}

// Cancel the order's pending reminder permanently. Removing the one pending job
// ends the chain, because the next reminder is only scheduled once the current
// one runs.
export async function cancelReminder(orderId: string): Promise<void> {
  const order = await OrderModel.findById(orderId);
  if (!order?.reminderJobId) return;
  await removeJob(QUEUE, order.reminderJobId);
  await OrderModel.findByIdAndUpdate(orderId, { reminderJobId: null });
}

// Worker processor. Runs when a reminder's delay elapses.
export async function processReminder(job: Job<ReminderJobData>): Promise<void> {
  const { orderId, notificationNo } = job.data;
  const order = await OrderModel.findById(orderId);

  // Guard runs before any work: stop if the order is gone or already paid. This
  // also neutralises any reminder that slipped through a pay/cancel race — it
  // simply does nothing.
  if (!order || order.status === 'paid') return;

  // Advance the chain BEFORE sending, so a notification that fails all its
  // retries still does not break the chain. The deterministic job id keeps this
  // idempotent across BullMQ retries of this processor.
  if (notificationNo < maxNotifications) {
    await scheduleReminder(orderId, notificationNo + 1);
  } else {
    await OrderModel.findByIdAndUpdate(orderId, { reminderJobId: null });
  }

  // The actual notification. In production this could throw (email/SMS provider
  // down); BullMQ then retries it per `attempts` + `backoff`.
  await sendReminder(order.id, notificationNo);
}

async function sendReminder(orderId: string, notificationNo: number): Promise<void> {
  console.log(`Reminder ${notificationNo}/${maxNotifications}: order ${orderId} is still unpaid`);
}
