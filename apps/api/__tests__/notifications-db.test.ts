// Integration DB notifikasi in-app (PR-047) — butuh PostgreSQL.
// Skip otomatis bila DB tidak terjangkau.
//
// Ditulis sebagai test DB, bukan unit test, karena tiga hal yang HANYA
// PostgreSQL yang bisa menjawab:
//
//   1. apakah `createMany({ skipDuplicates })` benar-benar menjadi
//      ON CONFLICT DO NOTHING — penjaga idempotensi seluruh modul ini;
//   2. apakah hitungan belum-dibaca benar-benar memakai indeks parsial
//      `notifications_unread` (AC: "Unread count memakai partial index (EXPLAIN)");
//   3. apakah keyset (createdAt, id) benar-benar stabil saat baris BARU lahir
//      di tengah penyusuran — kelemahan OFFSET yang menjadi alasan memilih
//      keyset, dan yang tidak akan pernah terlihat pada fake in-memory.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import {
  createNotificationRepository,
  createNotificationsService,
  idNotifikasi,
} from "../src/modules/notifications/index.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();

const TANDA = "Uji PR-047";

let dbTersedia = false;
let userId = "";
let userLain = "";

const repository = createNotificationRepository(prisma);
const service = createNotificationsService({ notificationRepository: repository });

const aktor = (id: string) => ({ userId: id, requestId: "req-uji" });

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test notifikasi dilewati.");
    return;
  }
  userId = uuidV7();
  userLain = uuidV7();
  await mentah.user.createMany({
    data: [
      { id: userId, fullName: `${TANDA} pemilik` },
      { id: userLain, fullName: `${TANDA} orang lain` },
    ],
  });
});

async function bersihkan(): Promise<void> {
  if (!dbTersedia) return;
  await mentah.notification.deleteMany({ where: { userId: { in: [userId, userLain] } } });
}

beforeEach(bersihkan);

afterAll(async () => {
  if (dbTersedia) {
    await bersihkan();
    await mentah.user.deleteMany({ where: { fullName: { startsWith: TANDA } } });
  }
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

/** Terbitkan satu notifikasi lamaran ber-kunci peristiwa tertentu. */
function terbitkan(kunci: string, penerima = userId): Promise<boolean> {
  return service.terbitkan({
    userId: penerima,
    type: "lamaran.terkirim",
    params: { applicationId: uuidV7(), jobId: uuidV7() },
    kunciPeristiwa: kunci,
  });
}

describe("idempotensi ditegakkan DATABASE (AC)", () => {
  it("peristiwa yang sama dua kali → satu baris, tanpa error", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    expect(await terbitkan("peristiwa-1")).toBe(true);
    // Yang kedua TIDAK melempar: ON CONFLICT DO NOTHING, bukan P2002 yang harus
    // ditangkap pemanggil. Penerbit event tidak boleh perlu tahu bahwa
    // notifikasinya sudah pernah lahir.
    expect(await terbitkan("peristiwa-1")).toBe(false);

    expect(await mentah.notification.count({ where: { userId } })).toBe(1);
  });

  it("dua penulisan PARALEL atas peristiwa yang sama → tepat satu baris", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Inilah balapan yang tidak bisa dimenangkan pemeriksaan di aplikasi
    // ("cek dulu, lalu tulis"): dua proses membaca "belum ada" pada saat yang
    // sama, lalu keduanya menulis. Kunci primer tidak pernah kalah balapan.
    const hasil = await Promise.all([
      terbitkan("peristiwa-paralel"),
      terbitkan("peristiwa-paralel"),
    ]);

    expect(hasil.filter(Boolean)).toHaveLength(1);
    expect(await mentah.notification.count({ where: { userId } })).toBe(1);
  });

  it("id baris memang turunan peristiwanya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await terbitkan("peristiwa-2");
    const row = await mentah.notification.findFirst({ where: { userId } });
    expect(row?.id).toBe(idNotifikasi("lamaran.terkirim", userId, "peristiwa-2"));
  });
});

describe("hitungan belum-dibaca memakai indeks parsial (AC)", () => {
  it("EXPLAIN menyebut notifications_unread", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const plan = await prisma.$transaction(async (tx) => {
      // `enable_seqscan = off` seperti pada db-marketplace.test.ts: tabel test
      // terlalu kecil untuk membuat planner memilih indeks atas kemauannya
      // sendiri, dan yang diuji di sini adalah apakah indeksnya BISA dipakai
      // oleh bentuk query ini — bukan berapa banyak baris yang kebetulan ada.
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
        EXPLAIN SELECT count(*) FROM notifications
        WHERE user_id = ${userId}::uuid AND read_at IS NULL
      `;
    });

    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("notifications_unread");
  });

  it("angkanya benar: hanya yang belum dibaca, hanya milik pemanggil", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await terbitkan("a");
    await terbitkan("b");
    await terbitkan("c", userLain);

    const sebelum = await repository.unreadCount(userId);
    expect(sebelum).toBe(2);

    const row = await mentah.notification.findFirst({ where: { userId } });
    await service.markRead(aktor(userId), row?.id ?? "");

    expect(await repository.unreadCount(userId)).toBe(1);
    expect(await repository.unreadCount(userLain)).toBe(1);
  });
});

describe("cursor pagination stabil di PostgreSQL (AC)", () => {
  it("menyusuri seluruh daftar tanpa terlewat maupun terulang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    for (let i = 0; i < 7; i += 1) await terbitkan(`urut-${i}`);

    const dilihat: string[] = [];
    let cursor: string | undefined;
    for (let putaran = 0; putaran < 7; putaran += 1) {
      const halaman = await service.list(aktor(userId), { limit: 3, unreadOnly: false, cursor });
      dilihat.push(...halaman.data.map((n) => n.id));
      if (halaman.meta.nextCursor === null) break;
      cursor = halaman.meta.nextCursor;
    }

    expect(dilihat).toHaveLength(7);
    expect(new Set(dilihat).size).toBe(7);
  });

  it("baris BARU yang lahir di tengah penyusuran tidak menggeser halaman berikutnya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Inilah kegagalan OFFSET: notifikasi baru masuk di puncak daftar, seluruh
    // halaman bergeser satu, dan pengguna melihat satu item dua kali sambil
    // melewatkan satu yang lain. Keyset menyebut POSISI, jadi kebal.
    for (let i = 0; i < 5; i += 1) await terbitkan(`awal-${i}`);

    const p1 = await service.list(aktor(userId), { limit: 2, unreadOnly: false });
    await terbitkan("penyusup");

    const p2 = await service.list(aktor(userId), {
      limit: 2,
      unreadOnly: false,
      cursor: p1.meta.nextCursor as string,
    });

    const tumpang = p2.data.filter((n) => p1.data.some((awal) => awal.id === n.id));
    expect(tumpang).toEqual([]);
  });

  it("baris yang lahir dalam TRANSAKSI yang sama (created_at identik) tetap berurutan tetap", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // `now()` beku di dalam satu transaksi, jadi ketiganya berbagi `created_at`
    // yang sama persis — keadaan yang membuat `ORDER BY created_at` saja
    // mengembalikan urutan sembarang. Penengahnya `id`.
    await mentah.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: [0, 1, 2].map((i) => ({
          id: idNotifikasi("lamaran.terkirim", userId, `serentak-${i}`),
          userId,
          type: "lamaran.terkirim",
          payload: { applicationId: uuidV7(), jobId: uuidV7() },
        })),
      });
    });

    const p1 = await service.list(aktor(userId), { limit: 2, unreadOnly: false });
    const p2 = await service.list(aktor(userId), {
      limit: 2,
      unreadOnly: false,
      cursor: p1.meta.nextCursor as string,
    });

    const semua = [...p1.data, ...p2.data].map((n) => n.id);
    expect(semua).toHaveLength(3);
    expect(new Set(semua).size).toBe(3);
  });
});

describe("kepemilikan ditegakkan query, bukan pemeriksaan terpisah", () => {
  it("markRead atas notifikasi orang lain tidak menyentuh barisnya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await terbitkan("milik-orang-lain", userLain);
    const row = await mentah.notification.findFirst({ where: { userId: userLain } });

    await expect(service.markRead(aktor(userId), row?.id ?? "")).rejects.toThrow(
      /tidak ditemukan/i,
    );

    const sesudah = await mentah.notification.findUnique({ where: { id: row?.id ?? "" } });
    expect(sesudah?.readAt).toBeNull();
  });
});
