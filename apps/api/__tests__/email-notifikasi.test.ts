// Jalur email untuk NOTIFIKASI biasa (PR-049b) — AC-1, AC-3, AC-5.
//
// Terpisah dari `email.test.ts` (jalur `akun_dihapus`) dengan sengaja: kedua
// jalur punya bentuk kegagalan yang berbeda sama sekali. Yang satu kabar
// keamanan yang tidak tunduk preferensi apa pun dan dibaca dari akun yang SUDAH
// terhapus; yang ini kabar biasa yang tunduk penuh pada preferensi dan dibaca
// dari akun yang masih hidup. Satu berkas untuk keduanya berarti setiap
// pembacanya harus memegang dua model sekaligus.
//
// YANG PALING PENTING DI SINI: pemeriksaan opt-out di konsumen adalah
// PENEGAKAN, bukan pengulangan. Ia satu-satunya titik yang dilewati setiap
// produser email — termasuk produser yang belum ditulis siapa pun.
import { describe, it, expect, vi } from "vitest";
import {
  createEmailService,
  EmailError,
  idNotifikasi,
  type EmailSender,
  type HasilKirimEmail,
  type NotificationRow,
  type PesanEmail,
} from "../src/modules/notifications/index.js";

const USER = "018f4c1e-0000-7000-8000-00000000aaaa";
const LAMARAN = "018f4c1e-0000-7000-8000-0000000a0001";
const JOB_ID = "018f4c1e-0000-7000-8000-0000000b0001";
const ALAMAT = "orang@contoh.id";

const NOTIF_ID = idNotifikasi("lamaran.status_berubah", USER, `${LAMARAN}:interview`);
const JOB = { jenis: "notifikasi", userId: USER, notificationId: NOTIF_ID } as const;

const BARIS: NotificationRow = {
  id: NOTIF_ID,
  userId: USER,
  type: "lamaran.status_berubah",
  payload: { applicationId: LAMARAN, jobId: JOB_ID, status: "interview" },
  readAt: null,
  createdAt: new Date("2026-09-06T10:00:00.000Z"),
};

interface Opsi {
  akun?: {
    email: string | null;
    emailVerified: boolean;
    notificationPrefs: unknown;
  } | null;
  row?: NotificationRow | null;
  jawab?: (pesan: PesanEmail) => HasilKirimEmail;
  simpleLanguage?: boolean | null;
}

function rakit(opsi: Opsi = {}) {
  const terkirim: PesanEmail[] = [];

  const sender: EmailSender = {
    tersedia: true,
    async kirim(pesan) {
      terkirim.push(pesan);
      return opsi.jawab === undefined ? { hasil: "terkirim", id: "re_1" } : opsi.jawab(pesan);
    },
  };

  const service = createEmailService({
    penerima: {
      findPenerimaPascaHapus: async () => {
        throw new Error("Berkas ini hanya menguji jalur notifikasi (PR-049b)");
      },
      findPenerimaAktif: async () =>
        opsi.akun === undefined
          ? { email: ALAMAT, emailVerified: true, notificationPrefs: { email: true, push: null } }
          : opsi.akun,
    },
    notificationRepository: {
      findById: async () => (opsi.row === undefined ? BARIS : opsi.row),
    },
    sender,
    accessibility: {
      getMe: async () => ({ simpleLanguage: opsi.simpleLanguage ?? null }),
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

  return { service, terkirim };
}

describe("pengiriman kabar notifikasi (AC-1)", () => {
  it("subjek dan isi datang dari RENDERER NOTIFIKASI, bukan katalog email", async () => {
    // Inilah jaminan yang membuat email tidak bisa menyimpang dari layar:
    // kalimatnya dirakit `renderNotifikasi` — renderer yang sama dengan yang
    // melayani `/me/notifications` dan push.
    const { service, terkirim } = rakit();

    await expect(service.kirim(JOB)).resolves.toEqual({ terkirim: true });
    expect(terkirim[0]?.subject).toBe("Status lamaran: Undangan wawancara");
    expect(terkirim[0]?.text).toContain("Undangan wawancara");
  });

  it("kerangka email-nya sama dengan kabar keamanan — termasuk lang dan teks polos", async () => {
    const { service, terkirim } = rakit();

    await service.kirim(JOB);

    expect(terkirim[0]?.html).toContain('<html lang="id">');
    expect(terkirim[0]?.text.length).toBeGreaterThan(20);
  });

  it("TIDAK ada tautan, juga di email notifikasi", async () => {
    // Kabar boleh menyusul pengguna keluar dari aplikasi; tautan bertindak di
    // dalamnya tidak. Aturan yang sama dengan kabar pasca-hapus, dan sengaja
    // tidak dilonggarkan hanya karena kabar ini tidak bertema keamanan.
    const { service, terkirim } = rakit();

    await service.kirim(JOB);

    expect(terkirim[0]?.html).not.toMatch(/<a\b/i);
    expect(terkirim[0]?.html).not.toMatch(/https?:\/\//i);
  });
});

describe("opt-out DITEGAKKAN di konsumen (AC-3)", () => {
  it("belum pernah memilih → TIDAK dikirim (email adalah opt-in)", async () => {
    const { service, terkirim } = rakit({
      akun: { email: ALAMAT, emailVerified: true, notificationPrefs: null },
    });

    const hasil = await service.kirim(JOB);

    expect(hasil).toEqual({ terkirim: false, dilewati: "kanal-email-dimatikan" });
    expect(terkirim).toEqual([]);
  });

  it("mematikan email secara eksplisit → TIDAK dikirim", async () => {
    const { service, terkirim } = rakit({
      akun: {
        email: ALAMAT,
        emailVerified: true,
        notificationPrefs: { email: false, push: true },
      },
    });

    await expect(service.kirim(JOB)).resolves.toMatchObject({
      dilewati: "kanal-email-dimatikan",
    });
    expect(terkirim).toEqual([]);
  });

  it("preferensi berbentuk rusak → TIDAK dikirim, bukan dikirim ke semua orang", async () => {
    // Kolomnya `Json?` dan DB tidak menegakkan apa pun. Arah jatuhnya penting:
    // bentuk rusak yang jatuh ke "semua kanal menyala" akan mengirimi orang
    // email yang tidak pernah ia minta.
    const { service, terkirim } = rakit({
      akun: {
        email: ALAMAT,
        emailVerified: true,
        notificationPrefs: { email: "ya", whatsapp: true },
      },
    });

    await expect(service.kirim(JOB)).resolves.toMatchObject({
      dilewati: "kanal-email-dimatikan",
    });
    expect(terkirim).toEqual([]);
  });

  it("opt-out diperiksa SEBELUM notifikasinya dibaca", async () => {
    // Bukan kerapian: pembacaan yang tidak akan dipakai adalah perjalanan DB
    // yang dibayar untuk setiap notifikasi milik MAYORITAS pengguna, yang
    // memang tidak menyalakan email.
    let dibaca = 0;
    const service = createEmailService({
      penerima: {
        findPenerimaPascaHapus: async () => null,
        findPenerimaAktif: async () => ({
          email: ALAMAT,
          emailVerified: true,
          notificationPrefs: null,
        }),
      },
      notificationRepository: {
        findById: async () => {
          dibaca += 1;
          return BARIS;
        },
      },
      sender: { tersedia: true, kirim: async () => ({ hasil: "terkirim", id: null }) },
      accessibility: { getMe: async () => ({ simpleLanguage: null }) },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await service.kirim(JOB);

    expect(dibaca).toBe(0);
  });
});

describe("varian bahasa mengikuti preferensi pemiliknya (AC-5, ADR-008)", () => {
  it("simpleLanguage aktif → kalimat varian sederhana", async () => {
    const { service, terkirim } = rakit({ simpleLanguage: true });

    await service.kirim(JOB);

    expect(terkirim[0]?.subject).toBe("Kabar lamaran Anda: Anda diundang wawancara");
  });

  it("belum memilih → varian baku", async () => {
    const { service, terkirim } = rakit({ simpleLanguage: null });

    await service.kirim(JOB);

    expect(terkirim[0]?.subject).toBe("Status lamaran: Undangan wawancara");
  });
});

describe("keadaan yang TIDAK boleh menjadi kegagalan job", () => {
  it("akun sudah tidak aktif → selesai, bukan gagal", async () => {
    // Akun dihapus antara enqueue dan eksekusi. `findPenerimaAktif` menyaring
    // `deletedAt: null` lewat penjaga core/db, jadi barisnya memang tidak
    // terbaca — dan itu yang benar: orang yang menghapus akunnya tidak boleh
    // menerima kabar lamaran sesudahnya.
    const { service, terkirim } = rakit({ akun: null });

    await expect(service.kirim(JOB)).resolves.toEqual({
      terkirim: false,
      dilewati: "akun-hilang",
    });
    expect(terkirim).toEqual([]);
  });

  it("notifikasinya sudah tidak ada → selesai, bukan gagal", async () => {
    const { service, terkirim } = rakit({ row: null });

    await expect(service.kirim(JOB)).resolves.toEqual({
      terkirim: false,
      dilewati: "notifikasi-hilang",
    });
    expect(terkirim).toEqual([]);
  });

  it("alamat belum terbukti → TIDAK dikirim meski email dinyalakan", async () => {
    // Menyalakan sakelar bukan pembuktian kepemilikan alamat. Alamat hasil ketik
    // sendiri lewat PUT /me tidak pernah dibuktikan (PR-020a).
    const { service, terkirim } = rakit({
      akun: {
        email: "diketik-sendiri@contoh.id",
        emailVerified: false,
        notificationPrefs: { email: true, push: null },
      },
    });

    await expect(service.kirim(JOB)).resolves.toMatchObject({
      dilewati: "alamat-belum-terbukti",
    });
    expect(terkirim).toEqual([]);
  });

  it("alamat ditolak provider → selesai, bukan diulang empat kali", async () => {
    const { service } = rakit({
      jawab: () => ({ hasil: "alamat-ditolak", alasan: "Invalid to: [alamat]" }),
    });

    await expect(service.kirim(JOB)).resolves.toMatchObject({ dilewati: "alamat-ditolak" });
  });
});

describe("kegagalan yang PANTAS diulang tetap dilempar", () => {
  it("EmailError diteruskan supaya BullMQ mengulang", async () => {
    const { service } = rakit({
      jawab: () => {
        throw new EmailError("EMAIL_TIDAK_TERSEDIA", "Resend gagal (HTTP 503)");
      },
    });

    await expect(service.kirim(JOB)).rejects.toMatchObject({ code: "EMAIL_TIDAK_TERSEDIA" });
  });
});
