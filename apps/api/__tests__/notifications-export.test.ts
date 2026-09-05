// Unit kontributor ekspor PDP bagian `notifications` (utang U-04, dibayar
// 2026-09-05).
//
// UTANG YANG DILAHIRKAN PR-047 DAN TIDAK DIBAYAR DI SANA. Penjaga ekspor
// menahan `notifications` di DITUNDA dengan alasan "menunggu modul notifications
// (Phase 07)" — dan modul itu lahir di PR-047. Sejak hari itu riwayat notifikasi
// seseorang ADA dan tidak ikut terekspor. Ditemukan lewat rekonsiliasi utang,
// bukan lewat laporan pengguna.
//
// Yang dijaga berkas ini: kalimatnya DIRENDER (bukan disalin), kedua varian
// bahasa ikut, urutannya sama dengan yang dilihat pengguna, dan tidak ada
// riwayat orang lain yang menyelinap masuk.
import { describe, it, expect } from "vitest";
import {
  ACCESSIBILITY_PROFILE_KOSONG,
  dataExportSchema,
  EXPORT_FORMAT_VERSION,
  notificationSchema,
  SEEKER_PROFILE_KOSONG,
} from "@nawasena/schemas";
import {
  createNotificationsExportContributor,
  createNotificationsService,
  idNotifikasi,
  type NotificationRepository,
  type NotificationRow,
} from "../src/modules/notifications/index.js";

const USER_ID = "018f4c1e-0000-7000-8000-00000000aaaa";
const LAIN = "018f4c1e-0000-7000-8000-00000000bbbb";
const LAMARAN = "018f4c1e-0000-7000-8000-0000000a0001";
const JOB = "018f4c1e-0000-7000-8000-0000000b0001";

function baris(
  userId: string,
  kunci: string,
  type: string,
  payload: Record<string, unknown>,
  detik: number,
): NotificationRow {
  return {
    id: idNotifikasi(type, userId, kunci),
    userId,
    type,
    payload,
    readAt: null,
    createdAt: new Date(Date.UTC(2026, 8, 5, 10, 0, detik)),
  };
}

const RIWAYAT: NotificationRow[] = [
  baris(USER_ID, "akun", "auth.selamat_datang", {}, 0),
  baris(USER_ID, LAMARAN, "lamaran.terkirim", { applicationId: LAMARAN, jobId: JOB }, 1),
  baris(
    USER_ID,
    `${LAMARAN}:interview`,
    "lamaran.status_berubah",
    { applicationId: LAMARAN, jobId: JOB, status: "interview" },
    2,
  ),
  baris(LAIN, "akun", "auth.selamat_datang", {}, 3),
];

function rakit(rows: NotificationRow[] = RIWAYAT) {
  const diminta: string[] = [];

  // Service SUNGGUHAN di atas repository palsu — bukan kontributor yang
  // memalsukan service. Itu yang membuat test ini benar-benar melewati
  // renderer, yaitu bagian yang paling mudah menyimpang diam-diam.
  const repository: NotificationRepository = {
    createMany: async () => 0,
    list: async () => [],
    semuaByUserId: async (userId) => {
      diminta.push(userId);
      return rows
        .filter((r) => r.userId === userId)
        .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
        .map((r) => ({ ...r }));
    },
    unreadCount: async () => 0,
    markRead: async () => null,
    findById: async () => null,
  };

  const service = createNotificationsService({ notificationRepository: repository });
  return { kontributor: createNotificationsExportContributor({ notifications: service }), diminta };
}

describe("kontributor bagian notifications", () => {
  it("mendaftar dengan nama bagian yang ada di kontrak ekspor", () => {
    const { kontributor } = rakit();

    expect(kontributor.bagian).toBe("notifications");
    expect(Object.keys(dataExportSchema.shape)).toContain(kontributor.bagian);
  });

  it("memuat SELURUH riwayat pemiliknya, terbaru dulu", async () => {
    const { kontributor } = rakit();

    const bagian = (await kontributor.kumpulkan(USER_ID)) as unknown[];

    expect(bagian).toHaveLength(3);
    const waktu = bagian.map((n) => Date.parse(notificationSchema.parse(n).createdAt));
    expect(waktu).toEqual([...waktu].sort((x, y) => y - x));
  });

  it("kalimatnya DIRENDER, lengkap dua varian bahasa", async () => {
    // Inti keputusan PR-047: yang disimpan adalah `type` + referensi, bukan
    // kalimat. Berkas ekspor karena itu memuat kalimat versi TERBARU — termasuk
    // untuk notifikasi lama. Itu benar: kalimat lama yang buruk bagi screen
    // reader tidak pantas diabadikan ke berkas yang dibawa pengguna.
    const { kontributor } = rakit();

    const bagian = (await kontributor.kumpulkan(USER_ID)) as unknown[];
    const status = bagian
      .map((n) => notificationSchema.parse(n))
      .find((n) => n.type === "lamaran.status_berubah");

    expect(status?.title.id).toBe("Status lamaran: Undangan wawancara");
    expect(status?.title["id-simple"]).toBe("Kabar lamaran Anda: Anda diundang wawancara");
    expect(status?.body.id).not.toBe(status?.body["id-simple"]);
    // Nilai enum mentah tidak pernah bocor ke kalimat yang dibaca manusia.
    expect(JSON.stringify(status?.title)).not.toContain("interview");
  });

  it("referensi ikut sebagai params — bukan disembunyikan di dalam kalimat", async () => {
    const { kontributor } = rakit();

    const bagian = (await kontributor.kumpulkan(USER_ID)) as unknown[];
    const terkirim = bagian
      .map((n) => notificationSchema.parse(n))
      .find((n) => n.type === "lamaran.terkirim");

    expect(terkirim?.params).toEqual({ applicationId: LAMARAN, jobId: JOB });
  });

  it("riwayat orang lain TIDAK ikut", async () => {
    const { kontributor, diminta } = rakit();

    const bagian = (await kontributor.kumpulkan(USER_ID)) as unknown[];

    expect(diminta).toEqual([USER_ID]);
    expect(JSON.stringify(bagian)).not.toContain(LAIN);
  });

  it("pengguna tanpa notifikasi → array kosong, bukan gagal", async () => {
    const { kontributor } = rakit([]);

    await expect(kontributor.kumpulkan(USER_ID)).resolves.toEqual([]);
  });

  it("bagian yang dihasilkan lolos kontrak berkas penuh", async () => {
    const { kontributor } = rakit();

    const berkas = dataExportSchema.parse({
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: "2026-09-05T10:00:00.000Z",
      account: {
        id: USER_ID,
        fullName: "Rina Pratiwi",
        email: null,
        emailVerified: false,
        phone: "+6281234567890",
        role: "seeker",
        createdAt: "2026-08-01T03:00:00.000Z",
        authMethods: ["otp"],
      },
      profile: { ...SEEKER_PROFILE_KOSONG, experiences: [], educations: [], skills: [] },
      accessibility: { ...ACCESSIBILITY_PROFILE_KOSONG },
      notifications: await kontributor.kumpulkan(USER_ID),
    });

    expect(berkas.notifications).toHaveLength(3);
  });
});
