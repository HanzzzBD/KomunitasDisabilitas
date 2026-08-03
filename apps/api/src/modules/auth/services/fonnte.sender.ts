// modules/auth — adapter Fonnte (WhatsApp), pengirim OTP primer (SDD §8.1).
//
// Kekhasan Fonnte yang ditangani di sini: kegagalan pengiriman sering datang
// sebagai HTTP 200 dengan body `{"status": false, "reason": "..."}`. Memeriksa
// status HTTP saja akan menganggap pesan terkirim padahal tidak — dan pengguna
// menunggu kode yang tidak pernah datang.
import { buildOtpMessage, OtpSenderError, type OtpSender } from "./otp-sender.js";

/** Bagian `fetch` yang dipakai adapter — memudahkan injeksi di test. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface FonnteConfig {
  token: string;
  baseUrl: string;
  timeoutMs: number;
}

export const FONNTE_PROVIDER = "fonnte";

interface FonnteBody {
  status?: unknown;
  reason?: unknown;
}

/** Alasan gagal dari provider — dipakai untuk log, jadi dipotong & dibersihkan. */
function bacaAlasan(body: unknown): string {
  if (typeof body !== "object" || body === null) return "tanpa keterangan";
  const reason = (body as FonnteBody).reason;
  return typeof reason === "string" && reason.trim() !== ""
    ? reason.trim().slice(0, 120)
    : "tanpa keterangan";
}

export function createFonnteSender(config: FonnteConfig, fetchImpl?: FetchLike): OtpSender {
  const kirim: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  return {
    name: FONNTE_PROVIDER,

    async send({ phone, code }) {
      let response: Response;
      try {
        response = await kirim(`${config.baseUrl}/send`, {
          method: "POST",
          headers: {
            // Fonnte memakai token mentah pada header Authorization (tanpa "Bearer").
            Authorization: config.token,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            target: phone,
            message: buildOtpMessage(code),
            countryCode: "62",
          }).toString(),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (err) {
        // Jaringan mati / timeout. Pesan error asli TIDAK disertakan mentah:
        // ia bisa memuat URL berisi parameter. Cukup jenis kegagalannya.
        const jenis = err instanceof Error ? err.name : "Error";
        throw new OtpSenderError(FONNTE_PROVIDER, `gagal menghubungi Fonnte (${jenis})`);
      }

      if (!response.ok) {
        throw new OtpSenderError(FONNTE_PROVIDER, `Fonnte menolak permintaan (HTTP ${response.status})`);
      }

      const body: unknown = await response.json().catch(() => null);
      if (typeof body !== "object" || body === null || (body as FonnteBody).status !== true) {
        throw new OtpSenderError(FONNTE_PROVIDER, `Fonnte gagal mengirim: ${bacaAlasan(body)}`);
      }
    },
  };
}
