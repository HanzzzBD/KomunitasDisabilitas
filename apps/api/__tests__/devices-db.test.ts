// Integration DB perangkat push (PR-048a) — butuh PostgreSQL.
// Skip otomatis bila DB tidak terjangkau.
//
// Ditulis sebagai test DB karena tiga hal yang HANYA PostgreSQL yang bisa
// menjawab, dan ketiganya adalah jaminan keamanan — bukan optimasi:
//
//   1. apakah `fcm_token` benar-benar UNIK GLOBAL, sehingga perangkat yang
//      berpindah akun berpindah kepemilikan alih-alih menggandakan diri;
//   2. apakah `upsert` menang atas balapan dua pendaftaran bersamaan;
//   3. apakah menghapus akun benar-benar membawa serta token perangkatnya —
//      token yang tertinggal masih hidup di perangkat fisik seseorang.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import {
  createDeviceRepository,
  createDevicesService,
} from "../src/modules/notifications/index.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();

const TANDA = "Uji PR-048a";

let dbTersedia = false;
let userA = "";
let userB = "";

const repository = createDeviceRepository(prisma);
const service = createDevicesService({ deviceRepository: repository });

const aktor = (userId: string) => ({ userId, requestId: "req-uji" });

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test perangkat dilewati.");
    return;
  }
  userA = uuidV7();
  userB = uuidV7();
  await mentah.user.createMany({
    data: [
      { id: userA, fullName: `${TANDA} pemilik lama` },
      { id: userB, fullName: `${TANDA} pemilik baru` },
    ],
  });
});

async function bersihkan(): Promise<void> {
  if (!dbTersedia) return;
  await mentah.device.deleteMany({ where: { userId: { in: [userA, userB] } } });
}

beforeEach(bersihkan);

afterAll(async () => {
  if (dbTersedia) {
    await bersihkan();
    await mentah.user.deleteMany({ where: { fullName: { startsWith: TANDA } } });
  }
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

describe("token unik global (AC keamanan)", () => {
  it("perangkat berpindah akun → SATU baris, pemiliknya berpindah", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const token = `${TANDA}-token-pindah`;

    await service.register(aktor(userA), { fcmToken: token, platform: "android" });
    await service.register(aktor(userB), { fcmToken: token, platform: "android" });

    const baris = await mentah.device.findMany({ where: { fcmToken: token } });
    expect(baris).toHaveLength(1);
    expect(baris[0]?.userId).toBe(userB);

    // Dan pemilik lama benar-benar kehilangan sasaran push-nya — inilah
    // akibat yang sesungguhnya dijaga, bukan jumlah barisnya.
    expect(await repository.byUserId(userA)).toEqual([]);
  });

  it("dua pendaftaran PARALEL token yang sama → tepat satu baris", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Balapan nyata: aplikasi diluncurkan, klien mencoba ulang karena jaringan
    // lambat, dua permintaan tiba hampir bersamaan. "Cari lalu tulis" akan
    // meloloskan keduanya melewati pemeriksaan sebelum salah satunya menulis.
    const token = `${TANDA}-token-paralel`;
    const daftar = () => service.register(aktor(userA), { fcmToken: token, platform: "ios" });

    const hasil = await Promise.allSettled([daftar(), daftar()]);
    const gagal = hasil.filter((h) => h.status === "rejected");

    expect(await mentah.device.count({ where: { fcmToken: token } })).toBe(1);
    // Upsert menyerahkan penyelesaiannya ke DB; keduanya boleh sukses.
    // Yang tidak boleh: dua baris. Bila salah satu gagal, itu P2002 yang wajar
    // pada balapan upsert PostgreSQL — barisnya tetap satu.
    expect(gagal.length).toBeLessThanOrEqual(1);
  });

  it("id baris TIDAK berubah saat pendaftaran ulang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const token = `${TANDA}-token-tetap`;

    const pertama = await service.register(aktor(userA), { fcmToken: token, platform: "android" });
    const kedua = await service.register(aktor(userA), { fcmToken: token, platform: "android" });

    expect(kedua.id).toBe(pertama.id);
    expect(kedua.createdAt).toBe(pertama.createdAt);
    // `lastSeenAt` justru HARUS bergerak — ia dasar pembersihan perangkat yang
    // sudah lama tidak menyapa.
    expect(Date.parse(kedua.lastSeenAt)).toBeGreaterThanOrEqual(Date.parse(pertama.lastSeenAt));
  });
});

describe("pembersihan token", () => {
  it("hapusByToken menghapus baris siapa pun pemiliknya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Pemanggilnya (processor push, PR-048b) bekerja atas nama sistem: FCM baru
    // saja memberi tahu bahwa token ini mati. Menuntut `userId` akan membuat
    // token yang sudah berpindah pemilik luput dari pembersihan.
    const token = `${TANDA}-token-mati`;
    await service.register(aktor(userA), { fcmToken: token, platform: "web" });

    expect(await repository.hapusByToken(token)).toBe(true);
    expect(await mentah.device.count({ where: { fcmToken: token } })).toBe(0);
    // Token yang sudah tidak ada bukan kegagalan — processor boleh mengulang.
    expect(await repository.hapusByToken(token)).toBe(false);
  });

  it("menghapus akun membawa serta perangkatnya (cascade)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Token yang tertinggal masih hidup di perangkat fisik seseorang. Ini
    // jalur hapus-penuh; jalur ANONIMISASI tidak memicu cascade dan karena itu
    // `device` masuk TABEL_DIHAPUS di purge.service.ts — dijaga terpisah oleh
    // purge-kelengkapan.test.ts.
    const sementara = uuidV7();
    await mentah.user.create({ data: { id: sementara, fullName: `${TANDA} sementara` } });
    await service.register(aktor(sementara), {
      fcmToken: `${TANDA}-token-cascade`,
      platform: "android",
    });

    await mentah.user.delete({ where: { id: sementara } });

    expect(await mentah.device.count({ where: { userId: sementara } })).toBe(0);
  });
});

describe("daftar perangkat pemilik", () => {
  it("hanya perangkat sendiri, terbaru menyapa lebih dulu", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await service.register(aktor(userA), { fcmToken: `${TANDA}-a1`, platform: "android" });
    await service.register(aktor(userA), { fcmToken: `${TANDA}-a2`, platform: "ios" });
    await service.register(aktor(userB), { fcmToken: `${TANDA}-b1`, platform: "web" });

    const milikA = await service.milik(userA);
    expect(milikA).toHaveLength(2);
    expect(milikA.every((d) => d.userId === userA)).toBe(true);

    const waktu = milikA.map((d) => d.lastSeenAt.getTime());
    expect(waktu).toEqual([...waktu].sort((x, y) => y - x));
  });
});
