// Metrik admin (PR-080) — integrasi: PostgreSQL nyata + HTTP + token RS256.
//
// FIXTURE DETERMINISTIK DI DATABASE BERSAMA. Seluruh baris fixture bertanggal
// Januari 2001 dan jam modul dipatok 2001-02-01, jadi jendela "30d" hanya
// memuat fixture berkas ini — angka funnel bisa dicocokkan PERSIS meski
// database berisi data seed dan berkas test lain.
//
// Kohort (daftar dalam jendela) dan nasibnya:
//   A  profil + vektor                          → profileReady
//   B  profil tanpa vektor
//   C  1 lamaran submitted                       → applied
//   D  lamaran interview → rejected (riwayat)    → applied, interviewed
//   E  lamaran offered → hired, dikonfirmasi     → applied, interviewed, hired
// Di luar kohort (tidak boleh terhitung di funnel):
//   F  seeker soft-delete berlamaran; G admin; H seeker daftar Des 2000 yang
//   konfirmasi diterimanya JATUH di jendela → hanya menambah North Star periode.
// Jendela SEBELUMNYA (3 Des 2000 – 2 Jan 2001, tren PR-081):
//   I  seeker daftar 15 Des 2000, 1 lamaran submitted → previous.registered/applied
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient, type ApplicationStatus, type Prisma } from "@prisma/client";
import type { AdminMetrics } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { uuidV7 } from "../src/core/ids/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { createAdminModule } from "../src/modules/admin/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const prisma = new PrismaClient();
const appPrisma = prisma as unknown as AppPrisma;
const tokens = createTokenService(SESSION_KEYS);

const JAM = new Date("2001-02-01T00:00:00.000Z");
const PREFIX_UJI = "+62887080";
const TANDA = "UJI-PR080";
const tgl = (hari: number) => new Date(Date.UTC(2001, 0, hari, 3));

let tersedia = false;
let api: ApiServer | null = null;
let base = "";
let companyId = "";
let adminToken = "";
let seekerToken = "";
const userIds: string[] = [];
const jobIds: string[] = [];
const akun = new Map<string, { id: string; role: "seeker" | "admin"; tokenVersion: number }>();
const cache = new Map<string, string>();
let urutan = 0;

async function buatUser(
  role: "seeker" | "admin",
  createdAt: Date,
  extra: Partial<Prisma.UserCreateInput> = {},
): Promise<string> {
  urutan += 1;
  const id = uuidV7();
  await prisma.user.create({
    data: {
      id,
      phone: `${PREFIX_UJI}${String(urutan).padStart(4, "0")}`,
      fullName: "Uji",
      role,
      createdAt,
      ...extra,
    },
  });
  userIds.push(id);
  akun.set(id, { id, role, tokenVersion: 0 });
  return id;
}

async function buatLowongan(): Promise<string> {
  const id = uuidV7();
  jobIds.push(id);
  await prisma.job.create({
    data: {
      id,
      companyId,
      title: `${TANDA} Lowongan ${jobIds.length}`,
      description: "Deskripsi uji",
      employmentType: "full_time",
      workMode: "remote",
      accommodations: [],
      welcomedDisabilityTypes: [],
      status: "published",
      publishedAt: tgl(1),
    },
  });
  return id;
}

async function buatLamaran(
  userId: string,
  status: ApplicationStatus,
  opsi: { riwayat?: Array<{ from: string; to: string }>; dikonfirmasi?: Date } = {},
): Promise<void> {
  await prisma.application.create({
    data: {
      id: uuidV7(),
      userId,
      jobId: await buatLowongan(),
      status,
      appliedAt: tgl(10),
      statusHistory: (opsi.riwayat ?? []).map((r) => ({
        ...r,
        by: "admin",
        at: tgl(12).toISOString(),
      })),
      hiredConfirmedAt: opsi.dikonfirmasi ?? null,
    },
  });
}

function minta(token: string, query = "?periode=30d"): Promise<Response> {
  return fetch(`${base}/admin/metrics${query}`, { headers: { authorization: `Bearer ${token}` } });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    tersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test metrik admin dilewati.");
    return;
  }

  companyId = uuidV7();
  await prisma.company.create({ data: { id: companyId, name: `${TANDA} PT` } });

  // --- kohort ---
  const a = await buatUser("seeker", tgl(5));
  await prisma.seekerProfile.create({ data: { userId: a } });
  const vektor = `[${Array.from({ length: 768 }, () => "0.01").join(",")}]`;
  await prisma.$executeRaw`UPDATE "seeker_profiles" SET "profile_embedding" = ${vektor}::vector WHERE "user_id" = ${a}::uuid`;
  const b = await buatUser("seeker", tgl(6));
  await prisma.seekerProfile.create({ data: { userId: b } });
  const c = await buatUser("seeker", tgl(7));
  await buatLamaran(c, "submitted");
  const d = await buatUser("seeker", tgl(8));
  await buatLamaran(d, "rejected", {
    riwayat: [
      { from: "submitted", to: "interview" },
      { from: "interview", to: "rejected" },
    ],
  });
  const e = await buatUser("seeker", tgl(9));
  await buatLamaran(e, "hired", {
    riwayat: [
      { from: "submitted", to: "offered" },
      { from: "offered", to: "hired" },
    ],
    dikonfirmasi: tgl(20),
  });

  // --- di luar kohort ---
  const f = await buatUser("seeker", tgl(11), { deletedAt: tgl(25) });
  await buatLamaran(f, "interview", { riwayat: [{ from: "submitted", to: "interview" }] });
  const adminId = await buatUser("admin", tgl(12));
  const h = await buatUser("seeker", new Date(Date.UTC(2000, 11, 1)));
  const i = await buatUser("seeker", new Date(Date.UTC(2000, 11, 15)));
  await buatLamaran(i, "submitted");
  await buatLamaran(h, "hired", { dikonfirmasi: tgl(21) });

  // --- pemakaian AI dalam jendela ---
  await prisma.aiUsage.createMany({
    data: [
      {
        id: uuidV7(),
        userId: a,
        feature: "cv_chat",
        provider: "uji",
        tokensIn: 10,
        tokensOut: 20,
        createdAt: tgl(15),
      },
      {
        id: uuidV7(),
        userId: a,
        feature: "cv_chat",
        provider: "uji",
        tokensIn: 5,
        tokensOut: 7,
        createdAt: tgl(16),
      },
      {
        id: uuidV7(),
        userId: c,
        feature: "rerank",
        provider: "uji",
        tokensIn: 3,
        tokensOut: 0,
        createdAt: tgl(17),
      },
    ],
  });

  adminToken = await tokens.signAccessToken({ sub: adminId, role: "admin", ver: 0 });
  seekerToken = await tokens.signAccessToken({ sub: a, role: "seeker", ver: 0 });

  const env = loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
  const logger = createLogger(env, {
    destination: new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  });
  const registry = createRouteRegistry({
    guardsFor: createAccessGuards({
      tokenService: tokens,
      findSessionUser: (id) => Promise.resolve(akun.get(id) ?? null),
    }).guardsFor,
  });
  const admin = createAdminModule({
    prisma: appPrisma,
    routes: registry.forModule("/api/v1"),
    cache: {
      get: (k) => Promise.resolve(cache.get(k) ?? null),
      set: (k, v) => {
        cache.set(k, v);
        return Promise.resolve("OK");
      },
    },
    bacaDlqTotal: () => Promise.resolve(3),
    logger,
    clock: () => JAM,
  });
  api = createServer(env, logger, {
    routes: (app) => {
      app.use(admin.router);
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await api?.stop();
  if (tersedia) {
    // ai_usage, profil, lamaran ikut terhapus (onDelete: Cascade dari users).
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe("GET /admin/metrics — angka cocok dengan fixture", () => {
  it("funnel kohort per pengguna, North Star, AI per fitur, DLQ", async (ctx) => {
    if (!tersedia) return ctx.skip();
    cache.clear();
    const res = await minta(adminToken);
    const { data } = (await res.json()) as { data: AdminMetrics };
    expect(res.status).toBe(200);

    expect(data.funnel).toEqual({
      registered: 5,
      profileReady: 1,
      applied: 3,
      interviewed: 2,
      hired: 1,
    });
    // E (kohort) + H (daftar sebelum jendela, konfirmasi di dalamnya).
    expect(data.northStar.confirmedInPeriod).toBe(2);
    expect(data.northStar.confirmedTotal).toBeGreaterThanOrEqual(2);
    expect(data.aiUsage.features).toEqual([
      { feature: "cv_chat", requests: 2, tokensIn: 15, tokensOut: 27 },
      { feature: "rerank", requests: 1, tokensIn: 3, tokensOut: 0 },
    ]);
    expect(data.dlqTotal).toBe(3);
    expect(data.previous).toEqual({
      from: "2000-12-03T00:00:00.000Z",
      to: "2001-01-02T00:00:00.000Z",
      funnel: { registered: 1, profileReady: 0, applied: 1, interviewed: 0, hired: 0 },
      confirmedInPeriod: 0,
    });
    expect(data).toMatchObject({
      period: "30d",
      from: "2001-01-02T00:00:00.000Z",
      to: JAM.toISOString(),
    });
  });

  it("7 hari: kohort menyempit (hanya yang daftar 25–31 Jan) — tidak ada", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const { data } = (await (await minta(adminToken, "?periode=7d")).json()) as {
      data: AdminMetrics;
    };
    expect(data.funnel.registered).toBe(0);
    expect(data.northStar.confirmedInPeriod).toBe(0);
  });
});

describe("cache 5 menit", () => {
  it("hit kedua dilayani cache: baris baru tidak terlihat sampai cache kedaluwarsa, dan cepat", async (ctx) => {
    if (!tersedia) return ctx.skip();
    cache.clear();
    const pertama = (await (await minta(adminToken)).json()) as { data: AdminMetrics };
    await buatUser("seeker", tgl(28));

    const mulai = performance.now();
    const res = await minta(adminToken);
    const durasi = performance.now() - mulai;
    const kedua = (await res.json()) as { data: AdminMetrics };

    expect(kedua.data.funnel.registered).toBe(pertama.data.funnel.registered);
    expect(kedua.data.generatedAt).toBe(pertama.data.generatedAt);
    expect(durasi).toBeLessThan(500);

    cache.clear();
    const segar = (await (await minta(adminToken)).json()) as { data: AdminMetrics };
    expect(segar.data.funnel.registered).toBe(pertama.data.funnel.registered + 1);
  });
});

describe("akses", () => {
  it("seeker → 403; periode tak dikenal → 400; tanpa periode → bawaan 30d", async (ctx) => {
    if (!tersedia) return ctx.skip();
    expect((await minta(seekerToken)).status).toBe(403);
    expect((await minta(adminToken, "?periode=90d")).status).toBe(400);
    const { data } = (await (await minta(adminToken, "")).json()) as { data: AdminMetrics };
    expect(data.period).toBe("30d");
  });
});
