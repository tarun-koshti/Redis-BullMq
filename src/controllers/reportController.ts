import type { Request, Response, NextFunction } from 'express';
import { AnalyticsModel } from '../models/analytics';
import { getScheduler, runSchedulerNow } from '../services/queue';
import { SCHEDULER_NAMES } from '../constants/appConstants';
import { AppError } from '../exceptions/appError';

const SCHEDULER = SCHEDULER_NAMES.ORDER_REPORTS;

// The latest reports, newest period first.
export async function listReports(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const reports = await AnalyticsModel.find().sort({ periodEnd: -1 }).limit(limit);
    res.json({ reports });
  } catch (err) {
    next(err);
  }
}

// The report schedule as stored in Redis, with its next run time.
export async function getSchedule(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let scheduler;
    try {
      scheduler = await getScheduler(SCHEDULER);
    } catch (err) {
      // Redis is unreachable (the queue fails fast instead of waiting, see
      // services/queue.ts). That's temporary, so tell the client to retry.
      console.error('Could not read the report schedule:', (err as Error).message);
      throw new AppError('could not read the report schedule, please retry', 503);
    }
    res.json({
      scheduler,
      nextRun: scheduler?.next ? new Date(scheduler.next).toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
}

// Queue one report run now, outside the schedule. The worker processes it, so
// the client gets 202 (accepted) with the job id, not the report itself.
export async function runReport(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let job;
    try {
      job = await runSchedulerNow(SCHEDULER);
    } catch (err) {
      // Redis is unreachable, so the run could not be queued. Nothing was
      // added, so the client can safely retry.
      console.error('Could not queue a report run:', (err as Error).message);
      throw new AppError('could not queue the report, please retry', 503);
    }
    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
}
