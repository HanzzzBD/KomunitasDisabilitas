// Domain: auth — skema OTP (PR-004 request; PR-016 verify).
// Skema Google sign-in & refresh menyusul di PR-017/018.
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
