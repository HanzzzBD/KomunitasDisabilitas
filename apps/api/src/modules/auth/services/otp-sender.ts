// modules/auth — kontrak pengirim OTP + rantai fallback.
//
// Service TIDAK boleh tahu nama provider: ia hanya memanggil OtpSender.send().
// Risiko "ketergantungan Fonnte" (layanan kecil) dijawab di sini: rantai
// pengirim mencoba provider berikutnya saat yang pertama gagal, dan service
// tidak perlu tahu itu terjadi.
import type { Env } from "../../../core/config/index.js";
import type { Logger } from "../../../core/logger/index.js";
import { createFonnteSender, type FetchLike } from "./fonnte.sender.js";
import { createTwilioSender } from "./twilio.sender.js";

export interface OtpMessage {
  /** Nomor tujuan E.164. PII — jangan pernah masuk log/audit. */
  phone: string;
  /**
   * Isi pesan yang SUDAH jadi. Transport tidak tahu — dan tidak boleh tahu —
   * apakah ini kode masuk, pemberitahuan hapus akun, atau yang lain.
   *
   * Ini sisi kedua dari aturan yang sudah ada di kepala berkas: service tidak
   * tahu nama provider, provider tidak tahu makna pesan. Sebelum PR-021b field
   * ini bernama `code` dan setiap adapter memanggil `buildOtpMessage` sendiri —
   * artinya menambah satu jenis pesan berarti menyunting SETIAP adapter, dan
   * adapter yang terlewat akan mengirim teks yang salah ke pengguna.
   *
   * Rahasia bila memuat kode — jangan pernah masuk log/audit.
   */
  text: string;
}

export interface OtpSender {
  /** Nama untuk log/metrik (bukan rahasia): "fonnte", "twilio", … */
  readonly name: string;
  send(message: OtpMessage): Promise<void>;
}

/** Gagal kirim di sisi provider — pemanggil memutuskan fallback/menyerah. */
export class OtpSenderError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = "OtpSenderError";
    this.provider = provider;
  }
}

/**
 * Isi pesan OTP — Bahasa Indonesia sederhana, satu kalimat per informasi
 * (dibacakan utuh oleh screen reader). Menyebut nama layanan di depan agar
 * pengguna tahu kode ini milik siapa sebelum mendengar angkanya, dan
 * peringatan anti-phishing di akhir.
 */
export function buildOtpMessage(code: string): string {
  return (
    `Kode masuk Nawasena Anda: ${code}. ` +
    "Kode berlaku 5 menit. " +
    "Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku petugas Nawasena."
  );
}

/**
 * Pengirim "belum dikonfigurasi": selalu gagal, sehingga endpoint menjawab 503
 * dan kode yang telanjur dibuat dihanguskan. Deny-by-default — API tetap bisa
 * di-boot tanpa kredensial provider (pola INTERNAL_TOKEN, PR-015b).
 */
export function createUnavailableOtpSender(): OtpSender {
  return {
    name: "belum-dikonfigurasi",
    send() {
      return Promise.reject(
        new OtpSenderError("belum-dikonfigurasi", "Provider pengirim OTP belum dikonfigurasi"),
      );
    },
  };
}

/**
 * Rantai pengirim: coba berurutan sampai satu berhasil. Kegagalan provider
 * dicatat sebagai `warn` (bukan `error`) selama masih ada cadangan — pengguna
 * tetap menerima kodenya, jadi ini belum insiden. Log memuat nama provider dan
 * alasan dari provider, TIDAK pernah nomor tujuan atau kode.
 */
export function createFallbackOtpSender(
  senders: readonly OtpSender[],
  logger: Pick<Logger, "warn">,
): OtpSender {
  if (senders.length === 0) return createUnavailableOtpSender();
  if (senders.length === 1) return senders[0]!;

  const rantai = senders.map((sender) => sender.name).join(" → ");

  return {
    name: rantai,

    async send(message) {
      const gagal: string[] = [];

      for (const [index, sender] of senders.entries()) {
        try {
          await sender.send(message);
          if (index > 0) {
            logger.warn(
              { provider: sender.name, urutan: index + 1 },
              "OTP terkirim lewat pengirim cadangan",
            );
          }
          return;
        } catch (err) {
          const alasan = err instanceof Error ? err.message : "kesalahan tidak dikenal";
          gagal.push(sender.name);
          const masihAdaCadangan = index < senders.length - 1;
          logger.warn(
            { provider: sender.name, alasan, masihAdaCadangan },
            "Pengirim OTP gagal",
          );
        }
      }

      throw new OtpSenderError(gagal.join(","), `Semua pengirim OTP gagal (${rantai})`);
    },
  };
}

/**
 * Susun rantai pengirim dari env: Fonnte (WhatsApp) primer, Twilio (SMS)
 * cadangan — urutan SDD §8.1. Provider yang kredensialnya kosong dilewati;
 * tanpa satu pun provider, hasilnya pengirim "belum dikonfigurasi" (503).
 */
export function createOtpSenderFromEnv(
  env: Pick<
    Env,
    | "FONNTE_TOKEN"
    | "FONNTE_BASE_URL"
    | "TWILIO_ACCOUNT_SID"
    | "TWILIO_AUTH_TOKEN"
    | "TWILIO_FROM"
    | "TWILIO_BASE_URL"
    | "OTP_SEND_TIMEOUT_MS"
  >,
  logger: Pick<Logger, "warn">,
  fetchImpl?: FetchLike,
): OtpSender {
  const senders: OtpSender[] = [];

  if (env.FONNTE_TOKEN !== undefined) {
    senders.push(
      createFonnteSender(
        {
          token: env.FONNTE_TOKEN,
          baseUrl: env.FONNTE_BASE_URL,
          timeoutMs: env.OTP_SEND_TIMEOUT_MS,
        },
        fetchImpl,
      ),
    );
  }

  // Kelengkapan trio Twilio sudah dijamin core/config (boot gagal bila separuh).
  if (
    env.TWILIO_ACCOUNT_SID !== undefined &&
    env.TWILIO_AUTH_TOKEN !== undefined &&
    env.TWILIO_FROM !== undefined
  ) {
    senders.push(
      createTwilioSender(
        {
          accountSid: env.TWILIO_ACCOUNT_SID,
          authToken: env.TWILIO_AUTH_TOKEN,
          from: env.TWILIO_FROM,
          baseUrl: env.TWILIO_BASE_URL,
          timeoutMs: env.OTP_SEND_TIMEOUT_MS,
        },
        fetchImpl,
      ),
    );
  }

  return createFallbackOtpSender(senders, logger);
}
