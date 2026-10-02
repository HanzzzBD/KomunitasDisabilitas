// Integration "Lamaran Saya" (PR-076) — HTTP nyata + PostgreSQL nyata.
//
// Yang hanya bisa dibuktikan di sini:
//   - riwayat {from,to,by,at} benar-benar TERTULIS di JSONB (AC-2);
//   - compare-and-set: dua withdraw serentak → satu menang, satu 409, riwayat
//     tidak bertambah dua kali; dua confirm-hired serentak → satu event;
//   - confirm-hired mengisi `hired_confirmed_at` + event North Star (AC-3);
//   - event → notifikasi lewat modul notifications sungguhan (AC-5): admin
//     dikabari, pelamar TIDAK dikabari atas aksinya sendiri.
//
// Status awal disiapkan langsung lewat Prisma: jalur admin yang memindahkan
// status baru lahir di PR-077.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient, type ApplicationStatus } from "@prisma/client";
import { AUDIT_ACTION, type MyApplication, type MyApplicationDetail } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createAuditLog, createPrismaAuditWriter } from "../src/core/audit/index.js";
import { createEventBus } from "../src/core/events/index.js";
import { parseFieldKeys } from "../src/core/crypto/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { createApplicationsModule } from "../src/modules/applications/index.js";
import { createJobsModule } from "../src/modules/jobs/index.js";
import { createResumesModule } from "../src/modules/resumes/index.js";
import { createNotificationsModule } from "../src/modules/notifications/index.js";
import { createAdminDirectory, createUserProfileRepository } from "../src/modules/users/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const prisma = new PrismaClient();
const appPrisma = prisma as unknown as AppPrisma;
const tokens = createTokenService(SESSION_KEYS);

const PREFIX_UJI = "+62887076";
const TANDA = "UJI-PR076";

let tersedia = false;
let api: ApiServer | null = null;
let base = "";
let companyId = "";
let adminId = "";
const jobIds: string[] = [];
const akun = new Map<string, { id: string; role: "seeker" | "admin"; tokenVersion: number }>();
let urutan = 0;

async function buatUser(role: "seeker" | "admin"): Promise<string> {
  urutan += 1;
  const id = uuidV7();
  await prisma.user.create({
    data: { id, phone: `${PREFIX_UJI}${String(urutan).padStart(4, "0")}`, fullName: "Uji", role },
  });
  akun.set(id, { id, role, tokenVersion: 0 });
  return id;
}

async function buatLowongan(status: "published" | "closed" = "published"): Promise<string> {
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
      status,
      publishedAt: new Date(),
    },
  });
  return id;
}

async function buatPelamar(): Promise<{ userId: string; token: string }> {
  const userId = await buatUser("seeker");
  return { userId, token: await tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 }) };
}

async function buatLamaran(
  userId: string,
  status: ApplicationStatus,
  jobId?: string,
): Promise<string> {
  const id = uuidV7();
  await prisma.application.create({
    data: { id, userId, jobId: jobId ?? (await buatLowongan()), status },
  });
  return id;
}

function panggil(token: string, method: "GET" | "POST", path: string): Promise<Response> {
  return fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
}

async function tunggu<T>(baca: () => Promise<T>, cukup: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 40; i += 1) {
    const v = await baca();
    if (cukup(v)) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  return baca();
}

/** Notifikasi milik lamaran ini — payload selalu memuat applicationId. */
/**
 * Notifikasi lamaran ini untuk akun-akun UJI saja. Admin dari seed (dan dari
 * berkas lain) ikut menerima kabar admin — itu benar, tetapi di luar kendali
 * berkas ini, jadi tidak ikut dihitung.
 */
async function notifikasiLamaran(applicationId: string) {
  const rows = await prisma.notification.findMany({
    where: { userId: { in: [...akun.keys()] } },
    select: { userId: true, type: true, payload: true },
  });
  return rows.filter(
    (r) => (r.payload as { applicationId?: string }).applicationId === applicationId,
  );
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    tersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test status lamaran dilewati.");
    return;
  }

  companyId = uuidV7();
  await prisma.company.create({ data: { id: companyId, name: `${TANDA} PT` } });
  adminId = await buatUser("admin");

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
  const events = createEventBus({ logger });
  const registry = createRouteRegistry({
    guardsFor: createAccessGuards({
      tokenService: tokens,
      findSessionUser: (id) => Promise.resolve(akun.get(id) ?? null),
    }).guardsFor,
  });
  const routes = () => registry.forModule("/api/v1");

  const notifications = createNotificationsModule({
    prisma: appPrisma,
    routes: routes(),
    events,
    direktoriAdmin: createAdminDirectory(createUserProfileRepository(appPrisma)),
  });
  const resumes = createResumesModule({ prisma: appPrisma, routes: routes(), maksPerPengguna: 5 });
  const jobs = createJobsModule({ prisma: appPrisma, routes: routes(), auditLog, events });
  const tidakDipakai = () => Promise.reject(new Error("jalur apply tidak diuji di berkas ini"));
  const applications = createApplicationsModule({
    prisma: appPrisma,
    routes: routes(),
    redis: {
      get: tidakDipakai,
      set: tidakDipakai,
      del: tidakDipakai,
      incr: tidakDipakai,
      expire: tidakDipakai,
      ttl: tidakDipakai,
    } as never,
    fieldKeys: parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 76).toString("base64") }),
    auditLog,
    events,
    logger,
    jobsService: jobs.service,
    resumesService: resumes.service,
    sensitiveAccess: { bacaSensitif: tidakDipakai },
  });

  api = createServer(env, logger, {
    routes: (app) => {
      app.use(notifications.router);
      app.use(resumes.router);
      app.use(jobs.router);
      app.use(applications.router);
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await api?.stop();
  if (tersedia) {
    await prisma.user.deleteMany({ where: { id: { in: [...akun.keys()] } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe("GET /me/applications — daftar & detail", () => {
  it("hanya milik sendiri, terbaru berubah dulu, cursor menelusuri seluruhnya", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const lain = await buatPelamar();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push(await buatLamaran(p.userId, "submitted"));
    await buatLamaran(lain.userId, "submitted");

    const r1 = await panggil(p.token, "GET", "/me/applications?limit=2");
    const h1 = (await r1.json()) as { data: MyApplication[]; meta: { nextCursor: string | null } };
    expect(r1.status).toBe(200);
    expect(h1.data).toHaveLength(2);
    expect(h1.meta.nextCursor).not.toBeNull();

    const r2 = await panggil(
      p.token,
      "GET",
      `/me/applications?limit=2&cursor=${encodeURIComponent(h1.meta.nextCursor!)}`,
    );
    const h2 = (await r2.json()) as { data: MyApplication[]; meta: { nextCursor: string | null } };
    expect(h2.meta.nextCursor).toBeNull();

    const semua = [...h1.data, ...h2.data].map((a) => a.id);
    // Dibuat berurutan → updatedAt menaik → urutan terbalik.
    expect(semua).toEqual([...ids].reverse());
    expect(h1.data[0]?.job).toMatchObject({ companyName: `${TANDA} PT`, aktif: true });
  });

  it("lowongan yang sudah ditutup tetap tampil, bertanda aktif:false", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const id = await buatLamaran(p.userId, "in_review", await buatLowongan("closed"));
    const res = await panggil(p.token, "GET", `/me/applications/${id}`);
    const { data } = (await res.json()) as { data: MyApplicationDetail };
    expect(res.status).toBe(200);
    expect(data.job?.aktif).toBe(false);
    expect(data.statusHistory).toEqual([]);
  });

  it("lamaran orang lain = tidak ada (404), cursor rusak = 400", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const lain = await buatPelamar();
    const id = await buatLamaran(lain.userId, "submitted");
    expect((await panggil(p.token, "GET", `/me/applications/${id}`)).status).toBe(404);
    expect((await panggil(p.token, "POST", `/me/applications/${id}/withdraw`)).status).toBe(404);
    expect((await panggil(p.token, "GET", "/me/applications?cursor=rusak")).status).toBe(400);
  });

  it("admin tidak memakai jalur pelamar (403)", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const token = await tokens.signAccessToken({ sub: adminId, role: "admin", ver: 0 });
    expect((await panggil(token, "GET", "/me/applications")).status).toBe(403);
  });
});

describe("POST /me/applications/:id/withdraw", () => {
  it("menulis riwayat {from,to,by,at} + audit; admin dikabari, pelamar TIDAK", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const id = await buatLamaran(p.userId, "interview");

    const res = await panggil(p.token, "POST", `/me/applications/${id}/withdraw`);
    const { data } = (await res.json()) as { data: MyApplicationDetail };
    expect(res.status).toBe(200);
    expect(data.status).toBe("withdrawn");
    expect(data.statusHistory).toEqual([
      { from: "interview", to: "withdrawn", by: "seeker", at: expect.any(String) },
    ]);

    const kabar = await tunggu(
      () => notifikasiLamaran(id),
      (rows) => rows.length > 0,
    );
    expect(kabar).toEqual([
      {
        userId: adminId,
        type: "admin.lamaran_dibatalkan",
        payload: expect.objectContaining({ applicationId: id }),
      },
    ]);
    const audit = await tunggu(
      () => prisma.auditLog.findMany({ where: { entityId: id } }),
      (rows) => rows.length > 0,
    );
    expect(audit.map((a) => [a.action, a.actorId, a.meta])).toEqual([
      [
        AUDIT_ACTION.APPLICATION_STATUS_CHANGED,
        p.userId,
        expect.objectContaining({ from: "interview", to: "withdrawn" }),
      ],
    ]);
  });

  it("status akhir tidak bisa di-withdraw (409): rejected, hired, withdrawn", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    for (const status of ["rejected", "hired", "withdrawn"] as const) {
      const id = await buatLamaran(p.userId, status);
      const res = await panggil(p.token, "POST", `/me/applications/${id}/withdraw`);
      expect(res.status, status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe("STATUS_LAMARAN_TIDAK_VALID");
    }
  });

  it("dua withdraw serentak → satu 200, satu 409, riwayat satu entri", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const id = await buatLamaran(p.userId, "submitted");

    const hasil = await Promise.all([
      panggil(p.token, "POST", `/me/applications/${id}/withdraw`),
      panggil(p.token, "POST", `/me/applications/${id}/withdraw`),
    ]);
    expect(hasil.map((r) => r.status).sort()).toEqual([200, 409]);
    const baris = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect(baris.statusHistory).toHaveLength(1);
  });
});

describe("POST /me/applications/:id/confirm-hired (North Star)", () => {
  it("dari offered → hired + hired_confirmed_at + riwayat + kabar admin", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const id = await buatLamaran(p.userId, "offered");

    const res = await panggil(p.token, "POST", `/me/applications/${id}/confirm-hired`);
    const { data } = (await res.json()) as { data: MyApplicationDetail };
    expect(res.status).toBe(200);
    expect(data.status).toBe("hired");
    expect(data.hiredConfirmedAt).not.toBeNull();
    expect(data.statusHistory).toEqual([
      { from: "offered", to: "hired", by: "seeker", at: data.hiredConfirmedAt },
    ]);

    const kabar = await tunggu(
      () => notifikasiLamaran(id),
      (rows) => rows.length > 0,
    );
    // Pelamar TIDAK dikabari atas konfirmasinya sendiri; admin diminta verifikasi.
    expect(kabar.map((k) => [k.userId, k.type])).toEqual([
      [adminId, "admin.penempatan_terkonfirmasi"],
    ]);
    const audit = await tunggu(
      () => prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { id: "asc" } }),
      (rows) => rows.length >= 2,
    );
    expect(audit.map((a) => a.action).sort()).toEqual(
      [AUDIT_ACTION.APPLICATION_HIRED_CONFIRMED, AUDIT_ACTION.APPLICATION_STATUS_CHANGED].sort(),
    );
  });

  it("dari hired (diputuskan admin) → hanya mengisi hired_confirmed_at", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const id = await buatLamaran(p.userId, "hired");
    const res = await panggil(p.token, "POST", `/me/applications/${id}/confirm-hired`);
    const { data } = (await res.json()) as { data: MyApplicationDetail };
    expect(data.status).toBe("hired");
    expect(data.hiredConfirmedAt).not.toBeNull();
    expect(data.statusHistory).toEqual([]);
  });

  it("dua tekan serentak → keduanya 200, satu konfirmasi, satu kabar admin", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const id = await buatLamaran(p.userId, "offered");

    const hasil = await Promise.all([
      panggil(p.token, "POST", `/me/applications/${id}/confirm-hired`),
      panggil(p.token, "POST", `/me/applications/${id}/confirm-hired`),
    ]);
    expect(hasil.map((r) => r.status)).toEqual([200, 200]);
    // Tekan ketiga, berurutan, juga idempoten.
    expect((await panggil(p.token, "POST", `/me/applications/${id}/confirm-hired`)).status).toBe(
      200,
    );

    await tunggu(
      () => notifikasiLamaran(id),
      (rows) => rows.length > 0,
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(await notifikasiLamaran(id)).toHaveLength(1);
    const audit = await prisma.auditLog.count({
      where: { entityId: id, action: AUDIT_ACTION.APPLICATION_HIRED_CONFIRMED },
    });
    expect(audit).toBe(1);
  });

  it("belum ditawari (interview) → 409, tidak ada yang berubah", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const id = await buatLamaran(p.userId, "interview");
    const res = await panggil(p.token, "POST", `/me/applications/${id}/confirm-hired`);
    expect(res.status).toBe(409);
    const baris = await prisma.application.findUniqueOrThrow({ where: { id } });
    expect([baris.status, baris.hiredConfirmedAt]).toEqual(["interview", null]);
  });
});
