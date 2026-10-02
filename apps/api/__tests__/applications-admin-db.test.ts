// Integration jalur admin lamaran (PR-077a) — HTTP nyata + PostgreSQL nyata.
//
// AC yang dibuktikan di sini:
//   - authz: hanya admin (pelamar 403, tanpa sesi 401);
//   - filter per lowongan/status + pagination cursor;
//   - lamaran disclose=false → admin TIDAK melihat data akomodasi (test
//     kontrak): daftar & detail tidak pernah membawanya, pembukaan ditolak;
//   - audit memuat actor + alasan (perubahan status DAN pembukaan data);
//   - ubah status → pelamar menerima notifikasi (modul notifications nyata).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient, type ApplicationStatus } from "@prisma/client";
import {
  AUDIT_ACTION,
  type AdminApplication,
  type AdminApplicationDetail,
  type DisclosureSnapshot,
} from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createAuditLog, createPrismaAuditWriter } from "../src/core/audit/index.js";
import { createEventBus } from "../src/core/events/index.js";
import { createFieldCrypto, parseFieldKeys } from "../src/core/crypto/index.js";
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
import {
  createAdminDirectory,
  createApplicantDirectory,
  createUserProfileRepository,
} from "../src/modules/users/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const prisma = new PrismaClient();
const appPrisma = prisma as unknown as AppPrisma;
const tokens = createTokenService(SESSION_KEYS);
const fieldKeys = parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 77).toString("base64") });
const crypto = createFieldCrypto(fieldKeys);

const PREFIX_UJI = "+62887077";
const TANDA = "UJI-PR077";
const ALASAN = "perusahaan mengundang wawancara (tiket #77)";
/**
 * Dua tes di bawah menyiapkan ±15 baris (akun + CV + lamaran) berurutan. Di
 * suite penuh `--concurrency=1` itu sempat melewati batas bawaan 5 dtk — batas
 * waktunya dinaikkan untuk tes itu saja, bukan untuk seluruh berkas.
 */

let tersedia = false;
let api: ApiServer | null = null;
let base = "";
let companyId = "";
let adminToken = "";
const jobIds: string[] = [];
const akun = new Map<string, { id: string; role: "seeker" | "admin"; tokenVersion: number }>();
let urutan = 0;
let adminId = "";

async function buatUser(role: "seeker" | "admin", fullName = "Uji"): Promise<string> {
  urutan += 1;
  const id = uuidV7();
  await prisma.user.create({
    data: {
      id,
      phone: `${PREFIX_UJI}${String(urutan).padStart(4, "0")}`,
      email: `uji077-${urutan}@contoh.test`,
      fullName,
      role,
    },
  });
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
      publishedAt: new Date(),
    },
  });
  return id;
}

const SALINAN: DisclosureSnapshot = {
  disabilityTypes: ["tuli"],
  accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: null },
  capturedAt: "2026-10-02T03:00:00.000Z",
};

/** Lamaran + CV pelamar; `ungkap` menyimpan salinan terenkripsi seperti PR-075. */
async function buatLamaran(opsi: {
  jobId: string;
  status?: ApplicationStatus;
  ungkap?: boolean;
  nama?: string;
}): Promise<{ id: string; userId: string; resumeId: string }> {
  const userId = await buatUser("seeker", opsi.nama ?? "Pelamar Uji");
  const resumeId = uuidV7();
  await prisma.resume.create({
    data: { id: resumeId, userId, title: "CV Pelamar", content: { schemaVersion: 1 } },
  });
  const id = uuidV7();
  await prisma.application.create({
    data: {
      id,
      userId,
      jobId: opsi.jobId,
      resumeId,
      status: opsi.status ?? "submitted",
      discloseDisability: opsi.ungkap === true,
      disclosureSnapshot: opsi.ungkap === true ? crypto.encryptJson(SALINAN) : null,
    },
  });
  return { id, userId, resumeId };
}

function panggil(
  token: string,
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function tunggu<T>(baca: () => Promise<T>, cukup: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 40; i += 1) {
    const v = await baca();
    if (cukup(v)) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  return baca();
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    tersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test admin lamaran dilewati.");
    return;
  }

  companyId = uuidV7();
  await prisma.company.create({ data: { id: companyId, name: `${TANDA} PT` } });
  adminId = await buatUser("admin", "Admin Uji");
  adminToken = await tokens.signAccessToken({ sub: adminId, role: "admin", ver: 0 });

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
    fieldKeys,
    auditLog,
    events,
    logger,
    jobsService: jobs.service,
    resumesService: resumes.service,
    sensitiveAccess: { bacaSensitif: tidakDipakai },
    identitasPelamar: (ids) =>
      createApplicantDirectory(createUserProfileRepository(appPrisma)).identitas(ids),
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

describe("authz — hanya admin", () => {
  it("pelamar → 403 di keempat route; tanpa sesi → 401", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const l = await buatLamaran({ jobId: await buatLowongan() });
    const seeker = await tokens.signAccessToken({ sub: l.userId, role: "seeker", ver: 0 });
    for (const [method, path, body] of [
      ["GET", "/admin/applications", undefined],
      ["GET", `/admin/applications/${l.id}`, undefined],
      ["PUT", `/admin/applications/${l.id}/status`, { status: "viewed", reason: ALASAN }],
      ["POST", `/admin/applications/${l.id}/disclosure`, { reason: ALASAN }],
    ] as const) {
      expect((await panggil(seeker, method, path, body)).status, path).toBe(403);
    }
    expect((await fetch(`${base}/admin/applications`)).status).toBe(401);
  });
});

describe("GET /admin/applications — filter + pagination", () => {
  it("filter job_id + status, cursor menelusuri seluruhnya, pelamar bernama", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const job = await buatLowongan();
    const lain = await buatLowongan();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push((await buatLamaran({ jobId: job, nama: `Pelamar ${i}` })).id);
    }
    await buatLamaran({ jobId: job, status: "rejected" });
    await buatLamaran({ jobId: lain });

    const h1 = (await (
      await panggil(adminToken, "GET", `/admin/applications?job_id=${job}&status=submitted&limit=2`)
    ).json()) as { data: AdminApplication[]; meta: { nextCursor: string | null } };
    expect(h1.data).toHaveLength(2);
    const h2 = (await (
      await panggil(
        adminToken,
        "GET",
        `/admin/applications?job_id=${job}&status=submitted&limit=2&cursor=${encodeURIComponent(h1.meta.nextCursor!)}`,
      )
    ).json()) as { data: AdminApplication[]; meta: { nextCursor: string | null } };
    expect(h2.meta.nextCursor).toBeNull();

    const semua = [...h1.data, ...h2.data];
    expect(semua.map((a) => a.id)).toEqual([...ids].reverse());
    expect(semua.every((a) => a.jobId === job && a.status === "submitted")).toBe(true);
    expect(semua[0]?.applicant.fullName).toBe("Pelamar 2");
  }, 20_000);
});

describe("AC: disclose=false → admin tidak melihat data akomodasi", () => {
  it("daftar & detail TIDAK PERNAH membawa isi yang diungkap, bahkan bila diungkap", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const job = await buatLowongan();
    const ungkap = await buatLamaran({ jobId: job, ungkap: true });

    const daftar = await (
      await panggil(adminToken, "GET", `/admin/applications?job_id=${job}`)
    ).text();
    const detailRes = await panggil(adminToken, "GET", `/admin/applications/${ungkap.id}`);
    const detail = await detailRes.text();
    for (const isi of [daftar, detail]) {
      expect(isi).not.toMatch(/tuli|juru_bahasa_isyarat|snapshot|disabilityTypes/i);
    }
    const { data } = JSON.parse(detail) as { data: AdminApplicationDetail };
    expect(data.discloseDisability).toBe(true);
    // Yang admin perlukan untuk meneruskan lamaran: kontak + CV.
    expect(data.applicant).toMatchObject({ fullName: "Pelamar Uji", email: expect.any(String) });
    expect(data.resume?.id).toBe(ungkap.resumeId);
  });

  it("lamaran disclose=false → pembukaan ditolak 404 DATA_TIDAK_DIUNGKAP, tetapi TERCATAT", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const l = await buatLamaran({ jobId: await buatLowongan() });
    const res = await panggil(adminToken, "POST", `/admin/applications/${l.id}/disclosure`, {
      reason: ALASAN,
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_TIDAK_DIUNGKAP");
    const audit = await tunggu(
      () =>
        prisma.auditLog.findMany({
          where: { entityId: l.id, action: AUDIT_ACTION.APPLICATION_DISCLOSURE_READ },
        }),
      (rows) => rows.length > 0,
    );
    expect(audit).toHaveLength(1);
  });

  it("lamaran diungkap → salinan terbuka dengan alasan, no-store, actor+alasan di audit", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const l = await buatLamaran({ jobId: await buatLowongan(), ungkap: true });

    expect(
      (await panggil(adminToken, "POST", `/admin/applications/${l.id}/disclosure`, {})).status,
    ).toBe(400);

    const res = await panggil(adminToken, "POST", `/admin/applications/${l.id}/disclosure`, {
      reason: ALASAN,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(((await res.json()) as { data: DisclosureSnapshot }).data).toEqual(SALINAN);

    const audit = await tunggu(
      () =>
        prisma.auditLog.findMany({
          where: { entityId: l.id, action: AUDIT_ACTION.APPLICATION_DISCLOSURE_READ },
        }),
      (rows) => rows.length > 0,
    );
    expect(audit.map((a) => [a.actorId, (a.meta as { reason?: string }).reason])).toEqual([
      [adminId, ALASAN],
    ]);
    expect(JSON.stringify(audit.map((a) => a.meta))).not.toMatch(/tuli|juru_bahasa/);
  });
});

describe("PUT /admin/applications/:id/status", () => {
  it("maju loncat + riwayat by:admin + audit actor+alasan + pelamar dikabari", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const l = await buatLamaran({ jobId: await buatLowongan() });

    const res = await panggil(adminToken, "PUT", `/admin/applications/${l.id}/status`, {
      status: "interview",
      reason: ALASAN,
    });
    const { data } = (await res.json()) as { data: AdminApplicationDetail };
    expect(res.status).toBe(200);
    expect(data.status).toBe("interview");
    expect(data.statusHistory).toEqual([
      { from: "submitted", to: "interview", by: "admin", at: expect.any(String) },
    ]);

    const audit = await tunggu(
      () =>
        prisma.auditLog.findMany({
          where: { entityId: l.id, action: AUDIT_ACTION.APPLICATION_STATUS_CHANGED },
        }),
      (rows) => rows.length > 0,
    );
    expect(audit.map((a) => [a.actorId, a.meta])).toEqual([
      [adminId, expect.objectContaining({ from: "submitted", to: "interview", reason: ALASAN })],
    ]);

    const kabar = await tunggu(
      () => prisma.notification.findMany({ where: { userId: l.userId } }),
      (rows) => rows.length > 0,
    );
    expect(kabar.map((k) => [k.type, (k.payload as { status?: string }).status])).toEqual([
      ["lamaran.status_berubah", "interview"],
    ]);
  });

  it("mundur, ke withdrawn, dari status akhir → 409; tanpa alasan → 400", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const job = await buatLowongan();
    const kasus: Array<[ApplicationStatus, ApplicationStatus, number]> = [
      ["interview", "in_review", 409],
      ["submitted", "withdrawn", 409],
      ["rejected", "hired", 409],
    ];
    for (const [dari, ke, harap] of kasus) {
      const l = await buatLamaran({ jobId: job, status: dari });
      const res = await panggil(adminToken, "PUT", `/admin/applications/${l.id}/status`, {
        status: ke,
        reason: ALASAN,
      });
      expect(res.status, `${dari}→${ke}`).toBe(harap);
    }
    const l = await buatLamaran({ jobId: job });
    const tanpaAlasan = await panggil(adminToken, "PUT", `/admin/applications/${l.id}/status`, {
      status: "viewed",
      reason: "   ",
    });
    expect(tanpaAlasan.status).toBe(400);
  }, 20_000);
});
