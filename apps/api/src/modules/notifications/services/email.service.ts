// modules/notifications — pengiriman satu kabar lewat email (PR-049a).
//
// Hidup di `modules/notifications` DAN BUKAN di `apps/worker`, meski satu-satunya
// pemanggilnya adalah processor di sana. Alasannya sama dengan `push.service.ts`
// dan `processors/ai-usage.ts`: `apps/worker` berjalan tanpa satu pun test
// (`--passWithNoTests`), jadi setiap keputusan yang tinggal di sana adalah
// keputusan yang tidak pernah diuji. Yang boleh tinggal di processor hanyalah
// validasi payload dan log.
//
// KENAPA ALAMATNYA DIBACA DI SINI, BUKAN DIBAWA PAYLOAD JOB. Payload mengendap
// di Redis (AOF, `noeviction`) di luar jangkauan enkripsi kolom ADR-007, dan
// alamat email adalah PII. Aturan yang sama dengan `notify:push` yang membawa
// `notificationId` alih-alih token perangkat.
//
// PEMBACAANNYA MENEMBUS SOFT DELETE — dan memang harus. Pada saat job ini
// berjalan, akunnya SUDAH terhapus; query yang menyaring `deletedAt: null`
// (bawaan penjaga core/db) akan mengembalikan `null` untuk setiap penerima yang
// sah, sehingga tidak satu pun kabar pernah terkirim. Jalan keluarnya ditulis
// eksplisit di `findPenerimaPascaHapus`, di repository modul auth, tempat tabel
// `users` memang dimiliki.
import type { NotifyEmailJenis, NotifyEmailJob } from "@nawasena/schemas";
import type { Logger } from "../../../core/logger/index.js";
import { EmailError, type EmailSender } from "./email.sender.js";
import { renderEmail } from "./email-template.service.js";

/**
 * Sumber alamat tujuan. Bentuknya interface, bukan repository yang di-import:
 * tabel `users` dimiliki modul auth, dan satu-satunya jalan masuk yang sah
 * adalah parameter di composition root (aturan boundaries PR-002). Pola yang
 * sama dengan `accessibility` pada `push.service.ts`.
 */
export interface SumberPenerima {
  findPenerimaPascaHapus(
    userId: string,
  ): Promise<{ email: string | null; emailVerified: boolean } | null>;
}

export interface EmailServiceDeps {
  penerima: SumberPenerima;
  sender: EmailSender;
  /**
   * Preferensi aksesibilitas penerima — untuk memilih varian bahasa (ADR-008).
   * Barisnya SELAMAT dari soft delete akun (yang terhapus hanya `users`), jadi
   * pilihan bahasa seseorang tetap dihormati pada kabar terakhir yang ia terima.
   */
  accessibility: {
    getMe(actor: { userId: string; requestId: string }): Promise<{ simpleLanguage: boolean | null }>;
  };
  logger: Pick<Logger, "info" | "warn" | "error">;
}

export interface HasilEmail {
  terkirim: boolean;
  /**
   * Sebab kabar TIDAK dikirim, bila tidak dikirim. Job tetap SELESAI (bukan
   * gagal) untuk seluruh nilai di bawah — tak satu pun akan membaik bila
   * diulang, dan DLQ yang berisi hal-hal yang tidak bisa diperbaiki siapa pun
   * adalah DLQ yang berhenti dibaca orang.
   */
  dilewati?:
    | "kanal-mati"
    | "akun-tidak-terhapus"
    | "tanpa-alamat"
    | "alamat-belum-terbukti"
    | "alamat-ditolak";
}

export function createEmailService(deps: EmailServiceDeps) {
  const { penerima, sender, accessibility, logger } = deps;

  /** Varian bahasa pilihan penerima; kegagalan membacanya TIDAK menggagalkan kabar. */
  async function sederhanaUntuk(userId: string, jenis: NotifyEmailJenis): Promise<boolean> {
    try {
      const preferensi = await accessibility.getMe({ userId, requestId: `email:${jenis}` });
      return preferensi.simpleLanguage === true;
    } catch (err) {
      logger.warn({ err, jenis }, "Preferensi bahasa tak terbaca — email memakai varian baku");
      return false;
    }
  }

  return {
    /**
     * Kirim satu kabar email.
     *
     * MELEMPAR hanya untuk kegagalan yang pantas diulang (jaringan, timeout,
     * 429, 5xx, kredensial ditolak) — itulah cara memberi tahu BullMQ untuk
     * mencoba lagi (4 attempts, backoff 30 dtk, SDD §16). Selebihnya selesai
     * dengan `dilewati`.
     */
    async kirim(job: NotifyEmailJob): Promise<HasilEmail> {
      const { jenis, userId } = job;

      if (!sender.tersedia) {
        // BERISIK, dan sengaja `error` alih-alih `warn` seperti pada push.
        // Kabar ini SATU-SATUNYA yang diterima penerimanya (gerbang U-02):
        // kanal email yang mati berarti seseorang tidak pernah tahu akunnya
        // dihapus, dan itu bukan keadaan yang boleh lewat sebagai catatan kecil.
        logger.error({ jenis }, "Kredensial email belum diatur — kabar TIDAK terkirim");
        return { terkirim: false, dilewati: "kanal-mati" };
      }

      const baris = await penerima.findPenerimaPascaHapus(userId);
      if (baris === null) {
        // Akun tidak (lagi) terhapus: dipulihkan lewat support di antara
        // enqueue dan eksekusi, atau sudah ter-purge. Mengabarkan penghapusan
        // yang sudah dibatalkan lebih buruk daripada tidak mengabarkan apa pun.
        logger.info({ jenis }, "Akun tidak lagi berstatus terhapus — kabar dilewati");
        return { terkirim: false, dilewati: "akun-tidak-terhapus" };
      }

      if (baris.email === null) {
        // Tidak seharusnya terjadi: produsernya hanya mengantre untuk akun tanpa
        // nomor HP, dan akun tanpa nomor HP selalu berasal dari Google yang
        // membawa alamat. Dicatat sebagai `error` justru karena begitu — ia
        // berarti ada akun tanpa satu pun kanal, dan itu perlu dilihat orang.
        logger.error({ jenis }, "Akun tanpa nomor HP DAN tanpa alamat email — tidak ada kanal");
        return { terkirim: false, dilewati: "tanpa-alamat" };
      }

      if (!baris.emailVerified) {
        // Alamat yang diketik sendiri lewat PUT /me tidak pernah terbukti
        // miliknya (PR-020a). Mengirimi kabar "akun Anda sudah dihapus" ke
        // alamat yang belum terbukti berarti mengabarkan keadaan akun seseorang
        // kepada orang lain yang kebetulan alamatnya diketikkan — dan pada
        // pesan bertema keamanan, itu justru bahan phishing yang ampuh.
        logger.warn({ jenis }, "Alamat email belum terbukti milik akun — kabar dilewati");
        return { terkirim: false, dilewati: "alamat-belum-terbukti" };
      }

      const isi = renderEmail(jenis, await sederhanaUntuk(userId, jenis));

      let hasil;
      try {
        hasil = await sender.kirim({
          to: baris.email,
          subject: isi.subject,
          html: isi.html,
          text: isi.text,
        });
      } catch (err) {
        if (err instanceof EmailError) {
          // Alamat tujuan TIDAK ikut — lihat aturan di kepala email.sender.ts.
          logger.warn({ jenis, code: err.code }, "Pengiriman email gagal");
        }
        throw err;
      }

      if (hasil.hasil === "alamat-ditolak") {
        logger.warn({ jenis, alasan: hasil.alasan }, "Alamat tujuan ditolak provider");
        return { terkirim: false, dilewati: "alamat-ditolak" };
      }

      logger.info({ jenis, providerId: hasil.id }, "Kabar email terkirim");
      return { terkirim: true };
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
