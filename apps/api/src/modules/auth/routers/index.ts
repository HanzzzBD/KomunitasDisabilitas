// modules/auth — router. Path relatif; entry point memasangnya di /api/v1.
//
// Kedua metode masuk (OTP & Google) berdiri sendiri: masing-masing punya
// kredensial sendiri dan boleh mati sendiri. Controller yang `null` berarti
// kredensialnya belum di-set — rutenya TETAP terdaftar tetapi menjawab 503,
// bukan 404. Bedanya penting: 404 membuat klien mengira endpoint-nya salah,
// 503 memberitahu bahwa fiturnya sedang tidak tersedia dan menyarankan jalan
// masuk yang lain.
import { Router } from "express";
import { googleAuthSchema, requestOtpSchema, verifyOtpSchema } from "@nawasena/schemas";
import { appError, asyncHandler, validate } from "../../../core/http/index.js";
import type { OtpController } from "../controllers/otp.controller.js";
import type { GoogleController } from "../controllers/google.controller.js";

export interface AuthControllers {
  /** null = OTP_HASH_SECRET belum di-set. */
  otp: OtpController | null;
  /** null = kredensial Google OAuth belum di-set. */
  google: GoogleController | null;
}

/** Handler "fitur ini belum tersedia" dengan saran metode masuk pengganti. */
function tertutup(pesan: string, saran: string) {
  return asyncHandler(() => {
    throw appError("BELUM_SIAP", { message: pesan, hint: saran });
  });
}

export function createAuthRouter(controllers: AuthControllers): Router {
  const router = Router();
  const { otp, google } = controllers;

  if (otp === null) {
    router.all("/auth/otp/*", tertutup("Masuk dengan kode OTP belum tersedia", "Coba lagi nanti, atau masuk dengan Google"));
  } else {
    router.post("/auth/otp/request", validate({ body: requestOtpSchema }), asyncHandler(otp.request));
    router.post("/auth/otp/verify", validate({ body: verifyOtpSchema }), asyncHandler(otp.verify));
  }

  if (google === null) {
    router.all("/auth/google", tertutup("Masuk dengan Google belum tersedia", "Coba lagi nanti, atau masuk dengan kode OTP"));
  } else {
    router.post("/auth/google", validate({ body: googleAuthSchema }), asyncHandler(google.login));
  }

  return router;
}
