// core/logger — pino JSON + redaction PII/secret + requestId binding
// (SDD §5.1, §17; ADR-017). Log TIDAK pernah memuat token/OTP/kunci — deny
// list di bawah; kunci baru bermuatan credential WAJIB ditambahkan di sini
// (kebijakan deny-by-default, direview di PR-013/014).
import { pino, type Logger, type DestinationStream } from "pino";
import { pinoHttp, type HttpLogger } from "pino-http";
import { randomUUID } from "node:crypto";
import type { Env } from "../config/index.js";

export type { Logger } from "pino";

/** Placeholder pengganti nilai sensitif pada log. */
export const REDACTED = "[RAHASIA]";

/**
 * Deny list redaction awal (PR-006). Wildcard `*` = kedalaman satu level;
 * path req.headers menutup header masuk dari pino-http.
 */
export const REDACTION_PATHS: string[] = [
  // Header HTTP (serializer pino-http meletakkan di req.headers.*)
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  // Field payload/objek log — level atas dan satu level bersarang.
  ...[
    "authorization",
    "cookie",
    "otp",
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "fieldKey",
    "apiKey",
    "secret",
  ].flatMap((key) => [key, `*.${key}`]),
];

export interface LoggerOptions {
  /** Override tujuan output (test menangkap stream). Default: stdout. */
  destination?: DestinationStream;
  /**
   * Nama service pada setiap baris log. Default "api"; apps/worker
   * memakai "worker". Diberikan di sini, BUKAN lewat `.child({service})`,
   * karena child tidak menimpa `base` — hasilnya baris JSON dengan kunci
   * `service` ganda (terlihat di manual verification PR-015).
   */
  service?: string;
}

/** Logger dasar aplikasi — JSON satu baris per event, siap dikonsumsi Dozzle. */
export function createLogger(env: Pick<Env, "LOG_LEVEL">, options: LoggerOptions = {}): Logger {
  return pino(
    {
      level: env.LOG_LEVEL,
      base: { service: options.service ?? "api" },
      redact: { paths: REDACTION_PATHS, censor: REDACTED },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    options.destination,
  );
}

/**
 * Middleware pino-http: setiap request mendapat requestId (uuid v4) dan
 * req.log = child logger ber-binding requestId — semua baris request-scoped
 * otomatis memuatnya. req.id diteruskan untuk envelope error (PR-007) dan
 * audit (PR-014).
 */
export function createHttpLogger(logger: Logger): HttpLogger {
  return pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    customProps: (req) => ({ requestId: req.id }),
    customLogLevel: (_req, res, err) => {
      if (err !== undefined || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    autoLogging: true,
  });
}
