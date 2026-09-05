// Penegakan append-only `audit_logs` di tingkat DATABASE (migrasi 13).
//
// KENAPA BERKAS INI ADA. Larangan UPDATE/DELETE atas catatan audit sudah
// tertulis di `prisma/README.md` dan CLAUDE.md sejak PR-009, tetapi
// penegakannya hanya "disiplin kode + review". Disiplin bukan penegakan: satu
// `deleteMany` yang lolos review sudah cukup, dan yang hilang justru catatan
// yang gunanya membuktikan apa yang terjadi ketika ada yang menyangkal.
//
// Yang diuji di sini adalah PERILAKU DATABASE, bukan perilaku kode kita. Karena
// itu ia menembak Prisma dan SQL mentah langsung ke tabelnya, bukan lewat
// `auditLog()` — penjaga yang hanya menguji jalur resmi tidak membuktikan apa
// pun tentang jalur yang tidak resmi, dan justru jalur itulah ancamannya.
//
// Pola skip-anggun sama dengan test DB lain: tanpa DB berkas ini dilewati,
// dan CI selalu punya service Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;

/**
 * Baris uji SENGAJA tidak dibersihkan — ia memang tidak bisa dibersihkan lagi,
 * dan itulah yang sedang dibuktikan. Setiap baris memakai id v7 sendiri, jadi
 * penumpukan antar-jalankan tidak menyentuh satu pun assertion (semuanya
 * mencari barisnya lewat `id`). CI memulai dari DB kosong setiap kali.
 */
const ENTITY = "audit-append-only-test";

async function sisipkanBarisUji(): Promise<string> {
  const id = uuidV7();
  await prisma.auditLog.create({
    data: { id, action: "SYSTEM_TEST", entity: ENTITY, entityId: id, meta: {} },
  });
  return id;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — test append-only audit dilewati.");
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("audit_logs append-only ditegakkan database (migrasi 13)", () => {
  it("INSERT tetap BOLEH — penjaganya tidak boleh mematikan audit itu sendiri", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const id = await sisipkanBarisUji();
    const baris = await prisma.auditLog.findUnique({ where: { id } });

    expect(baris).not.toBeNull();
    expect(baris?.entity).toBe(ENTITY);
  });

  it("UPDATE ditolak, dan barisnya tetap utuh", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const id = await sisipkanBarisUji();
    await expect(
      prisma.auditLog.update({ where: { id }, data: { entity: "diubah" } }),
    ).rejects.toThrow(/append-only/i);

    // Ditolaknya permintaan belum berarti datanya selamat: transaksi yang gagal
    // separuh jalan tetap bisa meninggalkan perubahan bila penolakannya terjadi
    // sesudah tulisan. Diperiksa apa adanya dari tabel.
    const sesudah = await prisma.auditLog.findUnique({ where: { id } });
    expect(sesudah?.entity).toBe(ENTITY);
  });

  it("DELETE ditolak, dan barisnya masih ada", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const id = await sisipkanBarisUji();
    await expect(prisma.auditLog.delete({ where: { id } })).rejects.toThrow(/append-only/i);

    expect(await prisma.auditLog.findUnique({ where: { id } })).not.toBeNull();
  });

  it("deleteMany massal ditolak — jalur yang paling mungkin dipakai orang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const id = await sisipkanBarisUji();
    await expect(prisma.auditLog.deleteMany({ where: { entity: ENTITY } })).rejects.toThrow(
      /append-only/i,
    );

    expect(await prisma.auditLog.findUnique({ where: { id } })).not.toBeNull();
  });

  it("TRUNCATE ditolak — trigger BARIS tidak pernah menyala untuknya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    // Ini kasus yang paling mudah terlewat saat memasang penjaga semacam ini:
    // `BEFORE UPDATE OR DELETE ... FOR EACH ROW` sama sekali tidak berlaku bagi
    // TRUNCATE, sehingga satu perintah bisa mengosongkan seluruh tabel tanpa
    // satu pun penjaga berbunyi. Ia menuntut trigger STATEMENT tersendiri.
    const id = await sisipkanBarisUji();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"')).rejects.toThrow(
      /append-only/i,
    );

    expect(await prisma.auditLog.findUnique({ where: { id } })).not.toBeNull();
  });

  it("UPDATE/DELETE yang TIDAK mengenai baris mana pun tetap lolos", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    // Trigger per-BARIS, bukan per-pernyataan, dan itu disengaja: pernyataan
    // yang tidak mengubah apa pun tidak mengancam catatan apa pun. Menolaknya
    // hanya akan membuat kode pembersih yang tidak berbahaya ikut merah, dan
    // penjaga yang berbunyi tanpa sebab adalah penjaga yang dimatikan orang.
    await expect(
      prisma.auditLog.deleteMany({ where: { entity: "tidak-ada-entitas-ini" } }),
    ).resolves.toEqual({ count: 0 });
  });

  it("trigger benar-benar terpasang di katalog PostgreSQL", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    // Penjaga atas penjaga. Tanpa ini, migrasi yang gagal diterapkan membuat
    // seluruh test di atas gagal dengan pesan yang menyesatkan ("tidak
    // ditolak") alih-alih menunjuk sebab sebenarnya.
    const trigger = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal
      ORDER BY tgname
    `;

    expect(trigger.map((t) => t.tgname)).toEqual([
      "audit_logs_append_only_baris",
      "audit_logs_append_only_truncate",
    ]);
  });
});
