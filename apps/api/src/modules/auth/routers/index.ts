// modules/auth — router. Path ditulis relatif; prefix `/api/v1` dipegang
// registrar (PR-019), yang juga mencatat deklarasi akses tiap rute.
//
// HAMPIR seluruh rute di file ini `access.public` — dan itu bukan kelalaian:
// semuanya pintu masuk bagi pemanggil yang MEMANG belum punya access token. OTP
// dan Google membuktikan diri dengan kredensialnya masing-masing; refresh dan
// logout membuktikan diri dengan refresh token yang mereka bawa. Menjaga mereka
// dengan `requireAuth` berarti mensyaratkan sesi untuk membuat sesi.
//
// Kekecualiannya satu: DELETE /auth/account (PR-021). Ia bukan pintu masuk,
// melainkan aksi atas akun yang sudah masuk — lihat alasannya di tempatnya.
//
// Kedua metode masuk (OTP & Google) berdiri sendiri: masing-masing punya
// kredensial sendiri dan boleh mati sendiri. Controller yang `null` berarti
// kredensialnya belum di-set — rutenya TETAP terdaftar tetapi menjawab 503,
// bukan 404. Bedanya penting: 404 membuat klien mengira endpoint-nya salah,
// 503 memberitahu bahwa fiturnya sedang tidak tersedia dan menyarankan jalan
// masuk yang lain.
import type { Router } from "express";
import {
  deleteAccountSchema,
  googleAuthSchema,
  refreshSessionSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { appError, asyncHandler, validate } from "../../../core/http/index.js";
import type { OtpController } from "../controllers/otp.controller.js";
import type { GoogleController } from "../controllers/google.controller.js";
import type { SessionController } from "../controllers/session.controller.js";
import type { AccountController } from "../controllers/account.controller.js";

export interface AuthControllers {
  /** null = OTP_HASH_SECRET belum di-set (atau kunci sesi belum ada). */
  otp: OtpController | null;
  /** null = kredensial Google OAuth belum di-set (atau kunci sesi belum ada). */
  google: GoogleController | null;
  /** null = kunci sesi RS256 belum di-set → sesi tidak bisa diterbitkan. */
  session: SessionController | null;
  /** null = kunci sesi RS256 belum di-set; hapus akun butuh sesi yang terbaca. */
  account: AccountController | null;
}

/** Alasan keterbukaan — tercatat di registry dan terbaca saat review (PR-106). */
const ALASAN_LOGIN = "pintu masuk: pemanggil belum punya sesi";
const ALASAN_SESI = "dikredensial oleh refresh token yang dibawa, bukan access token";

/** Handler "fitur ini belum tersedia" dengan saran metode masuk pengganti. */
function tertutup(pesan: string, saran: string) {
  return asyncHandler(() => {
    throw appError("BELUM_SIAP", { message: pesan, hint: saran });
  });
}

export function createAuthRouter(controllers: AuthControllers, routes: RouteRegistrar): Router {
  const { otp, google, session, account } = controllers;

  // Hapus akun (PR-021). SATU-SATUNYA route di file ini yang TIDAK publik: ia
  // bukan pintu masuk, melainkan aksi atas akun yang sudah masuk. Identitas
  // datang dari access token, dan body hanya membawa BUKTI ULANG kepemilikan —
  // tidak ada saluran untuk menyebut akun orang lain.
  //
  // `access.authenticated()` dan bukan `access.self()` dengan alasan yang sama
  // seperti /me (PR-020): tidak ada param `:userId` untuk dibandingkan, dan
  // requireSelf pada route tanpa param menolak semuanya.
  if (account === null) {
    routes.delete(
      "/auth/account",
      access.authenticated(),
      tertutup("Hapus akun belum tersedia", "Coba lagi nanti, atau hubungi kami untuk dibantu"),
    );
  } else {
    routes.delete(
      "/auth/account",
      access.authenticated(),
      validate({ body: deleteAccountSchema }),
      asyncHandler(account.deleteAccount),
    );
  }

  // Perpanjangan sesi (PR-018b). Tanpa kunci RS256 endpoint ini menjawab 503 —
  // sama seperti kedua metode masuk, yang juga ikut tertutup karena login yang
  // tidak bisa menerbitkan sesi bukan login.
  if (session === null) {
    routes.all(
      ["/auth/refresh", "/auth/logout", "/auth/logout-all"],
      access.public(ALASAN_SESI),
      tertutup("Perpanjangan sesi belum tersedia", "Coba lagi nanti, atau masuk ulang"),
    );
  } else {
    const bodySesi = validate({ body: refreshSessionSchema });
    routes.post("/auth/refresh", access.public(ALASAN_SESI), bodySesi, asyncHandler(session.refresh));
    // Keluar (PR-018c). Kredensialnya refresh token itu sendiri — `requireAuth`
    // sudah ada sejak PR-019, tetapi memakainya di sini akan membuat pengguna
    // yang access token-nya baru kedaluwarsa tidak bisa keluar sama sekali.
    routes.post("/auth/logout", access.public(ALASAN_SESI), bodySesi, asyncHandler(session.logout));
    routes.post(
      "/auth/logout-all",
      access.public(ALASAN_SESI),
      bodySesi,
      asyncHandler(session.logoutAll),
    );
  }

  if (otp === null) {
    routes.all(
      "/auth/otp/*",
      access.public(ALASAN_LOGIN),
      tertutup("Masuk dengan kode OTP belum tersedia", "Coba lagi nanti, atau masuk dengan Google"),
    );
  } else {
    routes.post(
      "/auth/otp/request",
      access.public(ALASAN_LOGIN),
      validate({ body: requestOtpSchema }),
      asyncHandler(otp.request),
    );
    routes.post(
      "/auth/otp/verify",
      access.public(ALASAN_LOGIN),
      validate({ body: verifyOtpSchema }),
      asyncHandler(otp.verify),
    );
  }

  if (google === null) {
    routes.all(
      "/auth/google",
      access.public(ALASAN_LOGIN),
      tertutup("Masuk dengan Google belum tersedia", "Coba lagi nanti, atau masuk dengan kode OTP"),
    );
  } else {
    routes.post(
      "/auth/google",
      access.public(ALASAN_LOGIN),
      validate({ body: googleAuthSchema }),
      asyncHandler(google.login),
    );
  }

  return routes.router;
}
