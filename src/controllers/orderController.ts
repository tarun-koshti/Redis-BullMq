import type { Request, Response, NextFunction } from 'express';
import { OrderModel } from '../models/order';
import { scheduleReminder, cancelReminder } from '../services/orderReminders';
import { AppError } from '../exceptions/appError';

// Create an order and schedule the first "still unpaid" reminder.
export async function createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { item, amount } = req.body;
    if (!item || typeof amount !== 'number') {
      throw new AppError('item (string) and amount (number) are required', 400);
    }

    const order = await OrderModel.create({ item, amount });

    try {
      const jobId = await scheduleReminder(order.id, 1);
      order.reminderJobId = jobId; // keep the in-memory doc in sync for the response
    } catch (err) {
      // The reminder could not be scheduled (e.g. Redis is down). Don't keep an
      // order that would never be reminded: remove it and tell the client to
      // retry, so an error response never leaves a hidden order behind.
      await OrderModel.deleteOne({ _id: order._id });
      console.error('Could not schedule reminder:', (err as Error).message);
      throw new AppError('could not schedule reminder, please retry', 503);
    }

    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

// Pay for an order and cancel its reminder chain permanently.
export async function payOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await OrderModel.findById(req.params.id);
    if (!order) {
      throw new AppError('order not found', 404);
    }

    if (order.status === 'paid') {
      res.json({ order, note: 'already paid' });
      return;
    }

    // Mark paid first, so any reminder racing this request sees `paid` and no-ops.
    order.status = 'paid';
    await order.save();

    // Then remove the one pending reminder — this ends the chain permanently.
    // If Redis is unreachable this fails, but the payment is already saved and
    // the worker's paid-status check stops the reminder when it runs, so the
    // payment still succeeds.
    try {
      await cancelReminder(order.id);
      order.reminderJobId = null;
    } catch (err) {
      console.error('Could not cancel reminder (it will no-op when it runs):', (err as Error).message);
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await OrderModel.findById(req.params.id);
    if (!order) {
      throw new AppError('order not found', 404);
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
}
