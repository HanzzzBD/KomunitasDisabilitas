// Integration kueri re-embed massal (PR-069b, U-29) — PostgreSQL nyata.
// Skip anggun bila DB tidak terjangkau.
//
// Kueri "siapa yang belum punya vektor" menentukan apa yang dibelanjakan dari
// pagu AI harian. Yang dijaga di sini: yang TIDAK boleh ikut memang tidak ikut —
// profil kosong, akun ber-soft-delete (raw SQL tidak melewati penjaga PR-021),
// lowongan draft/lewat tenggat, lowongan tanpa kurator, dan yang sudah bervektor.
// DB dev berbagi data seed, jadi yang diperiksa adalah KEANGGOTAAN id milik
// berkas ini, bukan isi hasil secara utuh.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createEmbeddingsRepository } from "../src/modules/matching/index.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();
const repo = createEmbeddingsRepository(prisma);
let dbTersedia = false;

const TANDA = "Uji PR-069b";
const VEKTOR = `[${Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)).join(",")}]`;

const u = {
  kurator: uuidV7(),
  berisi: uuidV7(),
  hanyaKeahlian: uuidV7(),
  kosong: uuidV7(),
  terhapus: uuidV7(),
  bervektor: uuidV7(),
};
const perusahaan = uuidV7();
const j = {
  aktif: uuidV7(),
  tanpaKurator: uuidV7(),
  draft: uuidV7(),
  lewatTenggat: uuidV7(),
  bervektor: uuidV7(),
};

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test re-embed massal dilewati.");
    return;
  }

  await mentah.user.createMany({
    data: Object.entries(u).map(([nama, id], i) => ({
      id,
      phone: `+6286906910000${i}`,
      fullName: `${TANDA} ${nama}`,
      ...(nama === "terhapus" ? { deletedAt: new Date() } : {}),
    })),
  });
  await mentah.seekerProfile.createMany({
    data: [
      { userId: u.berisi, headline: "Admin gudang" },
      { userId: u.hanyaKeahlian },
      { userId: u.kosong, headline: "   " },
      { userId: u.terhapus, headline: "Tetap punya isi" },
      { userId: u.bervektor, headline: "Sudah bervektor" },
    ],
  });
  await mentah.skill.create({ data: { id: uuidV7(), userId: u.hanyaKeahlian, name: "Excel" } });
  await mentah.$executeRaw`UPDATE seeker_profiles SET profile_embedding = ${VEKTOR}::vector WHERE user_id = ${u.bervektor}::uuid`;

  await mentah.company.create({ data: { id: perusahaan, name: `${TANDA} PT` } });
  const dasar = {
    companyId: perusahaan,
    description: "x",
    employmentType: "full_time" as const,
    workMode: "onsite" as const,
    status: "published" as const,
    publishedAt: new Date(),
    createdBy: u.kurator,
  };
  await mentah.job.createMany({
    data: [
      { ...dasar, id: j.aktif, title: `${TANDA} aktif` },
      { ...dasar, id: j.tanpaKurator, title: `${TANDA} tanpa kurator`, createdBy: null },
      { ...dasar, id: j.draft, title: `${TANDA} draft`, status: "draft", publishedAt: null },
      {
        ...dasar,
        id: j.lewatTenggat,
        title: `${TANDA} lewat`,
        expiresAt: new Date("2026-01-01T00:00:00Z"),
      },
      { ...dasar, id: j.bervektor, title: `${TANDA} bervektor` },
    ],
  });
  await mentah.$executeRaw`UPDATE jobs SET job_embedding = ${VEKTOR}::vector WHERE id = ${j.bervektor}::uuid`;
});

afterAll(async () => {
  if (dbTersedia) {
    await mentah.job.deleteMany({ where: { companyId: perusahaan } });
    await mentah.company.deleteMany({ where: { id: perusahaan } });
    await mentah.user.deleteMany({ where: { id: { in: Object.values(u) } } });
  }
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

describe("cariProfilTanpaVektor", () => {
  it("hanya profil BERISI, akun hidup, tanpa vektor", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const hasil = new Set(await repo.cariProfilTanpaVektor(10_000));

    expect(hasil.has(u.berisi)).toBe(true);
    expect(hasil.has(u.hanyaKeahlian)).toBe(true); // isi dari tabel keahlian saja cukup
    expect(hasil.has(u.kosong)).toBe(false); // vektornya NULL dengan benar
    expect(hasil.has(u.terhapus)).toBe(false); // soft delete dihormati
    expect(hasil.has(u.bervektor)).toBe(false);
  });

  it("menghormati batas", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    expect(await repo.cariProfilTanpaVektor(1)).toHaveLength(1);
    expect(await repo.cariProfilTanpaVektor(0)).toHaveLength(0);
  });
});

describe("cariLowonganTanpaVektor / hitungLowonganTanpaKurator", () => {
  it("hanya lowongan aktif berkurator tanpa vektor", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const hasil = new Set(await repo.cariLowonganTanpaVektor(10_000));

    expect(hasil.has(j.aktif)).toBe(true);
    for (const bukan of [j.tanpaKurator, j.draft, j.lewatTenggat, j.bervektor]) {
      expect(hasil.has(bukan)).toBe(false);
    }
  });

  it("lowongan aktif tanpa kurator DIHITUNG untuk dilaporkan ke operator", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const sebelum = await repo.hitungLowonganTanpaKurator();
    await mentah.job.update({ where: { id: j.aktif }, data: { createdBy: null } });
    try {
      expect(await repo.hitungLowonganTanpaKurator()).toBe(sebelum + 1);
    } finally {
      await mentah.job.update({ where: { id: j.aktif }, data: { createdBy: u.kurator } });
    }
  });
});
