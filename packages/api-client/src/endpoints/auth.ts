// Endpoint contoh (PR-005) — terhubung skema PR-004. Endpoint nyata per domain
// ditambahkan bertahap mengikuti PR fitur; pola file ini jadi acuannya.
import {
  requestOtpSchema,
  requestOtpResponseSchema,
  verifyOtpSchema,
  verifyOtpResponseSchema,
  refreshSessionSchema,
  refreshSessionResponseSchema,
  type RequestOtp,
  type RequestOtpResponse,
  type VerifyOtp,
  type VerifyOtpResponse,
  type RefreshSession,
  type RefreshSessionResponse,
} from "@nawasena/schemas";
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

/**
 * POST /auth/otp/verify — tukar kode OTP dengan sesi (PR-018b).
 * `refreshToken` hanya ada pada response bila `client: "mobile"`; web
 * menerimanya sebagai cookie HttpOnly yang tidak terlihat dari JavaScript.
 */
export async function verifyOtp(client: ApiClient, input: VerifyOtp): Promise<VerifyOtpResponse> {
  const body = verifyOtpSchema.parse(input);
  return client.request("/auth/otp/verify", {
    method: "POST",
    body,
    responseSchema: verifyOtpResponseSchema,
  });
}

/**
 * POST /auth/refresh — perpanjang sesi.
 *
 * JANGAN memanggil ini langsung dari kode fitur: pakai `refresh` di
 * ApiClientOptions supaya 401 → refresh → retry berjalan otomatis dan hanya
 * SEKALI per permintaan. Memanggilnya manual di banyak tempat berisiko
 * merotasi refresh token secara paralel — dan rotasi paralel adalah persis
 * bentuk yang dibaca server sebagai reuse, sehingga seluruh sesi tercabut.
 */
export async function refreshSession(
  client: ApiClient,
  input: RefreshSession = {},
): Promise<RefreshSessionResponse> {
  const body = refreshSessionSchema.parse(input);
  return client.request("/auth/refresh", {
    method: "POST",
    body,
    responseSchema: refreshSessionResponseSchema,
    // Refresh yang ditolak TIDAK boleh memicu refresh lagi — lihat catatan
    // pada skipAuthRefresh di client.ts.
    skipAuthRefresh: true,
  });
}
