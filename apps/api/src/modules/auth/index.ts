// modules/auth — wiring modul (DI manual via factory, ADR-002).
//
// Deny-by-default per fitur: OTP butuh OTP_HASH_SECRET, Google butuh pasangan
// GOOGLE_CLIENT_ID/SECRET. Yang kredensialnya kosong menjawab 503 — API tetap
// bisa di-boot tanpa kredensial apa pun (dev), tetapi tidak pernah berjalan
// dalam mode "aman setengah" (hash tanpa kunci / audience tidak diperiksa).
import type { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuditLog } from "../../core/audit/index.js";
import type { Logger } from "../../core/logger/index.js";
import { createOtpRepository, type OtpRedisLike } from "./repositories/otp.repository.js";
import { createAuthUserRepository } from "./repositories/user.repository.js";
import { createOtpService } from "./services/otp.service.js";
import { createOtpController } from "./controllers/otp.controller.js";
import { createGoogleService } from "./services/google.service.js";
import { createGoogleController } from "./controllers/google.controller.js";
import { createGoogleIdTokenVerifier } from "./services/google-id-token.js";
import { createGoogleCodeExchange } from "./services/google-token.js";
import { createAuthRouter, type AuthControllers } from "./routers/index.js";
import { createUnavailableOtpSender, type OtpSender } from "./services/otp-sender.js";
import type { FetchLike } from "./services/fonnte.sender.js";

/** Konfigurasi login Google; undefined = fitur dimatikan (503). */
export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  jwksUrl: string;
  tokenUrl: string;
  timeoutMs: number;
  /** Disuntik test; produksi memakai fetch global. */
  fetchImpl?: FetchLike;
}

export interface AuthModuleDeps {
  prisma: PrismaClient;
  /** Klien Redis CACHE (bukan queue) — OTP berumur pendek dan boleh ter-evict. */
  redis: OtpRedisLike;
  /** env.OTP_HASH_SECRET; undefined = endpoint OTP tertutup (503). */
  otpHashSecret: string | undefined;
  /** Adapter pengirim OTP; default "belum dikonfigurasi". */
  sender?: OtpSender;
  /** undefined = endpoint Google tertutup (503). */
  google?: GoogleAuthConfig;
  auditLog: AuditLog;
  logger: Pick<Logger, "error" | "warn">;
}

export function createAuthModule(deps: AuthModuleDeps): Router {
  const userRepository = createAuthUserRepository(deps.prisma);
  const controllers: AuthControllers = { otp: null, google: null };

  if (deps.otpHashSecret === undefined) {
    deps.logger.warn({ modul: "auth" }, "OTP_HASH_SECRET belum di-set — endpoint OTP dimatikan (503)");
  } else {
    controllers.otp = createOtpController(
      createOtpService({
        otpRepository: createOtpRepository({ redis: deps.redis, secret: deps.otpHashSecret }),
        userRepository,
        sender: deps.sender ?? createUnavailableOtpSender(),
        auditLog: deps.auditLog,
        logger: deps.logger,
      }),
    );
  }

  if (deps.google === undefined) {
    deps.logger.warn(
      { modul: "auth" },
      "Kredensial Google OAuth belum di-set — endpoint /auth/google dimatikan (503)",
    );
  } else {
    const { clientId, clientSecret, jwksUrl, tokenUrl, timeoutMs, fetchImpl } = deps.google;
    controllers.google = createGoogleController(
      createGoogleService({
        // Verifier dibuat SEKALI di sini: ia menyimpan kunci publik Google di
        // memori. Membuatnya per-permintaan berarti satu HTTP ke Google per login.
        verifier: createGoogleIdTokenVerifier({ clientId, jwksUrl, timeoutMs }),
        exchange: createGoogleCodeExchange(
          { clientId, clientSecret, tokenUrl, timeoutMs },
          deps.logger,
          fetchImpl,
        ),
        userRepository,
        auditLog: deps.auditLog,
      }),
    );
  }

  return createAuthRouter(controllers);
}

/**
 * Rakit konfigurasi Google dari env. Kelengkapan pasangan client id/secret
 * sudah dijamin core/config (boot GAGAL bila separuh), jadi di sini cukup
 * memeriksa keberadaannya untuk menentukan fitur menyala atau tidak.
 */
export function createGoogleConfigFromEnv(
  env: {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_JWKS_URL: string;
    GOOGLE_TOKEN_URL: string;
    GOOGLE_HTTP_TIMEOUT_MS: number;
  },
  fetchImpl?: FetchLike,
): GoogleAuthConfig | undefined {
  if (env.GOOGLE_CLIENT_ID === undefined || env.GOOGLE_CLIENT_SECRET === undefined) return undefined;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    jwksUrl: env.GOOGLE_JWKS_URL,
    tokenUrl: env.GOOGLE_TOKEN_URL,
    timeoutMs: env.GOOGLE_HTTP_TIMEOUT_MS,
    fetchImpl,
  };
}

export { createOtpService, OTP_POLICY, type OtpService } from "./services/otp.service.js";
export {
  buildOtpMessage,
  createFallbackOtpSender,
  createOtpSenderFromEnv,
  createUnavailableOtpSender,
  OtpSenderError,
  type OtpMessage,
  type OtpSender,
} from "./services/otp-sender.js";
export {
  createGoogleIdTokenVerifier,
  parseGoogleIdentity,
  GOOGLE_CLOCK_TOLERANCE_SECONDS,
  GOOGLE_ISSUERS,
  type GoogleIdentity,
  type GoogleIdTokenVerifier,
  type GoogleIdTokenVerifierConfig,
} from "./services/google-id-token.js";
export {
  createGoogleCodeExchange,
  type GoogleCodeExchange,
  type GoogleExchangeInput,
  type GoogleTokenExchangeConfig,
} from "./services/google-token.js";
export { createGoogleService, type GoogleService } from "./services/google.service.js";
export { createFonnteSender, FONNTE_PROVIDER, type FetchLike } from "./services/fonnte.sender.js";
export { createTwilioSender, TWILIO_PROVIDER } from "./services/twilio.sender.js";
