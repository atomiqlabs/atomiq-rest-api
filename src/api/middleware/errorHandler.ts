import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../../types/api';

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[ErrorHandler]', error);

  const response: ErrorResponse = {
    error: error.name || 'Error',
    message: error.message || 'An unexpected error occurred',
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.details = { stack: error.stack };
  }

  res.status(500).json(response);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ErrorResponse = {
    error: 'NotFound',
    message: `Route not found: ${req.method} ${req.path}`,
  };
  res.status(404).json(response);
}

/**
 * Async handler wrapper to catch promise rejections
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
