import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Necessary for our error middleware as express doesn't catch promise rejections from async handlers
export function asyncHandler<R extends Request = Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as R, res, next)).catch(next);
  };
}
