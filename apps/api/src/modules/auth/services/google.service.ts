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
import type { EventBus } from "../../../core/events/index.js";
import { AppError, appError } from "../../../core/http/index.js";
import type { ErrorCode } from "../../../core/http/index.js";
import {
  EmailDiklaimAkunLainError,
  type AuthUserRepository,
} from "../repositories/user.repository.js";
import type {
  GoogleIdentity,
  GoogleIdTokenVerifier,
  GoogleMobileIdTokenVerifier,
} from "./google-id-token.js";
import type { GoogleNonceRepository } from "../repositories/google-nonce.repository.js";
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
  /** Bus event domain (PR-034) — dipakai mengumumkan akun baru. */
  events: EventBus;
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

/** Hasil masuk Google — sama untuk web dan Android. */
export interface HasilMasukGoogle {
  userId: string;
  isNewUser: boolean;
  tokens: SessionTokens;
}

type DepsPenyelesai = Pick<
  GoogleServiceDeps,
  "userRepository" | "sessionService" | "auditLog" | "events"
>;

/** Audit percobaan gagal — hanya untuk alasan yang patut (lihat ALASAN_AUDIT). */
function auditGagal(
  auditLog: AuditLog,
  actor: GoogleActor,
  reason:
    | "googleExchangeFailed"
    | "googleTokenInvalid"
    | "googleEmailNotVerified"
    | "googleEmailClaimed"
    | "googleNonceInvalid",
): void {
  auditLog(
    { actorId: null, requestId: actor.requestId },
    AUDIT_ACTION.AUTH_LOGIN_FAILED,
    AUDIT_ENTITY,
    null,
    { reason },
  );
}

/** Kegagalan verifikasi → audit bila alasannya terpetakan, lalu lempar ulang. */
function auditKegagalanVerifikasi(auditLog: AuditLog, actor: GoogleActor, err: unknown): never {
  const alasan = err instanceof AppError ? ALASAN_AUDIT[err.code] : undefined;
  if (alasan !== undefined) auditGagal(auditLog, actor, alasan);
  throw err;
}

/**
 * Langkah 3 — find-or-create/link + terbitkan sesi. SATU implementasi untuk
 * web (code + PKCE) dan Android (id_token + nonce): kedua jalur hanya berbeda
 * di cara membuktikan identitas, dan begitu identitas terbukti, aturan
 * penautan akun tidak boleh bisa menyimpang di antara keduanya.
 */
function buatPenyelesai(deps: DepsPenyelesai) {
  const { userRepository, sessionService, auditLog, events } = deps;

  return async function selesaikan(
    identitas: GoogleIdentity,
    actor: GoogleActor,
  ): Promise<HasilMasukGoogle> {
    let user;
    try {
      user = await userRepository.findOrCreateByGoogle(identitas);
    } catch (err) {
      // Alamat ini dipegang akun lain yang belum membuktikan kepemilikannya
      // (PR-020a). Ditolak dengan arahan, bukan 500 — dan diaudit, sebab pola
      // berulang atas banyak alamat berarti ada yang memanen email lewat
      // PUT /me untuk memanen identitas Google orang lain.
      if (err instanceof EmailDiklaimAkunLainError) {
        auditGagal(auditLog, actor, "googleEmailClaimed");
        throw appError("EMAIL_GOOGLE_DIKLAIM_AKUN_LAIN");
      }
      throw err;
    }

    // Sama seperti jalur OTP: diterbitkan setelah baris user benar-benar ada,
    // dan HANYA saat akun memang baru — masuk berulang bukan registrasi.
    // Tidak ditunggu; kegagalan pelanggan tidak menggagalkan masuk.
    if (user.isNew) {
      events.emit("auth.user_registered", {
        userId: user.id,
        registeredAt: new Date().toISOString(),
      });
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
  };
}

export function createGoogleService(deps: GoogleServiceDeps) {
  const { exchange, verifier, auditLog } = deps;
  const selesaikan = buatPenyelesai(deps);

  return {
    /** POST /auth/google — tukar code, verifikasi, find-or-create/link, terbitkan sesi. */
    async login(
      // `client` sengaja TIDAK ikut — urusan transport, bukan logika masuk.
      input: Omit<GoogleAuth, "client">,
      actor: GoogleActor,
    ): Promise<HasilMasukGoogle> {
      let identitas;
      try {
        const idToken = await exchange.exchange(input);
        identitas = await verifier.verify(idToken);
      } catch (err) {
        auditKegagalanVerifikasi(auditLog, actor, err);
      }
      return selesaikan(identitas, actor);
    },
  };
}

export type GoogleService = ReturnType<typeof createGoogleService>;

export interface GoogleMobileServiceDeps extends DepsPenyelesai {
  verifier: GoogleMobileIdTokenVerifier;
  nonces: GoogleNonceRepository;
}

/**
 * Sign in with Google dari Android (PR-090): Credential Manager → id_token.
 *
 * Tidak ada authorization code, jadi tidak ada PKCE. Penggantinya nonce
 * terbitan server: tanpa itu, id_token yang bocor bisa diputar ulang selama
 * masa berlakunya (± 1 jam).
 */
export function createGoogleMobileService(deps: GoogleMobileServiceDeps) {
  const { verifier, nonces, auditLog } = deps;
  const selesaikan = buatPenyelesai(deps);

  return {
    /** POST /auth/google/mobile/nonce */
    terbitkanNonce: () => nonces.terbitkan(),

    /** POST /auth/google/mobile — verifikasi, konsumsi nonce, find-or-create, sesi. */
    async login(idToken: string, actor: GoogleActor): Promise<HasilMasukGoogle> {
      let hasil;
      try {
        hasil = await verifier.verifyDenganNonce(idToken);
      } catch (err) {
        auditKegagalanVerifikasi(auditLog, actor, err);
      }

      // Urutannya disengaja: tanda tangan DULU, baru nonce. Nonce hanya dipercaya
      // karena Google yang menandatanganinya; mengonsumsinya dari token yang
      // belum terverifikasi berarti siapa pun bisa membakar nonce orang lain.
      //
      // Satu jawaban untuk tiga kasus (tidak ada, tidak dikenal, sudah dipakai):
      // membedakannya hanya memberi tahu peniru bagian mana yang harus diperbaiki.
      if (hasil.nonce === null || !(await nonces.konsumsi(hasil.nonce))) {
        auditGagal(auditLog, actor, "googleNonceInvalid");
        throw appError("TOKEN_GOOGLE_TIDAK_VALID");
      }

      return selesaikan(hasil.identitas, actor);
    },
  };
}

export type GoogleMobileService = ReturnType<typeof createGoogleMobileService>;
