export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTEGRATION_ERROR'
  | 'COOKIE_EXPIRED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly safeMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(opts: {
    code: AppErrorCode;
    httpStatus: number;
    safeMessage: string;
    cause?: unknown;
    details?: Record<string, unknown>;
  }) {
    super(opts.safeMessage, { cause: opts.cause });
    this.name = 'AppError';
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.safeMessage = opts.safeMessage;
    this.details = opts.details;
  }

  static badRequest(safeMessage: string, details?: Record<string, unknown>): AppError {
    return new AppError({ code: 'BAD_REQUEST', httpStatus: 400, safeMessage, details });
  }
  static unauthorized(safeMessage = 'Unauthorized'): AppError {
    return new AppError({ code: 'UNAUTHORIZED', httpStatus: 401, safeMessage });
  }
  static forbidden(safeMessage = 'Forbidden'): AppError {
    return new AppError({ code: 'FORBIDDEN', httpStatus: 403, safeMessage });
  }
  static notFound(safeMessage = 'Not found'): AppError {
    return new AppError({ code: 'NOT_FOUND', httpStatus: 404, safeMessage });
  }
  static integration(safeMessage: string, cause?: unknown): AppError {
    return new AppError({ code: 'INTEGRATION_ERROR', httpStatus: 502, safeMessage, cause });
  }
  static cookieExpired(): AppError {
    return new AppError({
      code: 'COOKIE_EXPIRED',
      httpStatus: 401,
      safeMessage: 'Airtable session cookies expired; re-authentication required.',
    });
  }
}
