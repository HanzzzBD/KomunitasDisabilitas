// modules/auth — logika login OTP (SDD §8.1, PRD FR-1.2).
//
// Alur: request (limiter kirim → buat kode → kirim) dan verify (lockout →
// cocokkan hash → find-or-create user). Kode OTP hidup hanya di variabel lokal
// fungsi request(): tidak pernah dikembalikan, di-log, atau masuk audit.
import { randomInt } from "node:crypto";
import { AUDIT_ACTION, type RequestOtp, type VerifyOtp } from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import type { Logger } from "../../../core/logger/index.js";
import type { OtpRepository } from "../repositories/otp.repository.js";
import type { AuthUserRepository } from "../repositories/user.repository.js";
import { OtpSenderError, type OtpSender } from "./otp-sender.js";
import type { SessionService, SessionTokens } from "./session.service.js";

/**
 * Angka kebijakan SDD §8.1 — satu tempat, dipakai service DAN test.
 * Tangga lockout: hangus ke-1 → 5 menit, ke-2 → 15 menit, ke-3+ → 60 menit.
 */
export const OTP_POLICY = {
  ttlSeconds: 300,
  maxAttempts: 5,
  maxSendPerWindow: 3,
  sendWindowSeconds: 3600,
  lockoutLadderSeconds: [300, 900, 3600],
  strikeWindowSeconds: 86_400,
} as const;

/** Entitas audit modul ini (tanpa PII — nomor tidak pernah ikut). */
const AUDIT_ENTITY = "auth.otp";

export interface OtpServiceDeps {
  otpRepository: OtpRepository;
  userRepository: AuthUserRepository;
  sender: OtpSender;
  /** Penerbit pasangan token (PR-018b) — verify berakhir dengan sesi, bukan userId telanjang. */
  sessionService: Pick<SessionService, "issue">;
  auditLog: AuditLog;
  logger: Pick<Logger, "error" | "warn">;
}

/** Konteks pemanggil untuk audit; belum ada user saat pre-auth. */
export interface OtpActor {
  requestId: string;
}

/** Kode 6 angka dari CSPRNG (bukan Math.random). "000123" tetap valid. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function lockoutSecondsFor(strike: number): number {
  const tangga = OTP_POLICY.lockoutLadderSeconds;
  const index = Math.min(Math.max(strike, 1), tangga.length) - 1;
  return tangga[index] ?? tangga[tangga.length - 1] ?? 0;
}

export function createOtpService(deps: OtpServiceDeps) {
  const { otpRepository, userRepository, sender, sessionService, auditLog, logger } = deps;

  const auditGagal = (actor: OtpActor, reason: "otpInvalid" | "rateLimited" | "accountLocked") => {
    auditLog({ actorId: null, requestId: actor.requestId }, AUDIT_ACTION.AUTH_LOGIN_FAILED, AUDIT_ENTITY, null, { reason });
  };

  /** Lockout aktif → tolak sebelum menyentuh kode/kuota apa pun. */
  async function tolakBilaTerkunci(phone: string, actor: OtpActor): Promise<void> {
    const sisa = await otpRepository.lockRemainingSeconds(phone);
    if (sisa <= 0) return;
    auditGagal(actor, "accountLocked");
    throw appError("TERLALU_BANYAK_PERCOBAAN", { retryAfterSeconds: sisa });
  }

  /**
   * Cocokkan kode untuk sebuah nomor: lockout → kode masih ada → pencacah
   * percobaan → cocok → hanguskan. TIDAK menyentuh tabel users dan tidak
   * menerbitkan sesi apa pun.
   *
   * Dipisah dari `verify()` karena konfirmasi hapus akun (PR-021) memerlukan
   * pembuktian yang SAMA PERSIS tanpa akibat login. Menyalinnya ke sana akan
   * melahirkan tangga lockout kedua yang bebas menyimpang — dan pencacah yang
   * tidak sinkron pada jalur anti-brute-force adalah kelemahan yang tidak
   * menimbulkan gejala sampai ada yang memanfaatkannya.
   *
   * Kegagalannya tetap diaudit sebagai AUTH_LOGIN_FAILED apa pun pemanggilnya:
   * yang terjadi memang percobaan kredensial yang gagal atas nomor itu, dan
   * memisahkan sinyalnya per-pemanggil justru memecah pola yang ingin dilihat.
   */
  async function konfirmasiKode(phone: string, code: string, actor: OtpActor): Promise<void> {
    await tolakBilaTerkunci(phone, actor);

    const hash = await otpRepository.readCodeHash(phone);
    if (hash === null) {
      auditGagal(actor, "otpInvalid");
      throw appError("KODE_OTP_HANGUS");
    }

    const percobaan = await otpRepository.bumpAttempt(phone, OTP_POLICY.ttlSeconds);
    if (percobaan > OTP_POLICY.maxAttempts) {
      // Percobaan ke-6: kode hangus, lockout progresif menyala.
      await otpRepository.dropCode(phone);
      const strike = await otpRepository.bumpStrike(phone, OTP_POLICY.strikeWindowSeconds);
      const kunciDetik = lockoutSecondsFor(strike);
      await otpRepository.lock(phone, kunciDetik);
      auditGagal(actor, "accountLocked");
      throw appError("TERLALU_BANYAK_PERCOBAAN", { retryAfterSeconds: kunciDetik });
    }

    if (!otpRepository.matches(phone, code, hash)) {
      auditGagal(actor, "otpInvalid");
      const sisa = OTP_POLICY.maxAttempts - percobaan;
      throw appError("KODE_OTP_SALAH", {
        hint:
          sisa > 0
            ? `Sisa ${sisa} percobaan sebelum kode dihanguskan`
            : "Percobaan berikutnya akan menghanguskan kode — minta kode baru",
      });
    }

    await otpRepository.clearAfterSuccess(phone);
  }

  return {
    konfirmasiKode,

    /** POST /auth/otp/request — kirim kode baru bila kuota masih ada. */
    async request(input: RequestOtp, actor: OtpActor): Promise<{ retryAfterSeconds: number }> {
      const { phone } = input;
      await tolakBilaTerkunci(phone, actor);

      const kirim = await otpRepository.bumpSend(phone, OTP_POLICY.sendWindowSeconds);
      if (kirim.value > OTP_POLICY.maxSendPerWindow) {
        auditGagal(actor, "rateLimited");
        throw appError("TERLALU_BANYAK_PERMINTAAN", {
          message: "Kode sudah dikirim beberapa kali",
          hint: "Tunggu sesuai waktu yang diberitahukan sebelum meminta kode lagi",
          retryAfterSeconds: kirim.resetInSeconds,
        });
      }

      const code = generateOtpCode();
      await otpRepository.saveCode(phone, code, OTP_POLICY.ttlSeconds);

      try {
        await sender.send({ phone, code });
      } catch (err) {
        // Kode yang tidak pernah sampai tidak boleh menggantung 5 menit.
        await otpRepository.dropCode(phone);
        logger.error(
          { provider: err instanceof OtpSenderError ? err.provider : "tidak diketahui" },
          "Gagal mengirim kode OTP",
        );
        throw appError("BELUM_SIAP", {
          message: "Pengiriman kode sedang bermasalah",
          hint: "Coba lagi beberapa saat, atau masuk dengan Google",
        });
      }

      // 0 = kuota jam berjalan masih tersisa; selain itu, tunggu jendela reset.
      return {
        retryAfterSeconds:
          kirim.value >= OTP_POLICY.maxSendPerWindow ? kirim.resetInSeconds : 0,
      };
    },

    /** POST /auth/otp/verify — cocokkan kode, find-or-create user, terbitkan sesi. */
    async verify(
      // `client` sengaja TIDAK ikut: di mana token diserahkan (cookie vs body)
      // adalah urusan transport, bukan logika masuk.
      input: Pick<VerifyOtp, "phone" | "code">,
      actor: OtpActor,
    ): Promise<{ userId: string; isNewUser: boolean; tokens: SessionTokens }> {
      const { phone, code } = input;
      await konfirmasiKode(phone, code, actor);
      const user = await userRepository.findOrCreateByPhone(phone);

      // Sesi diterbitkan SETELAH kode dihanguskan: bila penerbitan gagal,
      // kode yang sudah dipakai tidak boleh hidup lagi untuk dicoba ulang.
      const tokens = await sessionService.issue(user.id);

      auditLog(
        { actorId: user.id, requestId: actor.requestId },
        AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED,
        AUDIT_ENTITY,
        user.id,
        { method: "otp", isNewUser: user.isNew },
      );

      return { userId: user.id, isNewUser: user.isNew, tokens };
    },
  };
}

export type OtpService = ReturnType<typeof createOtpService>;
