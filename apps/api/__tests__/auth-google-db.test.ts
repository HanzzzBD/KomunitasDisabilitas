// PR-017a — find-or-create/link akun Google terhadap PostgreSQL NYATA.
//
// Pola skip-anggun seperti test DB lain. Yang dibuktikan di sini tidak bisa
// dibuktikan oleh fake: unique index PARSIAL `google_id` (PR-009) sebagai wasit
// balapan, dan aturan `deleted_at IS NULL` yang membuat akun terhapus tidak
// pernah "hidup lagi" lewat login Google.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createAuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
/** Penanda baris uji; seluruh baris ber-prefiks ini dibersihkan di akhir. */
const PREFIX = "uji-google-017a";
const googleUji = (suffix: string) => `${PREFIX}-sub-${suffix}`;
const emailUji = (suffix: string) => `${PREFIX}.${suffix}@contoh.id`;
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test akun Google dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    await prisma.user.deleteMany({
      where: {
        OR: [{ googleId: { startsWith: PREFIX } }, { email: { startsWith: PREFIX } }],
      },
    });
  }
  await prisma.$disconnect();
});

const identitas = (suffix: string, override: Partial<{ email: string; fullName: string }> = {}) => ({
  googleId: googleUji(suffix),
  email: override.email ?? emailUji(suffix),
  fullName: override.fullName ?? "Bayu Nugroho",
});

describe("findOrCreateByGoogle", () => {
  it("login pertama membuat akun dengan google_id; login ulang mendarat di akun yang SAMA", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);

    const pertama = await repo.findOrCreateByGoogle(identitas("01"));
    expect(pertama.isNew).toBe(true);

    const kedua = await repo.findOrCreateByGoogle(identitas("01"));
    expect(kedua).toEqual({ id: pertama.id, isNew: false });

    const baris = await prisma.user.findUniqueOrThrow({ where: { id: pertama.id } });
    expect(baris.googleId).toBe(googleUji("01"));
    expect(baris.email).toBe(emailUji("01"));
    expect(baris.fullName).toBe("Bayu Nugroho");
    expect(baris.phone).toBeNull(); // signup Google tidak menanyakan nomor
    expect(baris.role).toBe("seeker");
  });

  it("google_id menang atas email: email berganti di Google, akun tetap sama", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);

    const awal = await repo.findOrCreateByGoogle(identitas("02"));
    const setelahGanti = await repo.findOrCreateByGoogle(
      identitas("02", { email: emailUji("02-baru") }),
    );

    expect(setelahGanti).toEqual({ id: awal.id, isNew: false });
    expect(await prisma.user.count({ where: { googleId: googleUji("02") } })).toBe(1);
  });

  it("akun lama dengan email sama DITAUTKAN, bukan diduplikasi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const email = emailUji("03");
    // Akun hasil login OTP (PR-016): tanpa google_id, nama masih kosong.
    const lama = await prisma.user.create({
      data: { id: uuidV7(), email, fullName: "", phone: "+62857000903" },
      select: { id: true },
    });

    const hasil = await repo.findOrCreateByGoogle(identitas("03", { email }));
    expect(hasil).toEqual({ id: lama.id, isNew: false });

    const baris = await prisma.user.findUniqueOrThrow({ where: { id: lama.id } });
    expect(baris.googleId).toBe(googleUji("03"));
    expect(baris.phone).toBe("+62857000903"); // jalur OTP tidak ikut hilang
    expect(baris.fullName).toBe("Bayu Nugroho"); // nama kosong diisi dari Google
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("nama yang sudah diisi pengguna TIDAK ditimpa nama dari Google", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const email = emailUji("04");
    const lama = await prisma.user.create({
      data: { id: uuidV7(), email, fullName: "Nama Pilihan Sendiri" },
      select: { id: true },
    });

    await repo.findOrCreateByGoogle(identitas("04", { email }));

    const baris = await prisma.user.findUniqueOrThrow({ where: { id: lama.id } });
    expect(baris.fullName).toBe("Nama Pilihan Sendiri");
    expect(baris.googleId).toBe(googleUji("04"));
  });

  it("akun soft-delete diabaikan: google_id-nya boleh dipakai akun baru", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);

    const lama = await repo.findOrCreateByGoogle(identitas("05"));
    await prisma.user.update({ where: { id: lama.id }, data: { deletedAt: new Date() } });

    expect(await repo.findActiveByGoogleId(googleUji("05"))).toBeNull();
    const baru = await repo.findOrCreateByGoogle(identitas("05"));
    expect(baru.isNew).toBe(true);
    expect(baru.id).not.toBe(lama.id);
  });

  it("dua login bersamaan menghasilkan SATU akun (unique index parsial jadi wasit)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);

    const hasil = await Promise.all([
      repo.findOrCreateByGoogle(identitas("06")),
      repo.findOrCreateByGoogle(identitas("06")),
    ]);

    expect(new Set(hasil.map((h) => h.id)).size).toBe(1);
    expect(
      await prisma.user.count({ where: { googleId: googleUji("06"), deletedAt: null } }),
    ).toBe(1);
  });

  it("akun terhapus dengan email sama tidak ikut tertaut", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const repo = createAuthUserRepository(prisma);
    const email = emailUji("07");
    const terhapus = await prisma.user.create({
      data: { id: uuidV7(), email, fullName: "", deletedAt: new Date() },
      select: { id: true },
    });

    const hasil = await repo.findOrCreateByGoogle(identitas("07", { email }));
    expect(hasil.isNew).toBe(true);
    expect(hasil.id).not.toBe(terhapus.id);

    const barisLama = await prisma.user.findUniqueOrThrow({ where: { id: terhapus.id } });
    expect(barisLama.googleId).toBeNull(); // baris terhapus tidak disentuh
  });
});
