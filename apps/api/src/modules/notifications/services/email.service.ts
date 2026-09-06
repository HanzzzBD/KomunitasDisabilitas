// modules/notifications — pengiriman satu kabar lewat email (PR-049a, diperluas PR-049b).
//
// Hidup di `modules/notifications` DAN BUKAN di `apps/worker`, meski satu-satunya
// pemanggilnya adalah processor di sana. Alasannya sama dengan `push.service.ts`
// dan `processors/ai-usage.ts`: `apps/worker` berjalan tanpa satu pun test
// (`--passWithNoTests`), jadi setiap keputusan yang tinggal di sana adalah
// keputusan yang tidak pernah diuji. Yang boleh tinggal di processor hanyalah
// validasi payload dan log.
//
// DUA JENIS KABAR, DAN PERBEDAANNYA BUKAN KEHALUSAN:
//
//   `akun_dihapus` — SATU-SATUNYA kanal penerimanya (gerbang U-02). Tidak tunduk
//                    preferensi apa pun, dan dibaca dari akun yang SUDAH terhapus.
//   `notifikasi`   — kabar yang juga ada di layar dan mungkin di layar kunci.
//                    Tunduk penuh pada preferensi kanal, dan dibaca dari akun
//                    yang masih hidup.
//
// Keduanya sengaja tidak berbagi jalur pembacaan: menyatukannya berarti satu
// query yang harus buta-atau-tidak-buta terhadap soft delete tergantung
// argumen, dan query semacam itu adalah tempat kebocoran akun terhapus lahir.
//
// KENAPA ALAMATNYA DIBACA DI SINI, BUKAN DIBAWA PAYLOAD JOB. Payload mengendap
// di Redis (AOF, `noeviction`) di luar jangkauan enkripsi kolom ADR-007, dan
// alamat email adalah PII. Aturan yang sama dengan `notify:push` yang membawa
// `notificationId` alih-alih token perangkat.
import {
  kanalBerlaku,
  notificationChannelPrefsSchema,
  NOTIFICATION_PARAM_SCHEMAS,
  type NotificationChannelPrefs,
  type NotificationType,
  type NotifyEmailJob,
} from "@nawasena/schemas";
import type { Logger } from "../../../core/logger/index.js";
import type { NotificationRepository } from "../repositories/notifications.repository.js";
import { EmailError, type EmailSender } from "./email.sender.js";
import { renderEmail, renderEmailNotifikasi } from "./email-template.service.js";
import { renderNotifikasi } from "./template.service.js";

/**
 * Sumber alamat tujuan. Bentuknya interface, bukan repository yang di-import:
 * tabel `users` dimiliki modul auth/users, dan satu-satunya jalan masuk yang sah
 * adalah parameter di composition root (aturan boundaries PR-002). Pola yang
 * sama dengan `accessibility` pada `push.service.ts`.
 */
export interface SumberPenerima {
  /** Akun yang SUDAH terhapus — jalur `akun_dihapus`. */
  findPenerimaPascaHapus(
    userId: string,
  ): Promise<{ email: string | null; emailVerified: boolean } | null>;
  /**
   * Akun yang MASIH aktif — jalur `notifikasi`. Preferensi kanal ikut dibaca di
   * query yang SAMA: pemeriksaan opt-out di sini karena itu tidak berbiaya satu
   * perjalanan DB pun, dan tidak ada alasan melewatkannya.
   */
  findPenerimaAktif(userId: string): Promise<{
    email: string | null;
    emailVerified: boolean;
    notificationPrefs: unknown;
  } | null>;
}

export interface EmailServiceDeps {
  penerima: SumberPenerima;
  /** Baris notifikasi — jalur `notifikasi`. Kalimatnya dirakit dari sini. */
  notificationRepository: Pick<NotificationRepository, "findById">;
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
    | "akun-hilang"
    | "notifikasi-hilang"
    | "kanal-email-dimatikan"
    | "tanpa-alamat"
    | "alamat-belum-terbukti"
    | "alamat-ditolak";
}

/**
 * Baca preferensi kanal dari kolom jsonb tanpa mempercayai bentuknya.
 *
 * Kolomnya `Json?`: DB tidak menegakkan apa pun di sana, dan baris yang ditulis
 * versi kode lain (atau tangan operator) bisa berbentuk apa saja. Yang gagal
 * di-parse diperlakukan sebagai "belum memilih" — bukan sebagai kegagalan job,
 * dan bukan pula sebagai "semua kanal menyala": bentuk rusak tidak boleh
 * menjadi alasan mengirimi orang email yang tidak pernah ia minta.
 */
export function bacaPreferensiKanal(nilai: unknown): NotificationChannelPrefs | null {
  const hasil = notificationChannelPrefsSchema.safeParse(nilai);
  return hasil.success ? hasil.data : null;
}

export function createEmailService(deps: EmailServiceDeps) {
  const { penerima, notificationRepository, sender, accessibility, logger } = deps;

  /** Varian bahasa pilihan penerima; kegagalan membacanya TIDAK menggagalkan kabar. */
  async function sederhanaUntuk(userId: string, jenis: string): Promise<boolean> {
    try {
      const preferensi = await accessibility.getMe({ userId, requestId: `email:${jenis}` });
      return preferensi.simpleLanguage === true;
    } catch (err) {
      logger.warn({ err, jenis }, "Preferensi bahasa tak terbaca — email memakai varian baku");
      return false;
    }
  }

  /**
   * Alamat yang boleh dikirimi, atau alasan kenapa tidak.
   *
   * `emailVerified` WAJIB. Alamat hasil ketik sendiri lewat `PUT /me` tidak
   * pernah dibuktikan miliknya (PR-020a); mengirimi kabar tentang akun seseorang
   * ke sana berarti mengabarkan keadaan akun kepada orang lain yang kebetulan
   * alamatnya diketikkan.
   */
  function alamatSah(
    baris: { email: string | null; emailVerified: boolean },
    jenis: string,
  ): { alamat: string } | { dilewati: NonNullable<HasilEmail["dilewati"]> } {
    if (baris.email === null) {
      logger.warn({ jenis }, "Akun tanpa alamat email — kabar email dilewati");
      return { dilewati: "tanpa-alamat" };
    }
    if (!baris.emailVerified) {
      logger.warn({ jenis }, "Alamat email belum terbukti milik akun — kabar dilewati");
      return { dilewati: "alamat-belum-terbukti" };
    }
    return { alamat: baris.email };
  }

  /** Kirim satu email yang sudah dirakit; hanya di sinilah provider disentuh. */
  async function kirimKe(
    alamat: string,
    isi: { subject: string; html: string; text: string },
    jenis: string,
  ): Promise<HasilEmail> {
    let hasil;
    try {
      hasil = await sender.kirim({ to: alamat, ...isi });
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
  }

  /** Jalur `akun_dihapus` — kabar yang tidak punya kanal lain (PR-049a). */
  async function kirimPascaHapus(userId: string): Promise<HasilEmail> {
    const jenis = "akun_dihapus";
    const baris = await penerima.findPenerimaPascaHapus(userId);
    if (baris === null) {
      // Dipulihkan lewat support di antara enqueue dan eksekusi, atau sudah
      // ter-purge. Mengabarkan penghapusan yang sudah dibatalkan lebih buruk
      // daripada tidak mengabarkan apa pun.
      logger.info({ jenis }, "Akun tidak lagi berstatus terhapus — kabar dilewati");
      return { terkirim: false, dilewati: "akun-tidak-terhapus" };
    }

    const tujuan = alamatSah(baris, jenis);
    if ("dilewati" in tujuan) {
      if (tujuan.dilewati === "tanpa-alamat") {
        // Tidak seharusnya terjadi: produsernya hanya mengantre untuk akun tanpa
        // nomor HP, dan akun tanpa nomor HP selalu berasal dari Google yang
        // membawa alamat. Dinaikkan ke `error` justru karena begitu — ia berarti
        // ada akun tanpa satu pun kanal.
        logger.error({ jenis }, "Akun tanpa nomor HP DAN tanpa alamat email — tidak ada kanal");
      }
      return { terkirim: false, dilewati: tujuan.dilewati };
    }

    const isi = renderEmail("akun_dihapus", await sederhanaUntuk(userId, jenis));
    return kirimKe(tujuan.alamat, isi, jenis);
  }

  /** Jalur `notifikasi` — kabar yang juga ada di layar (PR-049b). */
  async function kirimNotifikasi(userId: string, notificationId: string): Promise<HasilEmail> {
    const jenis = "notifikasi";
    const baris = await penerima.findPenerimaAktif(userId);
    if (baris === null) {
      // Akun dihapus antara enqueue dan eksekusi. Job SELESAI, bukan gagal.
      logger.info({ jenis }, "Akun sudah tidak aktif saat email dijalankan");
      return { terkirim: false, dilewati: "akun-hilang" };
    }

    // PEMERIKSAAN OPT-OUT ADA DI SINI, DI KONSUMEN, DAN ITU DISENGAJA. Produser
    // juga memeriksanya (lihat modules/notifications/index.ts), tetapi itu
    // OPTIMASI — supaya mayoritas pengguna yang tidak pernah menyalakan email
    // tidak melahirkan job yang pasti dibuang. Yang MENEGAKKAN aturannya adalah
    // pemeriksaan ini: ia satu-satunya titik yang dilewati setiap produser
    // email, termasuk produser yang belum ditulis siapa pun.
    //
    // Konsekuensinya jujur: pengguna yang mematikan email SESUDAH job terlanjur
    // mengantre tetap tidak menerimanya — preferensinya dibaca saat kabar
    // dikirim, bukan saat kabar lahir. Itu arah yang benar bagi sebuah opt-out.
    if (!kanalBerlaku(bacaPreferensiKanal(baris.notificationPrefs)).email) {
      return { terkirim: false, dilewati: "kanal-email-dimatikan" };
    }

    const tujuan = alamatSah(baris, jenis);
    if ("dilewati" in tujuan) return { terkirim: false, dilewati: tujuan.dilewati };

    const row = await notificationRepository.findById(userId, notificationId);
    if (row === null) {
      logger.info({ jenis }, "Notifikasi sudah tidak ada saat email dijalankan");
      return { terkirim: false, dilewati: "notifikasi-hilang" };
    }

    const type = row.type as NotificationType;
    const params = NOTIFICATION_PARAM_SCHEMAS[type].parse(row.payload ?? {});
    // Renderer yang SAMA dengan yang melayani layar dan push. Email tidak punya
    // katalog kalimatnya sendiri, jadi tidak ada yang bisa menyimpang.
    const teks = renderNotifikasi(type, params);
    const isi = renderEmailNotifikasi(teks, await sederhanaUntuk(userId, jenis));

    return kirimKe(tujuan.alamat, isi, jenis);
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
      if (!sender.tersedia) {
        // BERISIK, dan sengaja `error` alih-alih `warn` seperti pada push:
        // salah satu kabar di antrean ini (`akun_dihapus`) adalah SATU-SATUNYA
        // yang diterima penerimanya (gerbang U-02). Kanal email yang mati
        // berarti seseorang tidak pernah tahu akunnya dihapus.
        logger.error({ jenis: job.jenis }, "Kredensial email belum diatur — kabar TIDAK terkirim");
        return { terkirim: false, dilewati: "kanal-mati" };
      }

      switch (job.jenis) {
        case "akun_dihapus":
          return kirimPascaHapus(job.userId);
        case "notifikasi":
          return kirimNotifikasi(job.userId, job.notificationId);
        default: {
          // Kelengkapan katalog email ditegakkan DI SINI sejak PR-049b: jenis
          // baru tanpa jalur render adalah `typecheck` merah, bukan email
          // kosong yang lolos ke daftar masuk seseorang.
          const takTerduga: never = job;
          throw new Error(`Jenis kabar email tidak dikenal: ${JSON.stringify(takTerduga)}`);
        }
      }
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
