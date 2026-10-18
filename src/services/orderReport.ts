import { Job } from 'bullmq';
import { getFailedJobs } from './queue';
import { QUEUE_NAMES, SCHEDULER_CONFIG, SCHEDULER_NAMES } from '../constants/appConstants';
import { OrderModel } from '../models/order';
import { AnalyticsModel } from '../models/analytics';

const REPORT_TYPE = 'order-summary';
const { periodMs, tz } = SCHEDULER_CONFIG[SCHEDULER_NAMES.ORDER_REPORTS];

// Worker processor. Runs on every scheduled run (and on a manual run).
export async function processOrderReport(job: Job): Promise<void> {
  // The period ends at the run's SCHEDULED time, not at "now": a run that
  // starts late, or a retry, still reports the same period. A Job Scheduler
  // stores that time in `opts.prevMillis`; a manual run (added with
  // queue.add) uses the time it was added.
  const periodEnd = new Date(job.opts.prevMillis ?? job.timestamp);
  const periodStart = new Date(periodEnd.getTime() - periodMs);

  const [orders, failedReminders] = await Promise.all([
    summariseOrders(periodStart, periodEnd),
    countFailedReminders(periodStart, periodEnd),
  ]);

  // Upsert on (reportType, periodEnd): running the same period twice
  // overwrites the report instead of creating a second one.
  const report = await AnalyticsModel.findOneAndUpdate(
    { reportType: REPORT_TYPE, periodEnd },
    {
      periodStart,
      tz,
      ...orders,
      failedReminders,
      trigger: job.repeatJobKey ? 'schedule' : 'manual',
      generatedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  console.log(
    `Order report ${periodStart.toISOString()} to ${periodEnd.toISOString()}:`,
    JSON.stringify({ orders: report.orders, amount: report.amount, failedReminders }),
  );
}

// Orders created in the period, counted and summed by their current status.
async function summariseOrders(from: Date, to: Date) {
  const groups: { _id: 'pending' | 'paid'; count: number; amount: number }[] =
    await OrderModel.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]);

  const orders = { total: 0, pending: 0, paid: 0 };
  const amount = { total: 0, pending: 0, paid: 0 };
  for (const group of groups) {
    orders[group._id] = group.count;
    amount[group._id] = group.amount;
    orders.total += group.count;
    amount.total += group.amount;
  }
  return { orders, amount };
}

// Reminder jobs that failed all their tries during the period. BullMQ keeps
// them in the queue's failed set (for 7 days, see `removeOnFail`), with the
// time they failed in `finishedOn`.
async function countFailedReminders(from: Date, to: Date): Promise<number> {
  const failed = await getFailedJobs(QUEUE_NAMES.ORDER_REMINDERS);
  return failed.filter(
    (job) => job.finishedOn && job.finishedOn >= from.getTime() && job.finishedOn < to.getTime(),
  ).length;
}
