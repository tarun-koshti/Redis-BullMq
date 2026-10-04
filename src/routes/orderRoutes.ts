import { Router } from 'express';
import { isObjectIdOrHexString } from 'mongoose';
import { createOrder, payOrder, getOrder } from '../controllers/orderController';
import { AppError } from '../exceptions/appError';

// Mounted at /orders by the app.
export const orderRoutes = Router();

// Runs before every route with an :id. Rejects malformed ids with a clear 400,
// instead of letting Mongoose throw a CastError deeper in the controller.
orderRoutes.param('id', (_req, _res, next, id: string) => {
  if (!isObjectIdOrHexString(id)) {
    next(new AppError('invalid order id', 400));
    return;
  }
  next();
});

orderRoutes.post('/', createOrder);
orderRoutes.post('/:id/pay', payOrder);
orderRoutes.get('/:id', getOrder);
