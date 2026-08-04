// Domain: auth — skema OTP (PR-004 request; PR-016 verify) + Google (PR-017).
// Skema refresh token menyusul di PR-018.
//
// Konvensi (lihat README):
// - nama skema camelCase + suffix Schema: requestOtpSchema
// - tipe PascalCase via z.infer: RequestOtp
// - component OpenAPI PascalCase via .openapi({ ref: "..." })
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema } from "./common.js";

/** Nomor HP Indonesia format E.164 (+62…). */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+62\d{8,13}$/, {
    message: "Nomor HP harus format +62, contoh +6281234567890",
  })
  .openapi({ description: "Nomor HP Indonesia, format E.164", example: "+6281234567890" });

/** POST /api/v1/auth/otp/request — body. */
export const requestOtpSchema = z
  .object({
    phone: phoneNumberSchema,
  })
  .openapi({ ref: "RequestOtp", description: "Permintaan kirim kode OTP via WhatsApp/SMS" });

export type RequestOtp = z.infer<typeof requestOtpSchema>;

/** POST /api/v1/auth/otp/request — response 202. */
export const requestOtpResponseSchema = z
  .object({
    data: z.object({
      /**
       * Detik sebelum boleh minta OTP lagi (rate limit kirim per nomor, PR-016).
       * 0 = kuota jam berjalan masih tersisa, boleh langsung minta lagi.
       */
      retryAfterSeconds: z.number().int().min(0).openapi({ example: 0 }),
    }),
  })
  .openapi({ ref: "RequestOtpResponse" });

export type RequestOtpResponse = z.infer<typeof requestOtpResponseSchema>;

/** Kode OTP 6 angka. String (bukan number) — angka 0 di depan bermakna. */
export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, { message: "Kode OTP harus 6 angka" })
  .openapi({ description: "Kode OTP 6 angka dari WhatsApp/SMS", example: "482913" });

/** POST /api/v1/auth/otp/verify — body. */
export const verifyOtpSchema = z
  .object({
    phone: phoneNumberSchema,
    code: otpCodeSchema,
  })
  .openapi({ ref: "VerifyOtp", description: "Verifikasi kode OTP yang diterima pengguna" });

export type VerifyOtp = z.infer<typeof verifyOtpSchema>;

/**
 * POST /api/v1/auth/otp/verify — response 200.
 * Sengaja BELUM memuat pasangan JWT: penerbitan token = PR-018, yang akan
 * menambah field token pada envelope ini (perubahan additive).
 */
export const verifyOtpResponseSchema = z
  .object({
    data: z.object({
      userId: idSchema,
      /** true bila akun baru dibuat pada verifikasi ini (find-or-create). */
      isNewUser: z.boolean().openapi({ example: false }),
    }),
  })
  .openapi({ ref: "VerifyOtpResponse" });

export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>;

/**
 * Authorization code dari Google (opaque). Panjangnya tidak dijamin Google,
 * jadi batas atas di sini hanya penjaga ukuran body — bukan aturan format.
 */
export const authorizationCodeSchema = z
  .string()
  .trim()
  .min(1, { message: "Kode dari Google tidak boleh kosong" })
  .max(2048, { message: "Kode dari Google terlalu panjang" })
  .openapi({ description: "Authorization code sekali pakai dari Google" });

/**
 * PKCE code_verifier (RFC 7636 §4.1): 43–128 karakter unreserved.
 * Divalidasi di sini supaya verifier yang salah bentuk ditolak sebelum
 * menyentuh jaringan — Google akan menolaknya juga, tetapi lebih lambat.
 */
export const pkceCodeVerifierSchema = z
  .string()
  .regex(/^[A-Za-z0-9\-._~]{43,128}$/, {
    message: "Verifier PKCE harus 43–128 karakter (huruf, angka, - . _ ~)",
  })
  .openapi({ description: "PKCE code_verifier (RFC 7636), 43–128 karakter" });

/**
 * POST /api/v1/auth/google — body.
 * Alur authorization code + PKCE (bukan implicit): klien publik (web/mobile)
 * menukar `code` di server kita, sehingga client_secret tidak pernah ada di
 * perangkat pengguna.
 */
export const googleAuthSchema = z
  .object({
    code: authorizationCodeSchema,
    codeVerifier: pkceCodeVerifierSchema,
    /**
     * Harus sama persis dengan redirect_uri saat meminta `code` — Google
     * menolak bila berbeda. Skema kustom mobile (mis. `com.nawasena:/oauth`)
     * ikut valid.
     */
    redirectUri: z
      .string()
      .url({ message: "Alamat pengalihan tidak valid" })
      .max(2048, { message: "Alamat pengalihan terlalu panjang" })
      .openapi({ example: "http://localhost:5173/masuk/google" }),
  })
  .openapi({ ref: "GoogleAuth", description: "Tukar authorization code Google (PKCE) jadi sesi" });

export type GoogleAuth = z.infer<typeof googleAuthSchema>;

/**
 * POST /api/v1/auth/google — response 200.
 * Bentuknya sengaja SAMA dengan verifyOtpResponse: kedua metode login bermuara
 * pada envelope yang sama, dan PR-018 menambah pasangan JWT ke keduanya
 * sekaligus (perubahan additive).
 */
export const googleAuthResponseSchema = z
  .object({
    data: z.object({
      userId: idSchema,
      /** true bila akun baru dibuat pada login ini (find-or-create). */
      isNewUser: z.boolean().openapi({ example: false }),
    }),
  })
  .openapi({ ref: "GoogleAuthResponse" });

export type GoogleAuthResponse = z.infer<typeof googleAuthResponseSchema>;
