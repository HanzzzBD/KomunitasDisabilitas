// Moderasi akun (PR-083) — integrasi: PostgreSQL nyata + HTTP + token RS256.
//
// Siklus penuh: sesi aktif → admin menangguhkan (alasan wajib, audit) → access
// token lama, refresh lama, dan login baru semuanya ditolak → admin memulihkan
// → login baru berhasil, refresh lama TETAP mati (pemulihan = masuk ulang).
// Plus: daftar admin (cari, saring), aturan sasaran, penyaring daftar lamaran,
// dan kohort metrik.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { AUDIT_ACTION, type AdminUser } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { AppError } from "../src/core/http/index.js";
import { createAuditLog, createPrismaAuditWriter } from "../src/core/audit/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import {
  createSessionRevoker,
  createSessionService,
  createSessionUserSource,
} from "../src/modules/auth/index.js";
import { createAuthUserRepository } from "../src/modules/auth/repositories/user.repository.js";
import { createRefreshTokenRepository } from "../src/modules/auth/repositories/refresh-token.repository.js";
import { createUsersModule } from "../src/modules/users/index.js";
import { createMetricsRepository } from "../src/modules/admin/index.js";
import { createApplicationsRepository } from "../src/modules/applications/repositories/applications.repository.js";
import { SESSION_KEYS } from "./helpers/session.js";

const prisma = new PrismaClient();
const appPrisma = prisma as unknown as AppPrisma;
const tokens = createTokenService(SESSION_KEYS);
const PREFIX_UJI = "+62887083";
const TANDA = "UJI-PR083";

let tersedia = false;
let api: ApiServer | null = null;
let base = "";
let adminId = "";
let adminToken = "";
let companyId = "";
const userIds: string[] = [];
const jobIds: string[] = [];
let urutan = 0;

const sesi = createSessionService({
  tokenService: tokens,
  userRepository: createAuthUserRepository(appPrisma),
  refreshTokenRepository: createRefreshTokenRepository(appPrisma),
  auditLog: () => {},
  alamatBanding: "banding@contoh.test",
});

async function buatUser(role: "seeker" | "admin", nama = "Uji", createdAt?: Date): Promise<string> {
  urutan += 1;
  const id = uuidV7();
  await prisma.user.create({
    data: {
      id,
      phone: `${PREFIX_UJI}${String(urutan).padStart(4, "0")}`,
      fullName: `${TANDA} ${nama}`,
      role,
      ...(createdAt ? { createdAt } : {}),
    },
  });
  userIds.push(id);
  return id;
}

function panggil(token: string, method: "GET" | "POST", path: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function galatDari(jalan: () => Promise<unknown>): Promise<AppError> {
  try {
    await jalan();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Diharapkan AppError");
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    tersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test moderasi dilewati.");
    return;
  }
  adminId = await buatUser("admin", "Admin");
  adminToken = await tokens.signAccessToken({ sub: adminId, role: "admin", ver: 0 });
  companyId = uuidV7();
  await prisma.company.create({ data: { id: companyId, name: `${TANDA} PT` } });

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
  const auditLog = createAuditLog({
    writer: createPrismaAuditWriter(appPrisma),
    logger,
    metrics: { increment: () => {} },
  });
  const registry = createRouteRegistry({
    guardsFor: createAccessGuards({
      tokenService: tokens,
      // Sumber sesi PRODUKSI — penjaga ini yang harus menolak akun ditangguhkan.
      findSessionUser: createSessionUserSource(appPrisma),
    }).guardsFor,
  });
  const users = createUsersModule({
    prisma: appPrisma,
    redis: {} as never,
    routes: registry.forModule("/api/v1"),
    auditLog,
    notificationPrefs: {} as never,
    cabutSemuaSesi: createSessionRevoker(appPrisma),
  });
  api = createServer(env, logger, {
    routes: (app) => {
      app.use(users);
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await api?.stop();
  if (tersedia) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe("siklus tangguhkan → pulihkan", () => {
  it("sesi lama mati, login ditolak dengan alamat banding, pulih = masuk ulang", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const s = await buatUser("seeker", "Siti");
    const awal = await sesi.issue(s);
    expect((await panggil(awal.accessToken, "GET", "/me")).status).toBe(200);

    // Alasan wajib.
    expect(
      (await panggil(adminToken, "POST", `/admin/users/${s}/suspend`, { reason: " " })).status,
    ).toBe(400);
    const res = await panggil(adminToken, "POST", `/admin/users/${s}/suspend`, {
      reason: "laporan penyalahgunaan tiket #31",
    });
    const { data } = (await res.json()) as { data: AdminUser };
    expect(res.status).toBe(200);
    expect(data.suspendedAt).not.toBeNull();

    // Access token lama, refresh lama, login baru — semuanya ditolak.
    expect((await panggil(awal.accessToken, "GET", "/me")).status).toBe(401);
    expect(
      (await galatDari(() => sesi.refresh(awal.refreshToken, { requestId: "r" }))).status,
    ).toBe(401);
    const login = await galatDari(() => sesi.issue(s));
    expect(login.code).toBe("AKUN_DITANGGUHKAN");
    expect(login.hint).toContain("banding@contoh.test");
    expect(login.hint).not.toContain("tiket #31");

    // Refresh token dicabut dengan alasan jujur; audit ber-alasan.
    const refresh = await prisma.refreshToken.findMany({ where: { userId: s } });
    expect(refresh.every((r) => r.revokedReason === "suspended")).toBe(true);
    const audit = await prisma.auditLog.findMany({
      where: { entityId: s, action: AUDIT_ACTION.USER_SUSPENDED },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorId).toBe(adminId);
    expect(audit[0]?.meta).toMatchObject({ reason: "laporan penyalahgunaan tiket #31" });

    // Dua kali → 409.
    expect(
      (await panggil(adminToken, "POST", `/admin/users/${s}/suspend`, { reason: "lagi" })).status,
    ).toBe(409);

    // Pulihkan → login baru berhasil, refresh lama tetap mati.
    const pulih = await panggil(adminToken, "POST", `/admin/users/${s}/unsuspend`, {
      reason: "banding diterima tiket #31",
    });
    expect(((await pulih.json()) as { data: AdminUser }).data.suspendedAt).toBeNull();
    const baru = await sesi.issue(s);
    expect((await panggil(baru.accessToken, "GET", "/me")).status).toBe(200);
    expect(
      (await galatDari(() => sesi.refresh(awal.refreshToken, { requestId: "r" }))).status,
    ).toBe(401);
    expect(
      await prisma.auditLog.count({
        where: { entityId: s, action: AUDIT_ACTION.USER_UNSUSPENDED },
      }),
    ).toBe(1);
  });
});

describe("aturan sasaran & akses", () => {
  it("admin lain & diri sendiri → 422; tak dikenal → 404; pulihkan akun aktif → 409; seeker → 403", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const adminLain = await buatUser("admin", "Admin Lain");
    const seeker = await buatUser("seeker", "Budi");
    const alasan = { reason: "uji" };
    expect(
      (await panggil(adminToken, "POST", `/admin/users/${adminLain}/suspend`, alasan)).status,
    ).toBe(422);
    expect(
      (await panggil(adminToken, "POST", `/admin/users/${adminId}/suspend`, alasan)).status,
    ).toBe(422);
    expect(
      (await panggil(adminToken, "POST", `/admin/users/${uuidV7()}/suspend`, alasan)).status,
    ).toBe(404);
    expect(
      (await panggil(adminToken, "POST", `/admin/users/${seeker}/unsuspend`, alasan)).status,
    ).toBe(409);
    const tokenSeeker = await tokens.signAccessToken({ sub: seeker, role: "seeker", ver: 0 });
    expect((await panggil(tokenSeeker, "GET", "/admin/users")).status).toBe(403);
  });

  it("daftar: cari nama sebagian & saring status ditangguhkan", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const a = await buatUser("seeker", "Cari Rahmawati");
    await panggil(adminToken, "POST", `/admin/users/${a}/suspend`, { reason: "uji daftar" });

    const cari = await panggil(
      adminToken,
      "GET",
      `/admin/users?q=${encodeURIComponent("rahmawati")}`,
    );
    const hasilCari = ((await cari.json()) as { data: AdminUser[] }).data;
    expect(hasilCari.map((u) => u.id)).toEqual([a]);

    const ditangguhkan = await panggil(
      adminToken,
      "GET",
      `/admin/users?status=ditangguhkan&q=${encodeURIComponent(TANDA)}`,
    );
    const ids = ((await ditangguhkan.json()) as { data: AdminUser[] }).data.map((u) => u.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(adminId);
  });
});

describe("akun ditangguhkan disembunyikan dari listing normal (flag)", () => {
  it("daftar lamaran admin: tersembunyi bawaan, tampil dengan termasukDitangguhkan", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const s = await buatUser("seeker", "Pelamar");
    const jobId = uuidV7();
    jobIds.push(jobId);
    await prisma.job.create({
      data: {
        id: jobId,
        companyId,
        title: `${TANDA} Lowongan`,
        description: "x",
        employmentType: "full_time",
        workMode: "remote",
        accommodations: [],
        welcomedDisabilityTypes: [],
        status: "published",
        publishedAt: new Date(),
      },
    });
    await prisma.application.create({ data: { id: uuidV7(), userId: s, jobId } });
    await panggil(adminToken, "POST", `/admin/users/${s}/suspend`, { reason: "uji lamaran" });

    const repo = createApplicationsRepository(appPrisma);
    const bawaan = await repo.listAdmin({ jobId }, 10);
    const termasuk = await repo.listAdmin({ jobId, termasukDitangguhkan: true }, 10);
    expect(bawaan).toHaveLength(0);
    expect(termasuk.map((r) => r.userId)).toEqual([s]);
  });

  it("kohort metrik admin tidak menghitung akun ditangguhkan", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const tgl = (h: number) => new Date(Date.UTC(1999, 0, h));
    await buatUser("seeker", "Kohort A", tgl(5));
    const b = await buatUser("seeker", "Kohort B", tgl(6));
    await prisma.user.update({
      where: { id: b },
      data: { suspendedAt: tgl(7), suspendReason: "uji kohort" },
    });
    const funnel = await createMetricsRepository(appPrisma).funnel({
      dari: tgl(1),
      sampai: tgl(31),
    });
    expect(funnel.registered).toBe(1);
  });
});
