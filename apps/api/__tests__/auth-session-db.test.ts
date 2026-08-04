// Integration sesi (PR-018a) — PostgreSQL NYATA, pola skip-anggun seperti test
// DB lain. Membuktikan yang TIDAK bisa dibuktikan repository palsu:
// - rotasi atomik (revoke + insert satu transaksi) dan siapa yang menang balapan
// - unique index token_hash
// - increment token_version di DB, bukan baca-lalu-tulis di aplikasi
// - kolom token_version hasil migrasi 04 benar-benar ada dan default 0
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createRefreshTokenRepository } from "../src/modules/auth/repositories/refresh-token.repository.js";
import { createAuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
/** Prefiks nomor uji; seluruh baris dengan prefiks ini dibersihkan di akhir. */
const PREFIX = "+62858018";
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test sesi dilewati.");
  }
});

afterAll(async () => {
  // refresh_tokens ikut terhapus lewat ON DELETE CASCADE (PR-009).
  if (dbTersedia) await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

/** Pengguna uji baru; nomornya memakai prefiks yang dibersihkan afterAll. */
async function buatUser(suffix: string): Promise<string> {
  const user = await prisma.user.create({
    data: { id: uuidV7(), phone: `${PREFIX}${suffix}`, fullName: "Uji Sesi" },
    select: { id: true },
  });
  return user.id;
}

const hashUji = (label: string) => label.padEnd(64, "0");

describe("migrasi 04 — kolom token_version", () => {
  it("ada, bertipe integer, dan default 0 untuk baris baru", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatUser("00001");
    const baris = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { tokenVersion: true },
    });
    expect(baris.tokenVersion).toBe(0);
  });
});

describe("refresh token repository — penyimpanan", () => {
  it("menyimpan baris dan menemukannya kembali lewat hash", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00002");
    const familyId = uuidV7();
    const expiresAt = new Date(Date.now() + 60_000);

    const id = await repo.insert({ userId, tokenHash: hashUji("a2"), familyId, expiresAt });
    const baris = await repo.findByHash(hashUji("a2"));

    expect(baris).toMatchObject({ id, userId, familyId, revokedAt: null });
    expect(await repo.findByHash(hashUji("tidak-ada"))).toBeNull();
  });

  it("token_hash unique: hash yang sama tidak bisa masuk dua kali", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00003");
    const dasar = { userId, familyId: uuidV7(), expiresAt: new Date(Date.now() + 60_000) };

    await repo.insert({ ...dasar, tokenHash: hashUji("a3") });
    await expect(repo.insert({ ...dasar, tokenHash: hashUji("a3") })).rejects.toMatchObject({
      code: "P2002",
    });
  });
});

describe("rotate — atomik & anti-balapan", () => {
  it("mencabut yang lama dan menerbitkan penggantinya dalam satu keluarga", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00004");
    const familyId = uuidV7();
    const now = new Date();

    const currentId = await repo.insert({
      userId,
      tokenHash: hashUji("b1"),
      familyId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const nextId = await repo.rotate({
      currentId,
      nextTokenHash: hashUji("b2"),
      nextExpiresAt: new Date(Date.now() + 120_000),
      userId,
      familyId,
      now,
    });

    expect(nextId).not.toBeNull();
    expect((await repo.findByHash(hashUji("b1")))?.revokedAt).not.toBeNull();
    expect(await repo.findByHash(hashUji("b2"))).toMatchObject({ familyId, revokedAt: null });
  });

  it("baris yang sudah dicabut tidak bisa dirotasi lagi → null, tanpa baris baru", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00005");
    const familyId = uuidV7();
    const currentId = await repo.insert({
      userId,
      tokenHash: hashUji("c1"),
      familyId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await repo.revokeFamily(familyId, new Date(), "logout");

    const hasil = await repo.rotate({
      currentId,
      nextTokenHash: hashUji("c2"),
      nextExpiresAt: new Date(Date.now() + 120_000),
      userId,
      familyId,
      now: new Date(),
    });

    expect(hasil).toBeNull();
    // Transaksi batal seutuhnya: pengganti TIDAK ikut tertulis.
    expect(await repo.findByHash(hashUji("c2"))).toBeNull();
  });

  it("dua rotasi bersamaan atas baris yang sama: tepat SATU menang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00006");
    const familyId = uuidV7();
    const currentId = await repo.insert({
      userId,
      tokenHash: hashUji("d1"),
      familyId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const rotasi = (label: string) =>
      repo.rotate({
        currentId,
        nextTokenHash: hashUji(label),
        nextExpiresAt: new Date(Date.now() + 120_000),
        userId,
        familyId,
        now: new Date(),
      });

    const hasil = await Promise.all([rotasi("d2"), rotasi("d3")]);
    const menang = hasil.filter((h) => h !== null);

    expect(menang).toHaveLength(1);
    // Tepat satu pengganti yang tertulis — bukan sepasang token kembar sah.
    const aktif = await prisma.refreshToken.count({ where: { familyId, revokedAt: null } });
    expect(aktif).toBe(1);
  });
});

describe("revokeFamily & revokeAllForUser", () => {
  it("mencabut hanya keluarga yang disebut, dan hanya yang masih aktif", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00007");
    const keluargaA = uuidV7();
    const keluargaB = uuidV7();
    const expiresAt = new Date(Date.now() + 60_000);

    await repo.insert({ userId, tokenHash: hashUji("e1"), familyId: keluargaA, expiresAt });
    await repo.insert({ userId, tokenHash: hashUji("e2"), familyId: keluargaA, expiresAt });
    await repo.insert({ userId, tokenHash: hashUji("e3"), familyId: keluargaB, expiresAt });

    expect(await repo.revokeFamily(keluargaA, new Date(), "logout")).toBe(2);
    // Idempoten: pemanggilan kedua tidak menghitung ulang yang sudah dicabut.
    expect(await repo.revokeFamily(keluargaA, new Date(), "logout")).toBe(0);
    expect((await repo.findByHash(hashUji("e3")))?.revokedAt).toBeNull();
  });

  it("revokeAllForUser tidak menyentuh sesi pengguna lain", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userA = await buatUser("00008");
    const userB = await buatUser("00009");
    const expiresAt = new Date(Date.now() + 60_000);

    await repo.insert({ userId: userA, tokenHash: hashUji("f1"), familyId: uuidV7(), expiresAt });
    await repo.insert({ userId: userA, tokenHash: hashUji("f2"), familyId: uuidV7(), expiresAt });
    await repo.insert({ userId: userB, tokenHash: hashUji("f3"), familyId: uuidV7(), expiresAt });

    expect(await repo.revokeAllForUser(userA, new Date(), "logout_all")).toBe(2);
    expect((await repo.findByHash(hashUji("f3")))?.revokedAt).toBeNull();
  });
});

describe("migrasi 05 — revoked_reason (PR-018c)", () => {
  it("baris aktif punya revokedReason NULL", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00014");
    await repo.insert({
      userId,
      tokenHash: hashUji("g1"),
      familyId: uuidV7(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect((await repo.findByHash(hashUji("g1")))?.revokedReason).toBeNull();
  });

  it("rotate menandai baris lama sebagai `rotated`", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00015");
    const familyId = uuidV7();
    const currentId = await repo.insert({
      userId,
      tokenHash: hashUji("g2"),
      familyId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await repo.rotate({
      currentId,
      nextTokenHash: hashUji("g3"),
      nextExpiresAt: new Date(Date.now() + 120_000),
      userId,
      familyId,
      now: new Date(),
    });

    expect((await repo.findByHash(hashUji("g2")))?.revokedReason).toBe("rotated");
    expect((await repo.findByHash(hashUji("g3")))?.revokedReason).toBeNull();
  });

  it("revokeFamily/revokeAllForUser menuliskan sebab yang diminta", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00016");
    const familyId = uuidV7();
    const expiresAt = new Date(Date.now() + 60_000);

    await repo.insert({ userId, tokenHash: hashUji("g4"), familyId, expiresAt });
    await repo.revokeFamily(familyId, new Date(), "logout");
    expect((await repo.findByHash(hashUji("g4")))?.revokedReason).toBe("logout");

    await repo.insert({ userId, tokenHash: hashUji("g5"), familyId: uuidV7(), expiresAt });
    await repo.revokeAllForUser(userId, new Date(), "logout_all");
    expect((await repo.findByHash(hashUji("g5")))?.revokedReason).toBe("logout_all");
  });

  it("markReuse menandai baris yang SUDAH tercabut tanpa mengubah revokedAt", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Baris pemicu adalah bukti insiden; retensi PR-024 menyimpannya 2 tahun
    // berdasarkan kolom ini, jadi ia harus benar-benar berubah jadi `reuse`.
    const repo = createRefreshTokenRepository(prisma);
    const userId = await buatUser("00017");
    const familyId = uuidV7();
    const id = await repo.insert({
      userId,
      tokenHash: hashUji("g6"),
      familyId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await repo.revokeFamily(familyId, new Date(), "rotated");
    const sebelum = await repo.findByHash(hashUji("g6"));

    await repo.markReuse(id);
    const sesudah = await repo.findByHash(hashUji("g6"));

    expect(sesudah?.revokedReason).toBe("reuse");
    expect(sesudah?.revokedAt).toEqual(sebelum?.revokedAt);
  });
});

describe("token_version di DB", () => {
  it("bumpTokenVersion menaikkan satu langkah dan mengembalikan nilai baru", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const userId = await buatUser("00010");

    expect(await repo.bumpTokenVersion(userId)).toBe(1);
    expect(await repo.bumpTokenVersion(userId)).toBe(2);
    expect((await repo.findActiveSessionUser(userId))?.tokenVersion).toBe(2);
  });

  it("dua bump bersamaan tidak saling menimpa (increment di DB)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const userId = await buatUser("00011");

    await Promise.all([repo.bumpTokenVersion(userId), repo.bumpTokenVersion(userId)]);

    // Baca-lalu-tulis di aplikasi akan berhenti di 1; increment DB sampai 2.
    expect((await repo.findActiveSessionUser(userId))?.tokenVersion).toBe(2);
  });

  it("akun soft-delete: tidak terbaca sebagai sesi dan tidak bisa di-bump", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const userId = await buatUser("00012");
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });

    expect(await repo.findActiveSessionUser(userId)).toBeNull();
    expect(await repo.bumpTokenVersion(userId)).toBeNull();
  });

  it("findActiveSessionUser membawa role untuk klaim JWT", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const userId = await buatUser("00013");
    expect(await repo.findActiveSessionUser(userId)).toEqual({
      id: userId,
      role: "seeker",
      tokenVersion: 0,
    });
  });
});
