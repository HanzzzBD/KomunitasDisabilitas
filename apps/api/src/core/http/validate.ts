// validate({body?, query?, params?}) — validasi input via skema zod dari
// packages/schemas (konvensi global CLAUDE.md §5.1). Gagal → ZodError →
// error handler global memetakan ke envelope VALIDATION_ERROR 400.
import type { RequestHandler } from "express";
import type { z } from "zod";

export interface ValidateSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * req.body/query/params diganti hasil parse (typed & ter-strip default zod)
 * sehingga controller menerima data yang SUDAH tervalidasi.
 */
export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // Express 5/4 dengan getter query: tulis via defineProperty agar aman.
        const parsedQuery: unknown = schemas.query.parse(req.query);
        Object.defineProperty(req, "query", { value: parsedQuery, writable: true });
      }
      if (schemas.params) {
        const parsedParams: unknown = schemas.params.parse(req.params);
        Object.defineProperty(req, "params", { value: parsedParams, writable: true });
      }
      next();
    } catch (err) {
      next(err); // ZodError → errorHandler
    }
  };
}
