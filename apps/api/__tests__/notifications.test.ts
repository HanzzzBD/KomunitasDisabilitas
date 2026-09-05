// Unit service notifikasi in-app (PR-047) — idempotensi, cursor, kepemilikan.
//
// Repository di-fake, tetapi fake-nya menegakkan aturan yang SAMA dengan DB:
// `id` adalah kunci primer (baris kedua ber-id sama dilewati, bukan menimpa),
// dan setiap pembacaan menyaring `userId`. Fake yang mengizinkan dua baris
// ber-id sama akan membuat test idempotensi lulus atas perilaku yang tidak ada.
//
// Yang TIDAK diuji di sini: apakah PostgreSQL benar-benar memakai indeks parsial
// untuk hitungan belum-dibaca, dan apakah `skipDuplicates` benar-benar menjadi
// ON CONFLICT DO NOTHING. Keduanya hanya bisa dijawab PostgreSQL —
// `notifications-db.test.ts`.
import { describe, it, expect, beforeEach } from "vitest";
import {
  createNotificationsService,
  idNotifikasi,
  NotifikasiTidakDitemukanError,
  type NotificationRepository,
  type NotificationRow,
} from "../src/modules/notifications/index.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const JOB = "018f4c1e-0000-7000-8000-0000000b0001";
const LAMARAN = "018f4c1e-0000-7000-8000-0000000a0001";

const SEKARANG = new Date("2026-09-05T10:00:00.000Z");

let baris: NotificationRow[] = [];

/** Fake repository: `id` kunci primer, setiap baca menyaring `userId`. */
function fakeRepository(): NotificationRepository {
  const milik = (userId: string) => baris.filter((r) => r.userId === userId);

  return {
    createMany(items) {
      let lahir = 0;
      for (const item of items) {
        // Kunci primer: yang sudah ada DILEWATI, tidak ditimpa.
        if (baris.some((r) => r.id === item.id)) continue;
        baris.push({
          id: item.id,
          userId: item.userId,
          type: item.type,
          payload: item.payload,
          readAt: null,
          // Urutan lahir menentukan waktu — cukup untuk menguji cursor, dan
          // sengaja berjarak satu detik supaya tidak ada dua baris sedetik.
          createdAt: new Date(SEKARANG.getTime() + baris.length * 1000),
        });
        lahir += 1;
      }
      return Promise.resolve(lahir);
    },

    list({ userId, limit, unreadOnly, setelah }) {
      let hasil = milik(userId);
      if (unreadOnly) hasil = hasil.filter((r) => r.readAt === null);
      hasil = [...hasil].sort((x, y) => {
        const selisih = y.createdAt.getTime() - x.createdAt.getTime();
        return selisih !== 0 ? selisih : y.id < x.id ? -1 : 1;
      });
      if (setelah !== undefined) {
        hasil = hasil.filter(
          (r) =>
            r.createdAt.getTime() < setelah.createdAt.getTime() ||
            (r.createdAt.getTime() === setelah.createdAt.getTime() && r.id < setelah.id),
        );
      }
      return Promise.resolve(hasil.slice(0, limit).map((r) => ({ ...r })));
    },

    unreadCount(userId) {
      return Promise.resolve(milik(userId).filter((r) => r.readAt === null).length);
    },

    markRead(userId, id, saat) {
      const row = baris.find((r) => r.id === id && r.userId === userId);
      if (row === undefined) return Promise.resolve(null);
      // `readAt` yang sudah terisi TIDAK digeser — sama dengan `where readAt: null`.
      if (row.readAt === null) row.readAt = saat;
      return Promise.resolve({ ...row });
    },

    findById(userId, id) {
      const row = baris.find((r) => r.id === id && r.userId === userId);
      return Promise.resolve(row === undefined ? null : { ...row });
    },
  };
}

function rakit() {
  return createNotificationsService({
    notificationRepository: fakeRepository(),
    clock: () => SEKARANG,
  });
}

const aktor = (userId: string) => ({ userId, requestId: "req-uji" });

beforeEach(() => {
  baris = [];
});

describe("terbitkan — idempotensi per peristiwa (AC)", () => {
  it("peristiwa yang sama dua kali → satu baris", async () => {
    const service = rakit();

    expect(
      await service.terbitkan({
        userId: A,
        type: "lamaran.status_berubah",
        params: { applicationId: LAMARAN, jobId: JOB, status: "interview" },
        kunciPeristiwa: `${LAMARAN}:interview`,
      }),
    ).toBe(true);

    // Terbit ulang — event yang sama, mis. karena penerbitnya diulang.
    expect(
      await service.terbitkan({
        userId: A,
        type: "lamaran.status_berubah",
        params: { applicationId: LAMARAN, jobId: JOB, status: "interview" },
        kunciPeristiwa: `${LAMARAN}:interview`,
      }),
    ).toBe(false);

    expect(baris).toHaveLength(1);
  });

  it("perpindahan status BERIKUTNYA tetap kabar tersendiri", async () => {
    const service = rakit();
    for (const status of ["in_review", "interview"] as const) {
      await service.terbitkan({
        userId: A,
        type: "lamaran.status_berubah",
        params: { applicationId: LAMARAN, jobId: JOB, status },
        kunciPeristiwa: `${LAMARAN}:${status}`,
      });
    }
    expect(baris).toHaveLength(2);
  });

  it("peristiwa sama untuk DUA penerima → dua baris (userId ikut ke dalam id)", async () => {
    // Tanpa `userId` di dalam turunan id, yang kedua akan ditolak sebagai
    // "duplikat" lalu tidak pernah sampai kepada orang yang berhak menerimanya.
    const service = rakit();
    for (const userId of [A, B]) {
      await service.terbitkan({
        userId,
        type: "lamaran.terkirim",
        params: { applicationId: LAMARAN, jobId: JOB },
        kunciPeristiwa: LAMARAN,
      });
    }
    expect(baris).toHaveLength(2);
    expect(new Set(baris.map((r) => r.id)).size).toBe(2);
  });

  it("id turunan stabil antar-proses — nilainya tidak berubah antar-pemanggilan", () => {
    // Kalau turunan ini pernah bergeser (mis. namespace diubah), seluruh
    // penjaga idempotensi berhenti mengenali barisnya sendiri.
    const sekali = idNotifikasi("lamaran.terkirim", A, LAMARAN);
    expect(idNotifikasi("lamaran.terkirim", A, LAMARAN)).toBe(sekali);
    expect(sekali).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
  });

  it("parameter yang bentuknya salah ditolak SEBELUM ditulis", async () => {
    const service = rakit();
    await expect(
      service.terbitkan({
        userId: A,
        type: "lamaran.terkirim",
        // `jobId` bukan UUID — kegagalan penerbitnya, bukan kalimat rusak
        // berbulan-bulan kemudian di layar pengguna.
        params: { applicationId: LAMARAN, jobId: "bukan-uuid" },
        kunciPeristiwa: LAMARAN,
      }),
    ).rejects.toThrow();
    expect(baris).toHaveLength(0);
  });
});

describe("list — cursor pagination", () => {
  async function isi(jumlah: number, userId = A) {
    const service = rakit();
    for (let i = 0; i < jumlah; i += 1) {
      await service.terbitkan({
        userId,
        type: "lamaran.terkirim",
        params: { applicationId: LAMARAN, jobId: JOB },
        kunciPeristiwa: `lamaran-${i}`,
      });
    }
    return service;
  }

  it("halaman stabil: tanpa item terlewat maupun terulang (AC)", async () => {
    const service = await isi(7);

    const p1 = await service.list(aktor(A), { limit: 3, unreadOnly: false });
    expect(p1.data).toHaveLength(3);
    expect(p1.meta.nextCursor).not.toBeNull();

    const p2 = await service.list(aktor(A), {
      limit: 3,
      unreadOnly: false,
      cursor: p1.meta.nextCursor as string,
    });
    const p3 = await service.list(aktor(A), {
      limit: 3,
      unreadOnly: false,
      cursor: p2.meta.nextCursor as string,
    });

    const dilihat = [...p1.data, ...p2.data, ...p3.data].map((n) => n.id);
    expect(dilihat).toHaveLength(7);
    expect(new Set(dilihat).size).toBe(7);
    // Halaman terakhir tidak menjanjikan halaman berikutnya — klien berhenti
    // menggulir tanpa pernah menerima halaman kosong.
    expect(p3.meta.nextCursor).toBeNull();
  });

  it("terbaru dulu", async () => {
    const service = await isi(3);
    const halaman = await service.list(aktor(A), { limit: 10, unreadOnly: false });
    const waktu = halaman.data.map((n) => Date.parse(n.createdAt));
    expect(waktu).toEqual([...waktu].sort((x, y) => y - x));
  });

  it("cursor rusak ditolak, bukan diam-diam kembali ke halaman pertama", async () => {
    const service = await isi(2);
    await expect(
      service.list(aktor(A), { limit: 10, unreadOnly: false, cursor: "###" }),
    ).rejects.toThrow(/Cursor tidak valid/);
  });

  it("hanya notifikasi sendiri yang terlihat", async () => {
    await isi(3, A);
    const service = await isi(2, B);
    const halaman = await service.list(aktor(B), { limit: 10, unreadOnly: false });
    expect(halaman.data).toHaveLength(2);
  });
});

describe("list — unreadCount & unreadOnly", () => {
  it("unreadCount adalah jumlah SELURUH yang belum dibaca, bukan jumlah halaman", async () => {
    const service = rakit();
    for (let i = 0; i < 5; i += 1) {
      await service.terbitkan({
        userId: A,
        type: "lamaran.terkirim",
        params: { applicationId: LAMARAN, jobId: JOB },
        kunciPeristiwa: `lamaran-${i}`,
      });
    }
    const halaman = await service.list(aktor(A), { limit: 2, unreadOnly: false });
    expect(halaman.data).toHaveLength(2);
    expect(halaman.meta.unreadCount).toBe(5);
  });

  it("unreadOnly menyaring yang sudah dibaca, tanpa mengubah unreadCount", async () => {
    const service = rakit();
    for (let i = 0; i < 3; i += 1) {
      await service.terbitkan({
        userId: A,
        type: "lamaran.terkirim",
        params: { applicationId: LAMARAN, jobId: JOB },
        kunciPeristiwa: `lamaran-${i}`,
      });
    }
    const pertama = baris[0] as NotificationRow;
    await service.markRead(aktor(A), pertama.id);

    const hanyaBelum = await service.list(aktor(A), { limit: 10, unreadOnly: true });
    expect(hanyaBelum.data).toHaveLength(2);
    expect(hanyaBelum.meta.unreadCount).toBe(2);
  });
});

describe("markRead", () => {
  async function satuNotifikasi() {
    const service = rakit();
    await service.terbitkan({
      userId: A,
      type: "auth.selamat_datang",
      params: {},
      kunciPeristiwa: "akun",
    });
    return { service, id: (baris[0] as NotificationRow).id };
  }

  it("menandai dibaca dan mengembalikan unreadCount terbaru", async () => {
    const { service, id } = await satuNotifikasi();
    const hasil = await service.markRead(aktor(A), id);
    expect(hasil.data.readAt).toBe(SEKARANG.toISOString());
    expect(hasil.meta.unreadCount).toBe(0);
  });

  it("idempoten: penandaan kedua tetap 200 dan tidak menggeser waktu baca", async () => {
    const { service, id } = await satuNotifikasi();
    const pertama = await service.markRead(aktor(A), id);
    const kedua = await service.markRead(aktor(A), id);
    expect(kedua.data.readAt).toBe(pertama.data.readAt);
  });

  it("notifikasi milik orang lain = tidak ditemukan, bukan ditolak", async () => {
    // 404, bukan 403: jawaban yang berbeda adalah cara menjawab "apakah
    // notifikasi ini ada?" kepada orang yang tidak berhak menanyakannya.
    const { service, id } = await satuNotifikasi();
    await expect(service.markRead(aktor(B), id)).rejects.toBeInstanceOf(
      NotifikasiTidakDitemukanError,
    );
    expect((baris[0] as NotificationRow).readAt).toBeNull();
  });

  it("id yang tidak ada → tidak ditemukan", async () => {
    const { service } = await satuNotifikasi();
    await expect(
      service.markRead(aktor(A), "018f4c1e-0000-7000-8000-0000000c0001"),
    ).rejects.toBeInstanceOf(NotifikasiTidakDitemukanError);
  });
});
