import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import pino from 'pino';
import { errorHandler } from './error-middleware.js';
import { AppError } from './app-error.js';

const logger = pino({ level: 'silent' });

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

const noopReq = {} as Request;
const noopNext = () => undefined;

describe('errorHandler — AppError -> HTTP status mapping', () => {
  it('maps AppError.unauthorized() to 401', () => {
    const handler = errorHandler(logger);
    const res = makeRes();
    handler(AppError.unauthorized('nope'), noopReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'nope', details: undefined },
    });
  });

  it('maps AppError.notFound() to 404', () => {
    const handler = errorHandler(logger);
    const res = makeRes();
    handler(AppError.notFound('missing'), noopReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'missing', details: undefined },
    });
  });

  it('maps AppError.integration() to 502', () => {
    const handler = errorHandler(logger);
    const res = makeRes();
    handler(AppError.integration('upstream blew up'), noopReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTEGRATION_ERROR', message: 'upstream blew up', details: undefined },
    });
  });

  it('maps AppError.badRequest() (validation-shaped) to 400 with details', () => {
    const handler = errorHandler(logger);
    const res = makeRes();
    const issues = [{ path: ['email'], message: 'Invalid email' }];
    handler(AppError.badRequest('Invalid request body', { issues }), noopReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'Invalid request body', details: { issues } },
    });
  });

  it('non-AppError is mapped to a generic 500 (no leak of internal message)', () => {
    const handler = errorHandler(logger);
    const res = makeRes();
    handler(new Error('mongo password was 12345'), noopReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
  });
});
