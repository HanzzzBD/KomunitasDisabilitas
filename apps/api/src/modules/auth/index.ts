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
import { createRefreshTokenRepository } from "./repositories/refresh-token.repository.js";
import { createSessionService, type SessionService } from "./services/session.service.js";
import { createSessionController } from "./controllers/session.controller.js";
import { createSessionCookie } from "./controllers/session-cookie.js";
import {
  createTokenService,
  type RouteRegistrar,
  type SessionKeys,
  type SessionUserLookup,
} from "../../core/auth/index.js";
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
  /**
   * Pasangan kunci RS256 (PR-018a); undefined = sesi tidak bisa diterbitkan,
   * sehingga /auth/refresh DAN kedua metode masuk sama-sama menjawab 503.
   */
  sessionKeys?: SessionKeys;
  /** `Secure` pada cookie refresh; dimatikan hanya untuk dev di http localhost. */
  cookieSecure?: boolean;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  auditLog: AuditLog;
  logger: Pick<Logger, "error" | "warn">;
}

export function createAuthModule(deps: AuthModuleDeps): Router {
  const userRepository = createAuthUserRepository(deps.prisma);
  const controllers: AuthControllers = { otp: null, google: null, session: null };

  // Sesi dirakit LEBIH DULU: kedua metode masuk bergantung padanya. Login yang
  // tidak bisa menerbitkan sesi bukan login — jadi tanpa kunci, keduanya ikut
  // tertutup, bukan berhasil lalu mengembalikan userId telanjang.
  let sessionService: SessionService | undefined;
  if (deps.sessionKeys === undefined) {
    deps.logger.warn(
      { modul: "auth" },
      "Kunci sesi JWT belum di-set — /auth/refresh dan kedua metode masuk dimatikan (503)",
    );
  } else {
    sessionService = createSessionService({
      // Dirakit sekali: kunci diurai saat boot, bukan per permintaan.
      tokenService: createTokenService(deps.sessionKeys),
      userRepository,
      refreshTokenRepository: createRefreshTokenRepository(deps.prisma),
      auditLog: deps.auditLog,
    });
    controllers.session = createSessionController({
      service: sessionService,
      cookie: createSessionCookie({ secure: deps.cookieSecure ?? true }),
    });
  }

  // Kedua metode masuk butuh DUA hal: kredensialnya sendiri, dan penerbit sesi.
  const sesi = controllers.session;

  if (deps.otpHashSecret === undefined) {
    deps.logger.warn({ modul: "auth" }, "OTP_HASH_SECRET belum di-set — endpoint OTP dimatikan (503)");
  } else if (sesi !== null && sessionService !== undefined) {
    controllers.otp = createOtpController(
      createOtpService({
        otpRepository: createOtpRepository({ redis: deps.redis, secret: deps.otpHashSecret }),
        userRepository,
        sender: deps.sender ?? createUnavailableOtpSender(),
        sessionService,
        auditLog: deps.auditLog,
        logger: deps.logger,
      }),
      sesi,
    );
  }

  if (deps.google === undefined) {
    deps.logger.warn(
      { modul: "auth" },
      "Kredensial Google OAuth belum di-set — endpoint /auth/google dimatikan (503)",
    );
  } else if (sesi !== null && sessionService !== undefined) {
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
        sessionService,
        auditLog: deps.auditLog,
      }),
      sesi,
    );
  }

  return createAuthRouter(controllers, deps.routes);
}

/**
 * Sumber identitas untuk `requireAuth` (PR-019). Dipasang di composition root
 * supaya core/auth tetap bebas Prisma — barrel-nya di-import STATIS oleh
 * gerbang fail-fast di index.ts, dan import Prisma di sana akan memuat .env
 * lebih dulu sehingga gerbangnya terlangkahi.
 *
 * Memakai `findActiveSessionUser` yang sama dengan penerbitan/perpanjangan
 * sesi: satu definisi "user yang boleh berjalan", jadi akun terhapus tidak
 * mungkin lolos di satu jalur tetapi tertahan di jalur lain.
 */
export function createSessionUserSource(prisma: PrismaClient): SessionUserLookup {
  const repository = createAuthUserRepository(prisma);
  return (userId) => repository.findActiveSessionUser(userId);
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
export {
  createSessionService,
  type SessionActor,
  type SessionService,
  type SessionTokens,
} from "./services/session.service.js";
export { createSessionCookie, REFRESH_COOKIE, type SessionCookie } from "./controllers/session-cookie.js";
export { createFonnteSender, FONNTE_PROVIDER, type FetchLike } from "./services/fonnte.sender.js";
export { createTwilioSender, TWILIO_PROVIDER } from "./services/twilio.sender.js";
