// modules/auth — adapter Twilio (SMS), pengirim OTP cadangan (SDD §8.1).
//
// Dipakai hanya bila Fonnte gagal: SMS lebih mahal, tetapi tidak menuntut
// pengguna punya WhatsApp aktif — penting untuk pengguna di jaringan lemah.
import { buildOtpMessage, OtpSenderError, type OtpSender } from "./otp-sender.js";
import type { FetchLike } from "./fonnte.sender.js";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Nomor/sender ID terdaftar di Twilio. */
  from: string;
  baseUrl: string;
  timeoutMs: number;
}

export const TWILIO_PROVIDER = "twilio";

interface TwilioBody {
  message?: unknown;
  code?: unknown;
}

/** Pesan error Twilio (mis. "The 'To' number is not valid") untuk log. */
function bacaPesan(body: unknown): string {
  if (typeof body !== "object" || body === null) return "tanpa keterangan";
  const { message, code } = body as TwilioBody;
  const teks = typeof message === "string" && message.trim() !== "" ? message.trim() : "";
  const kode = typeof code === "number" || typeof code === "string" ? `[${String(code)}] ` : "";
  return teks === "" ? "tanpa keterangan" : `${kode}${teks}`.slice(0, 120);
}

export function createTwilioSender(config: TwilioConfig, fetchImpl?: FetchLike): OtpSender {
  const kirim: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  // Basic auth dihitung sekali; nilainya rahasia — jangan pernah di-log.
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`, "utf8").toString("base64");
  const url = `${config.baseUrl}/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  return {
    name: TWILIO_PROVIDER,

    async send({ phone, code }) {
      let response: Response;
      try {
        response = await kirim(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phone,
            From: config.from,
            Body: buildOtpMessage(code),
          }).toString(),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (err) {
        const jenis = err instanceof Error ? err.name : "Error";
        throw new OtpSenderError(TWILIO_PROVIDER, `gagal menghubungi Twilio (${jenis})`);
      }

      // Twilio membalas 201 saat pesan diterima antreannya.
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new OtpSenderError(
          TWILIO_PROVIDER,
          `Twilio menolak permintaan (HTTP ${response.status}): ${bacaPesan(body)}`,
        );
      }
    },
  };
}
