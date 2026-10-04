import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../exceptions/appError';

// Global error handler. Controllers forward errors here via next(err).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Known, operational errors carry their own status code and safe message.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Mongoose rejected the input (a value of the wrong type, a failed schema
  // validation). That is the client's mistake, so it's a 400, not a 500.
  if (err instanceof mongoose.Error.CastError || err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Anything else is unexpected — log it and return a generic 500.
  console.error(err);
  res.status(500).json({ error: 'internal error' });
};
