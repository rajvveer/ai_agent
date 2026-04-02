import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

/**
 * Global Express error handler.
 * - Catches all unhandled errors from route handlers and middleware
 * - Returns structured JSON error responses
 * - Logs errors with context (tenant, user, route)
 * - In production, could forward to Sentry
 */
export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode || 500;
  const isServerError = statusCode >= 500;

  // Log error with context
  const errorLog = {
    timestamp: new Date().toISOString(),
    error: err.message,
    code: err.code || 'INTERNAL_ERROR',
    statusCode,
    stack: isServerError ? err.stack : undefined,
    path: req.path,
    method: req.method,
    tenantId: req.tenantId || null,
    userId: req.userId || null,
  };

  if (isServerError) {
    console.error('[ERROR]', JSON.stringify(errorLog, null, 2));

    // TODO: Sentry.captureException(err, { extra: errorLog });
  } else {
    console.warn('[WARN]', JSON.stringify(errorLog));
  }

  // Don't expose internal error details in production
  const message = isServerError && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: err.code || 'INTERNAL_ERROR',
    message,
    ...(err.details && process.env.NODE_ENV !== 'production' ? { details: err.details } : {}),
  });
}

/**
 * Helper to create typed application errors
 */
export function createError(message: string, statusCode: number = 500, code?: string, details?: unknown): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}
