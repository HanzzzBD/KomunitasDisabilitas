// modules/auth — logika login Google (PR-017, PRD FR-1.1, SDD §8.1).
//
// Tiga langkah, urutannya adalah keamanannya:
//   1. tukar authorization code + PKCE  → id_token
//   2. verifikasi id_token lewat JWKS   → identitas tepercaya
//   3. find-or-create/link akun         → userId
// Tidak ada langkah yang boleh dilewati atau ditukar urutannya: langkah 3
// mempercayai email HANYA karena langkah 2 sudah membuktikan asalnya.
import { AUDIT_ACTION, type GoogleAuth } from "@nawasena/schemas";
import type { AuditLog } from "../../../core/audit/index.js";
import { AppError, appError } from "../../../core/http/index.js";
import type { ErrorCode } from "../../../core/http/index.js";
import {
  EmailDiklaimAkunLainError,
  type AuthUserRepository,
} from "../repositories/user.repository.js";
import type { GoogleIdTokenVerifier } from "./google-id-token.js";
import type { GoogleCodeExchange } from "./google-token.js";
import type { SessionService, SessionTokens } from "./session.service.js";

/** Entitas audit modul ini (tanpa PII — email/nama tidak pernah ikut). */
const AUDIT_ENTITY = "auth.google";

/** Metode login untuk audit sukses. */
const METODE = "google" as const;

export interface GoogleServiceDeps {
  exchange: GoogleCodeExchange;
  verifier: GoogleIdTokenVerifier;
  userRepository: AuthUserRepository;
  /** Penerbit pasangan token (PR-018b). */
  sessionService: Pick<SessionService, "issue">;
  auditLog: AuditLog;
}

/** Konteks pemanggil untuk audit; belum ada user saat pre-auth. */
export interface GoogleActor {
  requestId: string;
}

/**
 * Kegagalan yang PATUT diaudit sebagai percobaan login gagal, dipetakan dari
 * kode error. Gangguan infrastruktur (`BELUM_SIAP` — Google tak terjangkau)
 * sengaja TIDAK ada di sini: itu bukan percobaan masuk yang ditolak, dan
 * mencatatnya sebagai kegagalan login akan mengotori sinyal keamanan justru
 * saat sedang ada insiden. Ia tetap terekam sebagai log error biasa.
 */
const ALASAN_AUDIT: Partial<
  Record<
    ErrorCode,
    "googleExchangeFailed" | "googleTokenInvalid" | "googleEmailNotVerified" | "googleEmailClaimed"
  >
> = {
  GOOGLE_EXCHANGE_GAGAL: "googleExchangeFailed",
  TOKEN_GOOGLE_TIDAK_VALID: "googleTokenInvalid",
  EMAIL_GOOGLE_BELUM_TERVERIFIKASI: "googleEmailNotVerified",
  EMAIL_GOOGLE_DIKLAIM_AKUN_LAIN: "googleEmailClaimed",
};

export function createGoogleService(deps: GoogleServiceDeps) {
  const { exchange, verifier, userRepository, sessionService, auditLog } = deps;

  return {
    /** POST /auth/google — tukar code, verifikasi, find-or-create/link, terbitkan sesi. */
    async login(
      // `client` sengaja TIDAK ikut — urusan transport, bukan logika masuk.
      input: Omit<GoogleAuth, "client">,
      actor: GoogleActor,
    ): Promise<{ userId: string; isNewUser: boolean; tokens: SessionTokens }> {
      let identitas;
      try {
        const idToken = await exchange.exchange(input);
        identitas = await verifier.verify(idToken);
      } catch (err) {
        const alasan = err instanceof AppError ? ALASAN_AUDIT[err.code] : undefined;
        if (alasan !== undefined) {
          auditLog(
            { actorId: null, requestId: actor.requestId },
            AUDIT_ACTION.AUTH_LOGIN_FAILED,
            AUDIT_ENTITY,
            null,
            { reason: alasan },
          );
        }
        throw err;
      }

      let user;
      try {
        user = await userRepository.findOrCreateByGoogle(identitas);
      } catch (err) {
        // Alamat ini dipegang akun lain yang belum membuktikan kepemilikannya
        // (PR-020a). Ditolak dengan arahan, bukan 500 — dan diaudit, sebab pola
        // berulang atas banyak alamat berarti ada yang memanen email lewat
        // PUT /me untuk memanen identitas Google orang lain.
        if (err instanceof EmailDiklaimAkunLainError) {
          auditLog(
            { actorId: null, requestId: actor.requestId },
            AUDIT_ACTION.AUTH_LOGIN_FAILED,
            AUDIT_ENTITY,
            null,
            { reason: "googleEmailClaimed" },
          );
          throw appError("EMAIL_GOOGLE_DIKLAIM_AKUN_LAIN");
        }
        throw err;
      }
      const tokens = await sessionService.issue(user.id);

      auditLog(
        { actorId: user.id, requestId: actor.requestId },
        AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED,
        AUDIT_ENTITY,
        user.id,
        { method: METODE, isNewUser: user.isNew },
      );

      return { userId: user.id, isNewUser: user.isNew, tokens };
    },
  };
}

export type GoogleService = ReturnType<typeof createGoogleService>;
