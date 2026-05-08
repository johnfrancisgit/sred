import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../errors/app-error.js';

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(AppError.badRequest('Invalid request body', { issues: result.error.issues }));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(AppError.badRequest('Invalid query parameters', { issues: result.error.issues }));
    }
    Object.assign(req.query, result.data);
    next();
  };
}

export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(AppError.badRequest('Invalid path parameters', { issues: result.error.issues }));
    }
    Object.assign(req.params, result.data);
    next();
  };
}
