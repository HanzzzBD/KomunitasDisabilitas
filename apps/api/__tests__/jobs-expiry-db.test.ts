// Integration DB penutupan lowongan kedaluwarsa (PR-024b) — butuh PostgreSQL.
// Skip otomatis bila DB tidak terjangkau.
//
// Ditulis sebagai test DB dan bukan unit test karena SELURUH logikanya adalah
// satu statement `UPDATE … RETURNING`. Fake yang meniru statement itu hanya
// akan menguji tiruan saya sendiri: apakah `status = 'published'` benar-benar
// menyaring, apakah `RETURNING` benar-benar mengembalikan baris yang berubah,
// dan apakah `expires_at IS NULL` benar-benar dilewati — tiga hal yang hanya
// PostgreSQL yang bisa menjawab.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient, type JobStatus } from "@prisma/client";
import type { JobClosedEvent } from "@nawasena/schemas";
import { createPrismaClient } from "../src/core/db/index.js";
import { createEventBus } from "../src/core/events/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createJobExpiryService } from "../src/modules/jobs/index.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();

const SEKARANG = new Date("2026-08-08T00:00:00.000Z");
const HARI = 86_400_000;
const lalu = (hari: number) => new Date(SEKARANG.getTime() - hari * HARI);
const nanti = (hari: number) => new Date(SEKARANG.getTime() + hari * HARI);

const TANDA = "Uji PR-024b";

let dbTersedia = false;
let companyId = "";

const terbit: JobClosedEvent[] = [];
const audit: Array<Record<string, unknown>> = [];

function rakitService(limits = { batchSize: 100, maxPerRun: 1000 }) {
  const bus = createEventBus({ logger: { error: () => {} } });
  bus.on("job.closed", (p) => {
    terbit.push(p);
  });
  return createJobExpiryService({
    prisma,
    events: bus,
    auditLog: (_a, _action, _e, _id, meta) => {
      audit.push(meta as Record<string, unknown>);
    },
    limits,
    clock: () => SEKARANG,
  });
}

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test job expiry dilewati.");
    return;
  }
  companyId = uuidV7();
  await mentah.company.create({ data: { id: companyId, name: TANDA } });
});

async function bersihkan(): Promise<void> {
  if (!dbTersedia) return;
  await mentah.job.deleteMany({ where: { title: { startsWith: TANDA } } });
  terbit.length = 0;
  audit.length = 0;
}

beforeEach(bersihkan);

afterAll(async () => {
  if (dbTersedia) {
    await bersihkan();
    await mentah.company.deleteMany({ where: { name: TANDA } });
  }
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

async function buatLowongan(opsi: { status: JobStatus; expiresAt: Date | null }): Promise<string> {
  const id = uuidV7();
  await mentah.job.create({
    data: {
      id,
      companyId,
      title: `${TANDA} ${id.slice(0, 8)}`,
      description: "uji",
      employmentType: "full_time",
      workMode: "remote",
      welcomedDisabilityTypes: [],
      status: opsi.status,
      expiresAt: opsi.expiresAt,
    },
  });
  return id;
}

const status = async (id: string) =>
  (await mentah.job.findUnique({ where: { id }, select: { status: true } }))?.status;

describe("penutupan lowongan kedaluwarsa (AC)", () => {
  it("published + lewat expires_at → closed, dan event terbit", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatLowongan({ status: "published", expiresAt: lalu(1) });

    const laporan = await rakitService().run();

    expect(laporan).toMatchObject({ dryRun: false, closed: 1, remaining: 0 });
    expect(await status(id)).toBe("closed");
    expect(terbit).toEqual([
      { jobId: id, closedAt: SEKARANG.toISOString(), reason: "expired" },
    ]);
  });

  it("updated_at ikut diperbarui — @updatedAt tidak berlaku pada raw SQL", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatLowongan({ status: "published", expiresAt: lalu(1) });
    const sebelum = await mentah.job.findUnique({ where: { id }, select: { updatedAt: true } });

    await rakitService().run();

    const sesudah = await mentah.job.findUnique({ where: { id }, select: { updatedAt: true } });
    expect(sesudah?.updatedAt.getTime()).not.toBe(sebelum?.updatedAt.getTime());
    expect(sesudah?.updatedAt.getTime()).toBe(SEKARANG.getTime());
  });
});

describe("yang TIDAK boleh tersentuh", () => {
  it("draft yang kedaluwarsa dibiarkan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Ia belum pernah terbit; menutupnya berarti mengarang transisi status
    // yang tidak pernah terjadi — dan riwayat status dibaca orang saat
    // menyelidiki, bukan sekadar kolom.
    const id = await buatLowongan({ status: "draft", expiresAt: lalu(30) });

    const laporan = await rakitService().run();

    expect(laporan.closed).toBe(0);
    expect(await status(id)).toBe("draft");
    expect(terbit).toEqual([]);
  });

  it("published tanpa expires_at dibiarkan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatLowongan({ status: "published", expiresAt: null });

    await rakitService().run();

    expect(await status(id)).toBe("published");
  });

  it("published yang belum kedaluwarsa dibiarkan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatLowongan({ status: "published", expiresAt: nanti(7) });

    await rakitService().run();

    expect(await status(id)).toBe("published");
  });

  it("run kedua tidak menutup ulang dan tidak menerbitkan event lagi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ status: "published", expiresAt: lalu(1) });
    await rakitService().run();
    terbit.length = 0;

    const kedua = await rakitService().run();

    // Event yang terbit dua kali membuat pelanggan mengira ada dua penutupan.
    expect(kedua).toMatchObject({ closed: 0, remaining: 0 });
    expect(terbit).toEqual([]);
  });
});

describe("dry-run & batas", () => {
  it("dry-run tidak mengubah status dan tidak menerbitkan event", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatLowongan({ status: "published", expiresAt: lalu(1) });

    const laporan = await rakitService().run({ dryRun: true });

    expect(laporan).toMatchObject({ dryRun: true, closed: 0, remaining: 1 });
    expect(await status(id)).toBe("published");
    expect(terbit).toEqual([]);
  });

  it("batas per run dihormati; sisanya dilaporkan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    for (let i = 0; i < 5; i += 1) {
      await buatLowongan({ status: "published", expiresAt: lalu(1) });
    }

    const laporan = await rakitService({ batchSize: 2, maxPerRun: 3 }).run();

    expect(laporan.closed).toBe(3);
    expect(laporan.remaining).toBe(2);
    // Event hanya untuk yang benar-benar tertutup.
    expect(terbit).toHaveLength(3);
  });

  it("event yang terbit persis untuk lowongan yang berubah", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const kedaluwarsa = await buatLowongan({ status: "published", expiresAt: lalu(1) });
    await buatLowongan({ status: "draft", expiresAt: lalu(1) });
    await buatLowongan({ status: "published", expiresAt: nanti(1) });

    await rakitService().run();

    expect(terbit.map((e) => e.jobId)).toEqual([kedaluwarsa]);
  });
});

describe("audit", () => {
  it("run tercatat dengan jumlah dan sisa", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ status: "published", expiresAt: lalu(1) });

    await rakitService().run();

    expect(audit).toHaveLength(1);
    expect(audit[0]).toEqual({ dryRun: false, closed: 1, remaining: 0 });
  });

  it("run tanpa kandidat tetap tercatat", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await rakitService().run();

    expect(audit).toEqual([{ dryRun: false, closed: 0, remaining: 0 }]);
  });
});
