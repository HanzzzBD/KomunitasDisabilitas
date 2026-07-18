// Domain: auth — SATU contoh skema lengkap sebagai acuan konvensi (AC PR-004).
// Skema lain domain ini (verify, refresh, Google sign-in) diisi di PR-016..018.
//
// Konvensi (lihat README):
// - nama skema camelCase + suffix Schema: requestOtpSchema
// - tipe PascalCase via z.infer: RequestOtp
// - component OpenAPI PascalCase via .openapi({ ref: "..." })
import "zod-openapi/extend";
import { z } from "zod";

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
      /** Detik sebelum boleh minta OTP lagi (rate limit per nomor, PR-016). */
      retryAfterSeconds: z.number().int().min(0).openapi({ example: 60 }),
    }),
  })
  .openapi({ ref: "RequestOtpResponse" });

export type RequestOtpResponse = z.infer<typeof requestOtpResponseSchema>;
