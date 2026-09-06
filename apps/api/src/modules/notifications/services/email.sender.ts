// modules/notifications — adapter Resend (PR-049a, SDD §16 `notify:email`).
//
// `fetch` mentah, BUKAN paket `resend`. Alasannya sama persis dengan yang sudah
// ditulis di kepala `fcm.sender.ts` dan `fonnte.sender.ts`: repo ini tidak punya
// infrastruktur mock HTTP (tidak ada msw/nock), sedangkan DI `FetchLike` membuat
// SETIAP cabang galat provider bisa diuji tanpa dependensi baru. Panggilannya
// pun satu POST dengan lima field.
//
// SATU ATURAN YANG MENGIKAT SELURUH BERKAS: alamat email TIDAK PERNAH masuk log
// maupun pesan galat. Ia PII langsung — lebih tajam daripada token perangkat di
// `fcm.sender.ts`, sebab ia mengidentifikasi orangnya, bukan perangkatnya.
// Yang boleh dicatat hanyalah AKIBATNYA (terkirim / ditolak / gagal) dan
// `userId`, yang memang id baris kita sendiri.
import type { FetchLike } from "../../auth/services/fonnte.sender.js";

export interface EmailConfig {
  apiKey: string;
  /** Alamat pengirim, mis. `Nawasena <kabar@nawasena.id>`. */
  from: string;
  timeoutMs: number;
  /** Diganti hanya untuk test. */
  baseUrl?: string;
}

const BASE_URL = "https://api.resend.com";

/**
 * Hasil satu pengiriman.
 *
 * `alamat-ditolak` BUKAN kegagalan, dan alasannya sama dengan `token-mati` di
 * `fcm.sender.ts`: alamat yang ditolak provider tidak akan menjadi sah pada
 * percobaan kedua, ketiga, maupun keempat. Menjadikannya exception berarti
 * empat panggilan jaringan dan satu baris DLQ untuk sesuatu yang sudah pasti
 * jawabannya — dan DLQ yang berisi hal-hal yang tidak bisa diperbaiki siapa pun
 * adalah DLQ yang berhenti dibaca orang.
 */
export type HasilKirimEmail =
  | { hasil: "terkirim"; id: string | null }
  | { hasil: "alamat-ditolak"; alasan: string };

/** Kegagalan yang PANTAS diulang BullMQ. */
export class EmailError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, pesan: string, status?: number) {
    super(pesan);
    this.name = "EmailError";
    this.code = code;
    this.status = status;
  }
}

export interface PesanEmail {
  /** Alamat tujuan. PII — jangan pernah masuk log/audit. */
  to: string;
  subject: string;
  /** Badan HTML. */
  html: string;
  /**
   * Badan teks polos. WAJIB, bukan opsional — lihat alasannya di
   * `email-template.service.ts`. Adapter tidak boleh menerima pesan tanpa ini.
   */
  text: string;
}

export interface EmailSender {
  readonly tersedia: boolean;
  kirim(pesan: PesanEmail): Promise<HasilKirimEmail>;
}

/** Adapter yang selalu menolak — dipakai saat kredensial kosong. */
export function createUnavailableEmailSender(): EmailSender {
  return {
    tersedia: false,
    kirim() {
      return Promise.reject(
        new EmailError("EMAIL_TIDAK_DIKONFIGURASI", "Kanal email belum dikonfigurasi"),
      );
    },
  };
}

/** Baca pesan galat Resend tanpa mempercayai bentuknya. */
function bacaPesan(body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const pesan = (body as { message?: unknown }).message;
    if (typeof pesan === "string" && pesan !== "") return pesan;
    const nama = (body as { name?: unknown }).name;
    if (typeof nama === "string" && nama !== "") return nama;
  }
  return "tanpa keterangan";
}

/**
 * Deret yang berbentuk alamat email di dalam keterangan provider.
 *
 * Resend lazim mengutip balik alamat tujuan di pesan galatnya
 * (`Invalid \`to\` field: orang@contoh.id`), yang berarti PII bisa masuk log
 * lewat pintu yang tidak kita tulis sendiri. Aturan dan alasannya sama dengan
 * `alasanAmanUntukLog` pada `otp-sender.ts` — hanya bentuk yang diredaksi yang
 * berbeda.
 */
const BERBENTUK_ALAMAT = /[^\s<>"]+@[^\s<>"]+/g;

const MAKS_ALASAN = 200;

export function redaksiAlamat(teks: string): string {
  return teks.replace(BERBENTUK_ALAMAT, "[alamat]").slice(0, MAKS_ALASAN);
}

export function createEmailSender(config: EmailConfig, fetchImpl?: FetchLike): EmailSender {
  const panggil: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  const baseUrl = config.baseUrl ?? BASE_URL;

  return {
    tersedia: true,

    async kirim(pesan) {
      let res: Response;
      try {
        res = await panggil(`${baseUrl}/emails`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [pesan.to],
            subject: pesan.subject,
            html: pesan.html,
            // Bagian teks polos ikut pada SETIAP kirim. Ia bukan cadangan
            // sopan santun: klien email berbasis teks dan sebagian pembaca
            // layar membacanya, dan pesan tanpa bagian ini juga dinilai lebih
            // mungkin spam oleh penyaring.
            text: pesan.text,
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (err) {
        const timeout = err instanceof Error && err.name === "TimeoutError";
        throw new EmailError(
          timeout ? "EMAIL_TIMEOUT" : "EMAIL_JARINGAN",
          timeout ? "Resend tidak menjawab tepat waktu" : "Gagal menghubungi Resend",
        );
      }

      const body: unknown = await res.json().catch(() => null);

      if (res.ok) {
        const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : null;
        return { hasil: "terkirim", id: typeof id === "string" ? id : null };
      }

      const alasan = redaksiAlamat(bacaPesan(body));

      // 422 = Resend menolak bentuk permintaannya, dan pada jalur ini satu-
      // satunya bagian yang berasal dari data pengguna adalah alamat tujuan.
      // Tidak akan membaik bila diulang.
      if (res.status === 422 || res.status === 400) {
        return { hasil: "alamat-ditolak", alasan };
      }

      if (res.status === 401 || res.status === 403) {
        // Kredensial salah juga tidak membaik bila diulang — tetapi ia TIDAK
        // boleh diam: ia mematikan kanal bagi SEMUA orang, bukan satu alamat.
        // Dilempar supaya job berakhir di DLQ dan terlihat.
        throw new EmailError("EMAIL_KREDENSIAL_TIDAK_VALID", `Resend menolak kredensial (${alasan})`, res.status);
      }

      throw new EmailError(
        res.status === 429 ? "EMAIL_RATE_LIMIT" : "EMAIL_TIDAK_TERSEDIA",
        `Resend gagal (HTTP ${res.status}, ${alasan})`,
        res.status,
      );
    },
  };
}

/** Rakit adapter dari env, atau adapter "tidak tersedia" bila kredensial kosong. */
export function createEmailSenderFromEnv(
  env: { RESEND_API_KEY?: string; EMAIL_FROM?: string; RESEND_BASE_URL?: string; EMAIL_SEND_TIMEOUT_MS?: number },
): EmailSender {
  const { RESEND_API_KEY, EMAIL_FROM } = env;
  if (RESEND_API_KEY === undefined || EMAIL_FROM === undefined) {
    return createUnavailableEmailSender();
  }

  return createEmailSender({
    apiKey: RESEND_API_KEY,
    from: EMAIL_FROM,
    baseUrl: env.RESEND_BASE_URL,
    // Disamakan dengan timeout queue `notify-email` (SDD §16, 15 detik) dikurangi
    // ruang untuk pembacaan DB di depannya — alasan yang sama dengan FCM:
    // adapter yang lebih sabar daripada job-nya selalu dipotong di tengah, dan
    // yang terlihat hanyalah job timeout tanpa sebab.
    timeoutMs: env.EMAIL_SEND_TIMEOUT_MS ?? 10_000,
  });
}
