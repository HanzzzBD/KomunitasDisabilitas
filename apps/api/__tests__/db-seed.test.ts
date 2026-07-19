// Integration test seed & fixture (PR-012) — pola skip-anggun.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runSeed, SeedProductionError } from "../prisma/seed-data.js";
import { FIXTURE } from "../prisma/fixtures.js";

const prisma = new PrismaClient();
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test seed dilewati.");
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function hitung() {
  const [users, companies, jobs, applications, resumes, skills] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.job.count(),
    prisma.application.count(),
    prisma.resume.count(),
    prisma.skill.count(),
  ]);
  return { users, companies, jobs, applications, resumes, skills };
}

describe("seed — idempotensi (AC)", () => {
  it("seed 2× → jumlah baris identik, tanpa duplikat", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await runSeed(prisma);
    const pertama = await hitung();
    await runSeed(prisma);
    const kedua = await hitung();
    expect(kedua).toEqual(pertama);
    // Fixture inti tepat satu masing-masing.
    expect(await prisma.company.count({ where: { id: FIXTURE.companies.inklusifTech } })).toBe(1);
    expect(await prisma.job.count({ where: { id: FIXTURE.jobs["j01"] ?? "" } })).toBe(1);
  });
});

describe("seed — 20 jobs variasi matching (AC)", () => {
  it("20 jobs; work_mode ≥3 nilai; akomodasi ≥4 jenis; ada draft & closed", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const jobs = await prisma.job.findMany({ where: { id: { in: Object.values(FIXTURE.jobs) } } });
    expect(jobs).toHaveLength(20);

    const workModes = new Set(jobs.map((j) => j.workMode));
    expect(workModes.size).toBe(3); // onsite, hybrid, remote

    const akomodasi = new Set(jobs.flatMap((j) => j.accommodations as string[]));
    expect(akomodasi.size).toBeGreaterThanOrEqual(4);

    const statuses = new Set(jobs.map((j) => j.status));
    expect(statuses).toContain("draft");
    expect(statuses).toContain("closed");
    expect(jobs.filter((j) => j.status === "published").length).toBeGreaterThanOrEqual(15);

    // welcomed_disability_types terisi di sebagian lowongan (sinyal matching).
    expect(jobs.some((j) => j.welcomedDisabilityTypes.length > 0)).toBe(true);
  });
});

describe("seed — persona PRD §4 (AC)", () => {
  it("4 persona dengan preferensi aksesibilitas sesuai kebutuhannya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const profil = async (id: string) =>
      prisma.accessibilityProfile.findUniqueOrThrow({ where: { userId: id } });

    expect(await profil(FIXTURE.users.rina)).toMatchObject({
      prefersSignLanguage: true,
      simpleLanguage: true,
    }); // Tuli — BISINDO + teks sederhana
    expect(await profil(FIXTURE.users.bayu)).toMatchObject({
      screenReaderHint: true,
      highContrast: true,
    }); // Netra — screen reader
    expect(await profil(FIXTURE.users.sari)).toMatchObject({ largeTouchTargets: true }); // Daksa
    expect(await profil(FIXTURE.users.dimas)).toMatchObject({
      simpleLanguage: true,
      reduceMotion: true,
    }); // Autisme — tenang & eksplisit
  });

  it("kolom sensitif seeker SEMUA NULL (enkripsi = PR-013; dilarang plaintext)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const rows = await prisma.seekerProfile.findMany({
      where: {
        userId: {
          in: [FIXTURE.users.rina, FIXTURE.users.bayu, FIXTURE.users.sari, FIXTURE.users.dimas],
        },
      },
      select: { disabilityTypes: true, accommodationNeeds: true, consentSensitiveAt: true },
    });
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.disabilityTypes).toBeNull();
      expect(r.accommodationNeeds).toBeNull();
      expect(r.consentSensitiveAt).toBeNull();
    }
  });

  it("lamaran Sari hired dengan hired_confirmed_at (North Star) + status_history utuh", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: FIXTURE.applications.sariKeJ09 },
    });
    expect(app.status).toBe("hired");
    expect(app.hiredConfirmedAt).not.toBeNull();
    expect(app.statusHistory).toHaveLength(4); // submitted→…→hired
  });
});

describe("seed — guard produksi (AC)", () => {
  it("NODE_ENV=production → SeedProductionError sebelum menyentuh DB", async () => {
    const asli = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      // Client tanpa koneksi valid — guard harus melempar SEBELUM query apa pun.
      const prismaPalsu = {
        user: { findFirst: () => Promise.reject(new Error("tidak boleh terpanggil")) },
      };
      await expect(runSeed(prismaPalsu as unknown as PrismaClient)).rejects.toBeInstanceOf(
        SeedProductionError,
      );
    } finally {
      process.env.NODE_ENV = asli;
    }
  });
});
