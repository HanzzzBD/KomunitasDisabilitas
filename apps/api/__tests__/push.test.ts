// Unit pengiriman push satu notifikasi (PR-048b) — AC-1, AC-2, AC-5.
//
// Yang dijaga berkas ini, dan alasannya masing-masing:
//
//   AC-1  push terkirim saat event status (FCM ditiru)
//   AC-2  token `UNREGISTERED` dihapus otomatis — di jalur pengiriman NORMAL,
//         bukan lewat job pembersihan terpisah yang bisa lupa dijadwalkan
//   AC-5  satu pengguna multi-device: SATU perangkat gagal tidak boleh
//         menjatuhkan sisanya
//
// Ditambah satu hal yang bukan AC tetapi inti proyek ini: varian bahasa push
// mengikuti preferensi pemiliknya (ADR-008).
import { describe, it, expect, vi } from "vitest";
import {
  createPushService,
  FcmError,
  idNotifikasi,
  type FcmSender,
  type HasilKirim,
  type NotificationRow,
  type PesanPush,
} from "../src/modules/notifications/index.js";

const USER = "018f4c1e-0000-7000-8000-00000000aaaa";
const LAMARAN = "018f4c1e-0000-7000-8000-0000000a0001";
const JOB = "018f4c1e-0000-7000-8000-0000000b0001";

const NOTIF_ID = idNotifikasi("lamaran.status_berubah", USER, `${LAMARAN}:interview`);

const BARIS: NotificationRow = {
  id: NOTIF_ID,
  userId: USER,
  type: "lamaran.status_berubah",
  payload: { applicationId: LAMARAN, jobId: JOB, status: "interview" },
  readAt: null,
  createdAt: new Date("2026-09-05T10:00:00.000Z"),
};

function perangkat(id: string, token: string) {
  return {
    id,
    userId: USER,
    fcmToken: token,
    platform: "android",
    lastSeenAt: new Date("2026-09-05T10:00:00.000Z"),
    createdAt: new Date("2026-09-05T10:00:00.000Z"),
  };
}

interface Opsi {
  row?: NotificationRow | null;
  daftar?: ReturnType<typeof perangkat>[];
  jawab?: (pesan: PesanPush) => HasilKirim | Promise<HasilKirim>;
  tersedia?: boolean;
  simpleLanguage?: boolean | null;
  accessibilityGagal?: boolean;
}

function rakit(opsi: Opsi = {}) {
  const terkirim: PesanPush[] = [];
  const dihapus: string[] = [];

  const fcm: FcmSender = {
    tersedia: opsi.tersedia ?? true,
    async kirim(pesan) {
      terkirim.push(pesan);
      return opsi.jawab === undefined ? { hasil: "terkirim" } : await opsi.jawab(pesan);
    },
  };

  const service = createPushService({
    notificationRepository: {
      findById: async () => (opsi.row === undefined ? BARIS : opsi.row),
    },
    devices: {
      milik: async () => opsi.daftar ?? [perangkat("dev-1", "token-1")],
      hapusToken: async (token) => {
        dihapus.push(token);
        return true;
      },
    },
    fcm,
    accessibility: {
      getMe: async () => {
        if (opsi.accessibilityGagal === true) throw new Error("preferensi tak terbaca");
        return { simpleLanguage: opsi.simpleLanguage ?? null };
      },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });

  return { service, terkirim, dihapus };
}

describe("pengiriman push (AC-1)", () => {
  it("mengirim judul & isi hasil render ke perangkat pemiliknya", async () => {
    const { service, terkirim } = rakit();

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(hasil).toMatchObject({ terkirim: 1, tokenDihapus: 0, gagal: 0 });
    expect(terkirim[0]?.title).toBe("Status lamaran: Undangan wawancara");
    expect(terkirim[0]?.body).toContain("Undangan wawancara");
  });

  it("data push hanya REFERENSI — tidak ada kalimat maupun data pribadi", async () => {
    // Data push mendarat di perangkat dan bisa terbaca alat lain di sana; ia
    // tempat terakhir yang pantas memuat data pribadi.
    const { service, terkirim } = rakit();

    await service.kirim(NOTIF_ID, USER);

    expect(terkirim[0]?.data).toEqual({
      notificationId: NOTIF_ID,
      type: "lamaran.status_berubah",
      applicationId: LAMARAN,
      jobId: JOB,
      status: "interview",
    });
  });
});

describe("varian bahasa mengikuti preferensi pemiliknya (ADR-008)", () => {
  it("simpleLanguage aktif → kalimat varian sederhana", async () => {
    // Pengguna yang menyalakan teks sederhana karena ia memang lebih mudah ia
    // pahami tidak boleh menerima kalimat formal hanya karena kalimat itu
    // datang lewat layar kunci.
    const { service, terkirim } = rakit({ simpleLanguage: true });

    await service.kirim(NOTIF_ID, USER);

    expect(terkirim[0]?.title).toBe("Kabar lamaran Anda: Anda diundang wawancara");
  });

  it("belum memilih (null) → varian baku", async () => {
    const { service, terkirim } = rakit({ simpleLanguage: null });

    await service.kirim(NOTIF_ID, USER);

    expect(terkirim[0]?.title).toBe("Status lamaran: Undangan wawancara");
  });

  it("preferensi tak terbaca → push TETAP terkirim dalam varian baku", async () => {
    // Kabar dalam varian baku jauh lebih baik daripada tidak ada kabar.
    const { service, terkirim } = rakit({ accessibilityGagal: true });

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(hasil.terkirim).toBe(1);
    expect(terkirim[0]?.title).toBe("Status lamaran: Undangan wawancara");
  });
});

describe("pembersihan token mati (AC-2)", () => {
  it("token-mati → barisnya dihapus, job TIDAK gagal", async () => {
    const { service, dihapus } = rakit({
      jawab: () => ({ hasil: "token-mati", alasan: "UNREGISTERED" }),
    });

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(dihapus).toEqual(["token-1"]);
    expect(hasil).toMatchObject({ terkirim: 0, tokenDihapus: 1, gagal: 0 });
  });

  it("hanya token yang mati yang dihapus — yang hidup tidak ikut", async () => {
    const { service, dihapus } = rakit({
      daftar: [perangkat("dev-1", "token-hidup"), perangkat("dev-2", "token-mati")],
      jawab: (pesan) =>
        pesan.fcmToken === "token-mati"
          ? { hasil: "token-mati", alasan: "UNREGISTERED" }
          : { hasil: "terkirim" },
    });

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(dihapus).toEqual(["token-mati"]);
    expect(hasil).toMatchObject({ terkirim: 1, tokenDihapus: 1, gagal: 0 });
  });
});

describe("multi-device (AC-5)", () => {
  it("terkirim ke SELURUH perangkat pemiliknya", async () => {
    const { service, terkirim } = rakit({
      daftar: [perangkat("dev-1", "t1"), perangkat("dev-2", "t2"), perangkat("dev-3", "t3")],
    });

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(hasil.terkirim).toBe(3);
    expect(terkirim.map((p) => p.fcmToken)).toEqual(["t1", "t2", "t3"]);
  });

  it("satu perangkat gagal TIDAK menjatuhkan sisanya", async () => {
    // Pengguna dengan ponsel dan tablet tetap harus menerima kabarnya di yang
    // satu lagi. Kegagalannya dikumpulkan, dan keputusan "ulangi" diambil
    // SETELAH semuanya dicoba.
    const { service, terkirim } = rakit({
      daftar: [perangkat("dev-1", "t1"), perangkat("dev-2", "t2"), perangkat("dev-3", "t3")],
      jawab: (pesan) => {
        if (pesan.fcmToken === "t2") throw new FcmError("FCM_RATE_LIMIT", "429");
        return { hasil: "terkirim" };
      },
    });

    // Tetap melempar supaya BullMQ mengulang — tetapi hanya SETELAH t3 dicoba.
    await expect(service.kirim(NOTIF_ID, USER)).rejects.toMatchObject({
      code: "FCM_RATE_LIMIT",
    });
    expect(terkirim.map((p) => p.fcmToken)).toEqual(["t1", "t2", "t3"]);
  });

  it("pesan galatnya menyebut BERAPA dari berapa, bukan hanya yang pertama", async () => {
    const { service } = rakit({
      daftar: [perangkat("dev-1", "t1"), perangkat("dev-2", "t2")],
      jawab: () => {
        throw new FcmError("FCM_TIDAK_TERSEDIA", "503");
      },
    });

    const err = (await service.kirim(NOTIF_ID, USER).catch((e: unknown) => e)) as Error;

    expect(err.message).toContain("2 dari 2 perangkat");
  });
});

describe("keadaan yang TIDAK boleh menjadi kegagalan job", () => {
  it("notifikasi sudah tidak ada → selesai, bukan gagal", async () => {
    // Wajar terjadi: akun dihapus (cascade) antara enqueue dan eksekusi.
    // Melemparkannya hanya akan mengisi DLQ dengan job yang tidak bisa
    // diperbaiki siapa pun.
    const { service, terkirim } = rakit({ row: null });

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(hasil.dilewati).toBe("notifikasi-hilang");
    expect(terkirim).toEqual([]);
  });

  it("pengguna tanpa perangkat → selesai, tanpa memanggil FCM", async () => {
    const { service, terkirim } = rakit({ daftar: [] });

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(hasil.dilewati).toBe("tanpa-perangkat");
    expect(terkirim).toEqual([]);
  });

  it("FCM belum dikonfigurasi → dilewati, tanpa membaca apa pun", async () => {
    const { service, terkirim } = rakit({ tersedia: false });

    const hasil = await service.kirim(NOTIF_ID, USER);

    expect(hasil.dilewati).toBe("fcm-mati");
    expect(terkirim).toEqual([]);
  });
});
