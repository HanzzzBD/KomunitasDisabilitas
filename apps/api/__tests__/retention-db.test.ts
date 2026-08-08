// Integration DB retensi (PR-024a) — butuh PostgreSQL hidup + migrasi 08.
// Skip otomatis bila DB tidak terjangkau.
//
// DUA TEST DI SINI ADALAH ALASAN PR INI PUNYA AC TERSENDIRI, dan keduanya
// menguji hal yang TIDAK menimbulkan gejala apa pun bila salah:
//
//   1. Baris DICABUT berumur di antara ambang expired (90 h) dan revoked
//      (180 h) harus SELAMAT. Predikat `expired` yang lupa menyaring
//      `revoked_at IS NULL` akan menghapusnya pada hari ke-90 — dan reuse
//      detection (§8.1) berhenti bisa membedakan token curian dari token tak
//      dikenal, diam-diam, selamanya.
//   2. Baris ber-`revoked_reason = 'reuse'` harus bertahan melewati 180 hari.
//      Ia bukti insiden, sejajar `audit_logs` (2 tahun).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";
import { createRefreshTokenRepository, createRefreshTokenPolicies } from "../src/modules/auth/index.js";
import { createOrphanPolicies, createRetentionService } from "../src/modules/users/index.js";
import { createPrismaClient } from "../src/core/db/index.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();

const SEKARANG = new Date("2026-08-08T00:00:00.000Z");
const HARI = 86_400_000;
const lalu = (hari: number) => new Date(SEKARANG.getTime() - hari * HARI);

const TANDA = "retensi-pr024";
const DAYS = { expired: 90, revoked: 180, reuse: 730 };

let dbTersedia = false;
let userId = "";
let jobId = "";
let urutan = 0;

const audit: Array<Record<string, unknown>> = [];

function rakitService(limits = { batchSize: 500, maxPerRun: 10_000 }) {
  return createRetentionService({
    prisma,
    policies: [
      ...createRefreshTokenPolicies({
        repository: createRefreshTokenRepository(prisma),
        days: DAYS,
      }),
      ...createOrphanPolicies({ prisma, matchScoresDays: 7, aiUsageDays: 90 }),
    ],
    limits,
    auditLog: (_a, _action, _e, _id, meta) => {
      audit.push(meta as Record<string, unknown>);
    },
    clock: () => SEKARANG,
  });
}

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test retensi dilewati.");
    return;
  }

  userId = uuidV7();
  await mentah.user.create({ data: { id: userId, fullName: `Uji ${TANDA}` } });
  const companyId = uuidV7();
  await mentah.company.create({ data: { id: companyId, name: `Uji ${TANDA}` } });
  jobId = uuidV7();
  await mentah.job.create({
    data: {
      id: jobId,
      companyId,
      title: `Uji ${TANDA}`,
      description: "uji",
      employmentType: "full_time",
      workMode: "remote",
      welcomedDisabilityTypes: [],
    },
  });
});

async function bersihkanData(): Promise<void> {
  if (!dbTersedia) return;
  await mentah.refreshToken.deleteMany({ where: { userId } });
  await mentah.matchScore.deleteMany({ where: { userId } });
  await mentah.aiUsage.deleteMany({ where: { userId } });
  await mentah.aiUsageMonthly.deleteMany({});
  audit.length = 0;
}

beforeEach(bersihkanData);

afterAll(async () => {
  if (dbTersedia) {
    await bersihkanData();
    await mentah.user.deleteMany({ where: { fullName: `Uji ${TANDA}` } });
    await mentah.job.deleteMany({ where: { title: `Uji ${TANDA}` } });
    await mentah.company.deleteMany({ where: { name: `Uji ${TANDA}` } });
  }
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

interface OpsiToken {
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: "rotated" | "logout" | "logout_all" | "reuse" | "account_deleted" | null;
}

async function buatToken(opsi: OpsiToken): Promise<string> {
  urutan += 1;
  const id = uuidV7();
  await mentah.refreshToken.create({
    data: {
      id,
      userId,
      tokenHash: `${TANDA}-${urutan}`,
      familyId: uuidV7(),
      expiresAt: opsi.expiresAt,
      revokedAt: opsi.revokedAt ?? null,
      revokedReason: opsi.revokedReason ?? null,
    },
  });
  return id;
}

const hidup = (id: string) => mentah.refreshToken.findUnique({ where: { id } });

describe("retensi refresh_tokens — penjaga reuse detection (AC)", () => {
  it("baris DICABUT berumur antara 90 dan 180 hari TETAP SELAMAT", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Persis bug yang akan membutakan reuse detection tanpa gejala apa pun:
    // token ini sudah lewat ambang `expired`, tetapi ia DICABUT — dan baris
    // yang dicabut adalah satu-satunya bukti bahwa keluarganya pernah ada.
    const id = await buatToken({
      expiresAt: lalu(150),
      revokedAt: lalu(120),
      revokedReason: "rotated",
    });

    await rakitService().run();

    expect(await hidup(id)).not.toBeNull();
  });

  it("baris ber-reuse bertahan melewati ambang 180 hari (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatToken({
      expiresAt: lalu(400),
      revokedAt: lalu(300),
      revokedReason: "reuse",
    });

    await rakitService().run();

    // Bukti insiden — disamakan dengan audit_logs (2 tahun).
    expect(await hidup(id)).not.toBeNull();
  });

  it("baris ber-reuse yang lewat 730 hari akhirnya dihapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatToken({
      expiresAt: lalu(900),
      revokedAt: lalu(800),
      revokedReason: "reuse",
    });

    await rakitService().run();

    expect(await hidup(id)).toBeNull();
  });
});

describe("retensi refresh_tokens — tiga kategori saling lepas", () => {
  it("kedaluwarsa & tak pernah dicabut > 90 hari → dihapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatToken({ expiresAt: lalu(100), revokedAt: null });

    await rakitService().run();

    expect(await hidup(id)).toBeNull();
  });

  it("kedaluwarsa < 90 hari → selamat", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatToken({ expiresAt: lalu(30), revokedAt: null });

    await rakitService().run();

    expect(await hidup(id)).not.toBeNull();
  });

  it("dicabut > 180 hari dengan sebab biasa → dihapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatToken({
      expiresAt: lalu(250),
      revokedAt: lalu(200),
      revokedReason: "logout",
    });

    await rakitService().run();

    expect(await hidup(id)).toBeNull();
  });

  it("revoked_reason NULL diperlakukan sebagai rotasi, bukan dilewati", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Baris lama (sebelum migrasi 05) bernilai NULL. Kalau predikatnya menuntut
    // sebab yang tidak NULL, baris-baris itu tidak akan pernah dibersihkan.
    const id = await buatToken({ expiresAt: lalu(250), revokedAt: lalu(200), revokedReason: null });

    await rakitService().run();

    expect(await hidup(id)).toBeNull();
  });
});

describe("retensi match_scores & ai_usage", () => {
  it("match_scores > 7 hari dihapus, yang baru selamat", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await mentah.matchScore.create({
      data: { userId, jobId, score: "0.9000", computedAt: lalu(10) },
    });

    await rakitService().run();

    expect(await mentah.matchScore.count({ where: { userId } })).toBe(0);

    await mentah.matchScore.create({
      data: { userId, jobId, score: "0.9000", computedAt: lalu(2) },
    });
    await rakitService().run();
    expect(await mentah.matchScore.count({ where: { userId } })).toBe(1);
  });

  it("ai_usage difinalkan ke agregat bulanan SEBELUM dihapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Dua baris di bulan yang sama, sudah lewat 90 hari.
    for (const tokens of [10, 25]) {
      await mentah.aiUsage.create({
        data: {
          id: uuidV7(),
          userId,
          feature: "cv_chat",
          provider: "gemini",
          tokensIn: tokens,
          tokensOut: tokens * 2,
          createdAt: lalu(120),
        },
      });
    }

    const laporan = await rakitService().run();

    expect(laporan.monthsAggregated).toBeGreaterThan(0);
    expect(await mentah.aiUsage.count({ where: { userId } })).toBe(0);

    const agregat = await mentah.aiUsageMonthly.findMany();
    expect(agregat).toHaveLength(1);
    expect(agregat[0]?.requests).toBe(2);
    expect(agregat[0]?.tokensIn).toBe(35n);
    expect(agregat[0]?.tokensOut).toBe(70n);
  });

  it("bulan yang sudah difinalkan TIDAK dihitung ulang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Menghitung ulang bulan yang sebagian barisnya sudah terhapus akan
    // membuat agregat menyusut diam-diam setiap hari — kesalahan yang tidak
    // pernah menimbulkan error dan hanya terlihat bertahun kemudian.
    await mentah.aiUsage.create({
      data: {
        id: uuidV7(),
        userId,
        feature: "cv_chat",
        provider: "gemini",
        tokensIn: 100,
        tokensOut: 200,
        createdAt: lalu(120),
      },
    });
    await rakitService().run();
    const sebelum = await mentah.aiUsageMonthly.findFirst();

    // Run kedua: barisnya sudah hilang, tetapi agregatnya tidak boleh berubah.
    const laporan = await rakitService().run();

    expect(laporan.monthsAggregated).toBe(0);
    const sesudah = await mentah.aiUsageMonthly.findFirst();
    expect(sesudah?.requests).toBe(sebelum?.requests);
    expect(sesudah?.tokensIn).toBe(sebelum?.tokensIn);
  });

  it("bulan BERJALAN tidak difinalkan — masih bisa bertambah", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await mentah.aiUsage.create({
      data: {
        id: uuidV7(),
        userId,
        feature: "cv_chat",
        provider: "gemini",
        tokensIn: 5,
        tokensOut: 5,
        createdAt: lalu(1),
      },
    });

    const laporan = await rakitService().run();

    expect(laporan.monthsAggregated).toBe(0);
    expect(await mentah.aiUsageMonthly.count()).toBe(0);
    expect(await mentah.aiUsage.count({ where: { userId } })).toBe(1);
  });
});

describe("retensi — dry-run & batas", () => {
  it("dry-run tidak menghapus apa pun tetapi melaporkan sisa (AC)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const id = await buatToken({ expiresAt: lalu(100), revokedAt: null });

    const laporan = await rakitService().run({ dryRun: true });

    expect(laporan.deleted).toBe(0);
    expect(laporan.policies.find((p) => p.policy === "refresh_tokens.expired")?.remaining).toBe(1);
    expect(await hidup(id)).not.toBeNull();
  });

  it("batas per run dihormati, sisanya dilaporkan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    for (let i = 0; i < 5; i += 1) await buatToken({ expiresAt: lalu(100), revokedAt: null });

    const laporan = await rakitService({ batchSize: 2, maxPerRun: 3 }).run();

    const expired = laporan.policies.find((p) => p.policy === "refresh_tokens.expired");
    expect(expired?.deleted).toBe(3);
    expect(expired?.remaining).toBe(2);
  });
});

describe("indeks BRIN pendukung (AC)", () => {
  it("kedua index terpasang sebagai BRIN", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const rows = await mentah.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'refresh_tokens' AND indexname LIKE '%_brin'
      ORDER BY indexname`;

    expect(rows.map((r) => r.indexname)).toEqual([
      "refresh_tokens_expires_at_brin",
      "refresh_tokens_revoked_at_brin",
    ]);
    expect(rows.every((r) => /USING brin/i.test(r.indexdef))).toBe(true);
  });

  it("planner BISA memakai BRIN untuk selector retensi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // `enable_seqscan = off` diperlukan karena tabel uji berisi segelintir
    // baris — pada ukuran itu seq scan MEMANG lebih murah, dan memaksa
    // planner adalah satu-satunya cara membuktikan indexnya layak dipakai
    // untuk predikat ini. Yang diuji: "bisa", bukan "pasti dipilih".
    const rencana = await mentah.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
        EXPLAIN SELECT id FROM refresh_tokens WHERE revoked_at < ${lalu(180)}`;
    });

    const teks = rencana.map((r) => r["QUERY PLAN"]).join("\n");
    expect(teks).toMatch(/refresh_tokens_revoked_at_brin/);
  });
});
