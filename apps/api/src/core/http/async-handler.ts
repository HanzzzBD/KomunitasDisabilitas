// asyncHandler — propagasi error async ke error handler global (ADR-002:
// Express 4 tidak menangkap rejection handler async secara otomatis).
import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
