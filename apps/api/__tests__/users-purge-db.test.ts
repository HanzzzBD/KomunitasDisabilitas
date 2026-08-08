// Integration DB purge PDP (PR-023) — butuh PostgreSQL hidup.
// Skip otomatis bila DB tidak terjangkau (pola sama dengan test DB lain).
//
// INILAH tempat AC dibuktikan. Fake bisa meyakinkan siapa pun bahwa purge
// bekerja; yang tidak bisa dipalsukan adalah `ON DELETE CASCADE`, FK
// `NoAction` pada `applications.resume_id`, dan apakah baris yang katanya
// "dibersihkan" benar-benar tidak menyimpan apa pun.
//
// Dua klien berdampingan, seperti di auth-account-db:
//   `berpenjaga` = createPrismaClient() → dipakai service purge
//   `mentah`     = new PrismaClient()   → menyiapkan & memeriksa apa adanya
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createPurgeService, PURGE_POLICY } from "../src/modules/users/index.js";

const mentah = new PrismaClient();
const berpenjaga = createPrismaClient();

const NAMA_UJI = "Uji PR-023";
const SEKARANG = new Date("2026-08-08T00:00:00.000Z");
/** Lewat jendela 30 hari. */
const LAMA = new Date(SEKARANG.getTime() - 40 * 86_400_000);
/** Masih di dalam jendela. */
const BARU = new Date(SEKARANG.getTime() - 10 * 86_400_000);

let dbTersedia = false;
let urutan = 0;

const audit: Array<{ entityId: string | null; meta: Record<string, unknown> }> = [];
const service = createPurgeService({
  prisma: berpenjaga,
  auditLog: (_a, _action, _e, entityId, meta) => {
    audit.push({ entityId, meta: meta as Record<string, unknown> });
  },
  clock: () => SEKARANG,
});

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test purge PDP dilewati.");
  }
});

/**
 * Id akun yang dibuat test ini. Pembersihan TIDAK boleh mengandalkan
 * `fullName` — akun yang dianonimkan kehilangannya, jadi penyapu berbasis nama
 * akan melewatkan persis baris yang paling penting dibersihkan.
 */
const dibuat: string[] = [];

async function bersihkanUji(): Promise<void> {
  // Urutannya bukan selera: `jobs` ber-onDelete Restrict terhadap applications.
  // Lamaran disapu lewat LOWONGAN-nya, bukan lewat pemiliknya — akun yang
  // dianonimkan run sebelumnya tidak lagi bisa dikenali dari nama maupun dari
  // daftar `dibuat` proses ini, tetapi lowongan ujinya tetap bernama sama.
  const jobs = await mentah.job.findMany({
    where: { title: { startsWith: NAMA_UJI } },
    select: { id: true },
  });
  if (jobs.length > 0) {
    await mentah.application.deleteMany({ where: { jobId: { in: jobs.map((j) => j.id) } } });
  }
  if (dibuat.length > 0) {
    await mentah.user.deleteMany({ where: { id: { in: dibuat } } });
    dibuat.length = 0;
  }
  await mentah.user.deleteMany({ where: { fullName: { startsWith: NAMA_UJI } } });
  await mentah.job.deleteMany({ where: { title: { startsWith: NAMA_UJI } } });
  await mentah.company.deleteMany({ where: { name: { startsWith: NAMA_UJI } } });
}

beforeEach(async () => {
  audit.length = 0;
  if (dbTersedia) await bersihkanUji();
});

afterAll(async () => {
  if (dbTersedia) await bersihkanUji();
  await Promise.all([mentah.$disconnect(), berpenjaga.$disconnect()]);
});

/** Lowongan (butuh company) supaya lamaran uji punya tempat bergantung. */
async function buatLowongan(): Promise<string> {
  const companyId = uuidV7();
  await mentah.company.create({ data: { id: companyId, name: `${NAMA_UJI} PT` } });
  const jobId = uuidV7();
  await mentah.job.create({
    data: {
      id: jobId,
      companyId,
      title: `${NAMA_UJI} Lowongan`,
      description: "uji",
      employmentType: "full_time",
      workMode: "remote",
      welcomedDisabilityTypes: [],
    },
  });
  return jobId;
}

interface OpsiAkun {
  deletedAt: Date | null;
  /** Buat lamaran dengan status ini; undefined = tanpa lamaran. */
  statusLamaran?: "submitted" | "hired";
  /** Tautkan CV ke lamaran (menguji FK NoAction). */
  denganResume?: boolean;
}

async function buatAkun(opsi: OpsiAkun): Promise<string> {
  urutan += 1;
  const id = uuidV7();
  await mentah.user.create({
    data: {
      id,
      fullName: `${NAMA_UJI} ${urutan}`,
      phone: `+62812900${String(urutan).padStart(4, "0")}`,
      email: `uji${urutan}@pr023.invalid`,
      emailVerified: true,
      googleId: `google-pr023-${urutan}`,
      deletedAt: opsi.deletedAt,
    },
  });
  dibuat.push(id);

  // Data anak pribadi di beberapa tabel berbeda.
  await mentah.accessibilityProfile.create({ data: { userId: id } });
  await mentah.seekerProfile.create({ data: { userId: id, headline: "rahasia" } });
  await mentah.skill.create({ data: { id: uuidV7(), userId: id, name: "uji" } });
  await mentah.notification.create({ data: { id: uuidV7(), userId: id, type: "uji" } });
  await mentah.refreshToken.create({
    data: {
      id: uuidV7(),
      userId: id,
      tokenHash: `hash-pr023-${urutan}`,
      familyId: uuidV7(),
      expiresAt: new Date(SEKARANG.getTime() + 86_400_000),
    },
  });

  let resumeId: string | null = null;
  if (opsi.denganResume === true) {
    resumeId = uuidV7();
    await mentah.resume.create({ data: { id: resumeId, userId: id, title: "CV uji" } });
  }

  if (opsi.statusLamaran !== undefined) {
    await mentah.application.create({
      data: {
        id: uuidV7(),
        userId: id,
        jobId: await buatLowongan(),
        resumeId,
        status: opsi.statusLamaran,
        ...(opsi.statusLamaran === "hired" ? { hiredConfirmedAt: SEKARANG } : {}),
      },
    });
  }
  return id;
}

/** Baris users apa adanya, menembus penjaga soft delete. */
function bacaUser(id: string) {
  return mentah.user.findUnique({ where: { id } });
}

describe("purge — jalur hapus penuh (integration)", () => {
  it("akun lewat 30 hari tanpa lamaran hired dihapus beserta seluruh anaknya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatAkun({ deletedAt: LAMA, statusLamaran: "submitted", denganResume: true });

    const laporan = await service.run();

    expect(laporan).toMatchObject({ dryRun: false, accounts: 1, deleted: 1, anonymized: 0 });
    expect(await bacaUser(id)).toBeNull();
    // Cascade: tidak satu pun anak tersisa, termasuk tabel yang TIDAK disebut
    // TABEL_DIHAPUS — itulah gunanya jalur ini.
    expect(await mentah.seekerProfile.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.notification.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.refreshToken.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.application.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.resume.count({ where: { userId: id } })).toBe(0);
  });
});

describe("purge — jalur anonimisasi (integration)", () => {
  it("akun dengan lamaran hired: PII hilang, barisnya tinggal, lamarannya utuh", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatAkun({ deletedAt: LAMA, statusLamaran: "hired", denganResume: true });

    const laporan = await service.run();

    expect(laporan).toMatchObject({ accounts: 1, deleted: 0, anonymized: 1 });

    const baris = await bacaUser(id);
    expect(baris).not.toBeNull();
    // Tidak ada satu pun PII tersisa.
    expect(baris?.fullName).toBe("");
    expect(baris?.email).toBeNull();
    expect(baris?.emailVerified).toBe(false);
    expect(baris?.phone).toBeNull();
    expect(baris?.googleId).toBeNull();
    expect(baris?.lastActiveAt).toBeNull();
    // Yang bukan PII sengaja dibiarkan.
    expect(baris?.deletedAt).not.toBeNull();

    // Data anak pribadi hilang — cascade TIDAK menyala di jalur ini, jadi ini
    // membuktikan daftar TABEL_DIHAPUS benar-benar dieksekusi.
    expect(await mentah.seekerProfile.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.accessibilityProfile.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.skill.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.notification.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.refreshToken.count({ where: { userId: id } })).toBe(0);
    expect(await mentah.resume.count({ where: { userId: id } })).toBe(0);
  });

  it("hired count agregat TIDAK berubah pasca-purge (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatAkun({ deletedAt: LAMA, statusLamaran: "hired" });
    const sebelum = await mentah.application.count({ where: { status: "hired" } });

    await service.run();

    // North Star Metric proyek ini. Kalau angka ini turun setiap kali seseorang
    // menghapus akunnya, platform kehilangan bukti bahwa ia pernah bekerja.
    expect(await mentah.application.count({ where: { status: "hired" } })).toBe(sebelum);
    expect(await mentah.application.count({ where: { userId: id } })).toBe(1);
  });

  it("resume_id dilepas sehingga CV bisa dihapus meski dipakai lamaran", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // FK `applications.resume_id` ber-onDelete NoAction (PR-011): tanpa melepas
    // tautannya lebih dulu, PostgreSQL menolak DELETE resumes dan SELURUH
    // transaksi purge gagal — hanya untuk akun yang pernah melamar.
    const id = await buatAkun({ deletedAt: LAMA, statusLamaran: "hired", denganResume: true });

    await service.run();

    const lamaran = await mentah.application.findFirst({ where: { userId: id } });
    expect(lamaran?.resumeId).toBeNull();
    expect(await mentah.resume.count({ where: { userId: id } })).toBe(0);
  });
});

describe("purge — batas dan idempotensi (integration)", () => {
  it("akun yang belum lewat 30 hari tidak tersentuh", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatAkun({ deletedAt: BARU });

    const laporan = await service.run();

    expect(laporan.accounts).toBe(0);
    expect((await bacaUser(id))?.phone).not.toBeNull();
  });

  it("akun aktif (belum dihapus) tidak pernah menjadi kandidat", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatAkun({ deletedAt: null });

    await service.run();

    expect((await bacaUser(id))?.email).not.toBeNull();
  });

  it("run kedua tidak menemukan apa pun — idempoten tanpa kolom penanda", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatAkun({ deletedAt: LAMA, statusLamaran: "hired" });
    expect((await service.run()).anonymized).toBe(1);

    const kedua = await service.run();

    // Baris yang sudah bersih tidak cocok lagi dengan selector — itulah seluruh
    // alasan selectornya didefinisikan dari keadaan tujuan.
    expect(kedua).toMatchObject({ accounts: 0, anonymized: 0, deleted: 0, hasMore: false });
  });

  it("dry-run melaporkan tanpa mengubah apa pun (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatAkun({ deletedAt: LAMA, statusLamaran: "hired", denganResume: true });

    const laporan = await service.run({ dryRun: true });

    expect(laporan).toMatchObject({ dryRun: true, accounts: 1, anonymized: 1 });
    expect(laporan.records).toBeGreaterThan(0);
    const baris = await bacaUser(id);
    expect(baris?.phone).not.toBeNull();
    expect(baris?.email).not.toBeNull();
    expect(await mentah.resume.count({ where: { userId: id } })).toBe(1);
  });
});

describe("purge — audit (integration)", () => {
  it("run ter-audit per akun dan sebagai ringkasan (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const a = await buatAkun({ deletedAt: LAMA });
    const b = await buatAkun({ deletedAt: LAMA, statusLamaran: "hired" });

    await service.run();

    const perAkun = audit.filter((e) => e.entityId !== null).map((e) => e.entityId);
    expect(perAkun).toHaveLength(2);
    expect(perAkun).toContain(a);
    expect(perAkun).toContain(b);

    const ringkasan = audit.find((e) => e.entityId === null);
    expect(ringkasan?.meta).toMatchObject({
      dryRun: false,
      accounts: 2,
      deleted: 1,
      anonymized: 1,
    });
    // Jumlah baris anak yang dihapus harus nyata, bukan nol.
    expect(ringkasan?.meta.records).toBeGreaterThan(0);
  });
});

describe("purge — kebijakan", () => {
  it("jendela tunggu 30 hari sesuai janji PRD FR-1.4", () => {
    expect(PURGE_POLICY.hariTunggu).toBe(30);
  });
});
