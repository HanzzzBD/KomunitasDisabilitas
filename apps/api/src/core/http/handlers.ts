// notFound + error handler global — SEMUA respons error keluar lewat sini
// dalam bentuk envelope {code, message, hint} (SDD §11).
// Stack trace & detail internal HANYA ke logger (ber-requestId), tidak pernah
// ke klien.
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import type { Logger } from "../logger/index.js";
import { AppError, appError } from "./errors.js";

/** 404 untuk rute yang tidak terdaftar — dipasang setelah semua router. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(appError("RUTE_TIDAK_DITEMUKAN"));
};

interface BodyParserError extends Error {
  type?: string;
  statusCode?: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    err instanceof Error && "type" in err && (err as BodyParserError).type === "entity.parse.failed"
  );
}

/** Semua error → AppError (mapping terpusat). */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join(".") ?? "";
    return appError("VALIDATION_ERROR", {
      hint: field === "" ? first?.message : `${field}: ${first?.message}`,
    });
  }
  if (isBodyParserError(err)) return appError("JSON_TIDAK_VALID");
  return appError("TERJADI_KESALAHAN");
}

/** Error handler global — dipasang paling akhir. */
export function errorHandler(fallbackLogger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const mapped = toAppError(err);
    const log = req.log ?? fallbackLogger;

    // Stack/objek error asli hanya ke log (baris ini membawa requestId dari
    // pino-http); envelope ke klien bersih dari detail internal.
    if (mapped.status >= 500) log.error({ err }, "Error tidak tertangani");
    else log.warn({ code: mapped.code }, "Request ditolak");

    if (res.headersSent) return; // response sudah mengalir — jangan ditimpa

    res.status(mapped.status).json(mapped.envelope);
  };
}
