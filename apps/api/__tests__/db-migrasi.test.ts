// Integration test DB (PR-009) — butuh PostgreSQL hidup (compose dev lokal
// atau service CI) + migrasi ter-apply (prisma migrate reset dijalankan CI
// sebelum test; lokal: pnpm --filter @nawasena/api db:reset).
// Skip otomatis bila DB tidak terjangkau — unit test lain tetap jalan.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test DB dilewati (jalankan compose dev).");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    // Bersihkan artefak test (phone prefix khusus test).
    await prisma.user.deleteMany({ where: { phone: { startsWith: "+62999" } } });
  }
  await prisma.$disconnect();
});

describe("migrasi 01 — constraint & tipe (integration)", () => {
  it("duplikat phone AKTIF ditolak; setelah soft-delete boleh dipakai ulang (unique parsial)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const phone = "+629990000001";
    const a = await prisma.user.create({ data: { id: uuidV7(), phone, fullName: "Uji A" } });

    // Duplikat aktif → ditolak oleh users_phone_aktif_key.
    await expect(
      prisma.user.create({ data: { id: uuidV7(), phone, fullName: "Uji B" } }),
    ).rejects.toMatchObject({ code: "P2002" });

    // Soft-delete akun pertama → nomor bebas dipakai lagi.
    await prisma.user.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    const b = await prisma.user.create({ data: { id: uuidV7(), phone, fullName: "Uji B" } });
    expect(b.id).not.toBe(a.id);
  });

  it("enum role menolak nilai di luar seeker|admin|employer", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await expect(
      prisma.$executeRaw`INSERT INTO users (id, full_name, role) VALUES (${uuidV7()}::uuid, 'Uji Enum', 'hacker'::"Role")`,
    ).rejects.toThrow();
  });

  it("semua kolom timestamp bertipe timestamptz (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const rows = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string; data_type: string }>
    >(
      Prisma.sql`SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name IN ('users','refresh_tokens','accessibility_profiles','audit_logs')
          AND (column_name LIKE '%_at')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.data_type, `${row.table_name}.${row.column_name}`).toBe(
        "timestamp with time zone",
      );
    }
  });

  it("indeks raw SQL ada: unique parsial users + BRIN audit_logs (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const idx = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>(
      Prisma.sql`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('users','audit_logs')`,
    );
    const byName = Object.fromEntries(idx.map((i) => [i.indexname, i.indexdef]));
    expect(byName["users_phone_aktif_key"]).toContain("WHERE (deleted_at IS NULL)");
    expect(byName["users_google_id_aktif_key"]).toContain("WHERE (deleted_at IS NULL)");
    expect(byName["audit_logs_created_at_brin"]).toContain("USING brin");
  });

  it("refresh_tokens ikut terhapus saat user dihapus (FK CASCADE)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const user = await prisma.user.create({
      data: { id: uuidV7(), phone: "+629990000002", fullName: "Uji Cascade" },
    });
    await prisma.refreshToken.create({
      data: {
        id: uuidV7(),
        userId: user.id,
        tokenHash: `hash-uji-${user.id}`,
        familyId: uuidV7(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.user.delete({ where: { id: user.id } }); // hard delete (purge path)
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("seed idempotent: admin tunggal ber-role admin (AC seed hijau)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Seed sudah dijalankan reset CI / manual lokal; assert hasil akhirnya.
    const admins = await prisma.user.findMany({
      where: { phone: "+620000000001", deletedAt: null },
    });
    expect(admins).toHaveLength(1);
    expect(admins[0]?.role).toBe("admin");
  });
});
