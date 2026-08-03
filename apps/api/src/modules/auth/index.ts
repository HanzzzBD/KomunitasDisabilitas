// modules/auth — wiring modul (DI manual via factory, ADR-002).
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AuditLog } from "../../core/audit/index.js";
import { appError, asyncHandler } from "../../core/http/index.js";
import type { Logger } from "../../core/logger/index.js";
import { createOtpRepository, type OtpRedisLike } from "./repositories/otp.repository.js";
import { createAuthUserRepository } from "./repositories/user.repository.js";
import { createOtpService } from "./services/otp.service.js";
import { createOtpController } from "./controllers/otp.controller.js";
import { createAuthRouter } from "./routers/index.js";
import { createUnavailableOtpSender, type OtpSender } from "./services/otp-sender.js";

export interface AuthModuleDeps {
  prisma: PrismaClient;
  /** Klien Redis CACHE (bukan queue) — OTP berumur pendek dan boleh ter-evict. */
  redis: OtpRedisLike;
  /** env.OTP_HASH_SECRET; undefined = endpoint OTP tertutup (503). */
  otpHashSecret: string | undefined;
  /** Adapter pengirim; default "belum dikonfigurasi" sampai PR-016b. */
  sender?: OtpSender;
  auditLog: AuditLog;
  logger: Pick<Logger, "error" | "warn">;
}

/**
 * Tanpa OTP_HASH_SECRET, hash OTP akan lahir tanpa kunci — itu lebih buruk
 * daripada endpoint yang tidak melayani. Jadi: 503, bukan degradasi diam-diam.
 */
function createRouterTertutup(): Router {
  const router = Router();
  router.all(
    "/auth/otp/*",
    asyncHandler(() => {
      throw appError("BELUM_SIAP", {
        message: "Masuk dengan kode OTP belum tersedia",
        hint: "Coba lagi nanti, atau masuk dengan Google",
      });
    }),
  );
  return router;
}

export function createAuthModule(deps: AuthModuleDeps): Router {
  if (deps.otpHashSecret === undefined) {
    deps.logger.warn(
      { modul: "auth" },
      "OTP_HASH_SECRET belum di-set — endpoint OTP dimatikan (503)",
    );
    return createRouterTertutup();
  }

  const service = createOtpService({
    otpRepository: createOtpRepository({ redis: deps.redis, secret: deps.otpHashSecret }),
    userRepository: createAuthUserRepository(deps.prisma),
    sender: deps.sender ?? createUnavailableOtpSender(),
    auditLog: deps.auditLog,
    logger: deps.logger,
  });

  return createAuthRouter(createOtpController(service));
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
export { createFonnteSender, FONNTE_PROVIDER, type FetchLike } from "./services/fonnte.sender.js";
export { createTwilioSender, TWILIO_PROVIDER } from "./services/twilio.sender.js";
