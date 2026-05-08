import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from './app-error.js';
import type { Logger } from '../logger/logger.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound());
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const reqLogger = (req as unknown as { log?: Logger }).log ?? logger;
    if (err instanceof AppError) {
      const level = err.httpStatus >= 500 ? 'error' : 'warn';
      reqLogger[level](
        { code: err.code, status: err.httpStatus, details: err.details, cause: err.cause },
        err.safeMessage,
      );
      res.status(err.httpStatus).json({
        error: { code: err.code, message: err.safeMessage, details: err.details },
      });
      return;
    }
    reqLogger.error({ err }, 'Unhandled error');
    res.status(500).json({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
  };
}
