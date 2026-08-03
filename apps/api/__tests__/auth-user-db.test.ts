// Integration find-or-create akun OTP (PR-016a) — PostgreSQL NYATA, pola
// skip-anggun seperti test DB lain. Membuktikan semantik yang tidak bisa
// dibuktikan fake: unique index PARSIAL nomor (PR-009) dan aturan deletedAt.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
/** Prefiks nomor uji; seluruh baris dengan prefiks ini dibersihkan di akhir. */
const PREFIX = "+62857000";
const phoneUji = (suffix: string) => `${PREFIX}${suffix}`;
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test akun OTP dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("findOrCreateByPhone", () => {
  it("membuat akun baru bila nomor belum ada, lalu memakai ulang akun itu", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const phone = phoneUji("01001");

    const pertama = await repo.findOrCreateByPhone(phone);
    expect(pertama.isNew).toBe(true);

    const kedua = await repo.findOrCreateByPhone(phone);
    expect(kedua).toEqual({ id: pertama.id, isNew: false });

    const baris = await prisma.user.findUniqueOrThrow({ where: { id: pertama.id } });
    expect(baris.role).toBe("seeker"); // default skema PR-009
    expect(baris.deletedAt).toBeNull();
  });

  it("akun soft-delete diabaikan: nomornya boleh dipakai akun baru", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const phone = phoneUji("01002");

    const lama = await repo.findOrCreateByPhone(phone);
    await prisma.user.update({ where: { id: lama.id }, data: { deletedAt: new Date() } });

    expect(await repo.findActiveByPhone(phone)).toBeNull();
    const baru = await repo.findOrCreateByPhone(phone);
    expect(baru.isNew).toBe(true);
    expect(baru.id).not.toBe(lama.id);
  });

  it("dua verifikasi bersamaan menghasilkan SATU akun (unique index jadi wasit)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const phone = phoneUji("01003");

    const hasil = await Promise.all([
      repo.findOrCreateByPhone(phone),
      repo.findOrCreateByPhone(phone),
    ]);
    expect(new Set(hasil.map((h) => h.id)).size).toBe(1);
    expect(await prisma.user.count({ where: { phone, deletedAt: null } })).toBe(1);
  });

  it("nomor tidak ikut membuat baris bila akun sudah ada (tanpa duplikasi diam-diam)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const phone = phoneUji("01004");
    await prisma.user.create({ data: { id: uuidV7(), phone, fullName: "Pengguna Uji" } });

    const hasil = await repo.findOrCreateByPhone(phone);
    expect(hasil.isNew).toBe(false);
    expect(await prisma.user.count({ where: { phone } })).toBe(1);
  });
});
