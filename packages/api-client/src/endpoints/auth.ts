// Endpoint contoh (PR-005) — terhubung skema PR-004. Endpoint nyata per domain
// ditambahkan bertahap mengikuti PR fitur; pola file ini jadi acuannya.
import {
  requestOtpSchema,
  requestOtpResponseSchema,
  type RequestOtp,
  type RequestOtpResponse,
} from "@incasif/schemas";
import type { ApiClient } from "../client.js";
import { queryKey } from "../query-keys.js";

/** Key cache TanStack untuk domain auth. */
export const authKeys = {
  otpRequest: (phone: string) => queryKey("auth", { intent: "otp-request", phone }),
};

/**
 * POST /auth/otp/request — minta kode OTP.
 * Body divalidasi requestOtpSchema SEBELUM dikirim (fail cepat di sisi klien,
 * pesan error Bahasa Indonesia dari zod); response diparse
 * requestOtpResponseSchema (guard drift runtime).
 */
export async function requestOtp(
  client: ApiClient,
  input: RequestOtp,
): Promise<RequestOtpResponse> {
  const body = requestOtpSchema.parse(input);
  return client.request("/auth/otp/request", {
    method: "POST",
    body,
    responseSchema: requestOtpResponseSchema,
  });
}
