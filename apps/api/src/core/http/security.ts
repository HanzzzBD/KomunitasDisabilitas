// Security middleware dasar (SDD §8.4): helmet, CORS whitelist, rate limit
// global per IP. CSP ketat final & limit per endpoint = PR-105; Redis store
// rate limit = PR-008; rate limit OTP khusus = PR-016.
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import type { Env } from "../config/index.js";
import { ERROR_CATALOG, appError } from "./errors.js";

/** helmet dasar: nosniff, frame-deny, dsb. HSTS urusan Nginx/Cloudflare. */
export function createHelmet(): RequestHandler {
  return helmet({
    contentSecurityPolicy: false, // CSP ketat final di PR-105 (butuh inventaris aset FE)
    hsts: false, // TLS + HSTS ditangani edge (Cloudflare/Nginx, SDD §4)
    frameguard: { action: "deny" },
  });
}

/** CORS whitelist dari env CORS_ORIGINS (comma-separated, exact match). */
export function createCors(env: Pick<Env, "CORS_ORIGINS">): RequestHandler {
  const whitelist = new Set(
    env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ""),
  );
  return cors({
    origin: (origin, callback) => {
      // Tanpa header Origin (curl, server-to-server, same-origin) → lolos.
      if (origin === undefined || whitelist.has(origin)) callback(null, true);
      else callback(null, false); // origin asing → tanpa header CORS (browser memblokir)
    },
    credentials: true,
    maxAge: 600,
  });
}

/**
 * Rate limit global per IP — memory store (per proses) sampai Redis store
 * terpasang di PR-008. 429 → envelope katalog + header Retry-After (SDD §11).
 */
export function createGlobalRateLimit(
  env: Pick<Env, "RATE_LIMIT_MAX" | "RATE_LIMIT_WINDOW_MS">,
): RequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-7", // header RateLimit-* informatif
    legacyHeaders: false,
    handler: (_req, res) => {
      res.setHeader("Retry-After", Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000));
      res
        .status(ERROR_CATALOG.TERLALU_BANYAK_PERMINTAAN.status)
        .json(appError("TERLALU_BANYAK_PERMINTAAN").envelope);
    },
  });
}
