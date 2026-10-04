// Operational error carrying an HTTP status code. Throw this from anywhere
// (e.g. controllers) and the global error handler turns it into a response.
export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
