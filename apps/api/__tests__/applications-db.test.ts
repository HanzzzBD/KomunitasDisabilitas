// Integration apply (PR-075) — HTTP nyata, PostgreSQL nyata, Redis nyata.
//
// KENAPA SELURUH RANTAI, BUKAN SERVICE SAJA. Empat AC PR-075 hanya bisa
// dibuktikan oleh komponen yang tidak ada di unit test:
//
//   1. RETRY GANDA dengan kunci sama → satu lamaran: `SET NX` Redis sungguhan.
//   2. BALAPAN dua permintaan berbeda kunci → satu lamaran: unique
//      `(user_id, job_id)` PostgreSQL — tidak ada kunci aplikasi yang bisa
//      menggantikannya.
//   3. disclose=false → NOL jejak sensitif: dibaca dengan SQL mentah langsung
//      dari kolomnya, ditambah CHECK migrasi 20 yang menolak penulisan liar.
//   4. disclose=true → SALINAN: profil disunting sesudah melamar, snapshot
//      lamaran lama tidak ikut berubah.
//
// Ditambah: event `application.submitted` sampai ke notifikasi pelamar DAN
// admin (modul notifications sungguhan di bus yang sama), serta jejak audit.
//
// Pola skip anggun sama dengan berkas *-db lain: tanpa DB/Redis, dilewati.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import {
  AUDIT_ACTION,
  disclosureSnapshotSchema,
  type ExportApplication,
  type UserRole,
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
import {
  createApplicationsExport,
  createApplicationsModule,
} from "../src/modules/applications/index.js";
import { createProfilesModule } from "../src/modules/profiles/index.js";
import { createJobsModule } from "../src/modules/jobs/index.js";
import { createResumesModule } from "../src/modules/resumes/index.js";
import { createNotificationsModule } from "../src/modules/notifications/index.js";
import { createAdminDirectory, createUserProfileRepository } from "../src/modules/users/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const prisma = new PrismaClient();
const appPrisma = prisma as unknown as AppPrisma;
const fieldKeys = parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 75).toString("base64") });
const crypto = createFieldCrypto(fieldKeys);
const tokens = createTokenService(SESSION_KEYS);

const PREFIX_UJI = "+62887075";
const TANDA = "UJI-PR075";

let tersedia = false;
let redis: Redis | null = null;
let api: ApiServer | null = null;
let base = "";
let jobId = "";
let companyId = "";
let adminId = "";

/** Peran per akun untuk guard sesi — akunnya sendiri ada di DB sungguhan. */
const akun = new Map<string, { id: string; role: UserRole; tokenVersion: number }>();
let urutan = 0;

async function buatUser(role: UserRole): Promise<string> {
  urutan += 1;
  const id = uuidV7();
  await prisma.user.create({
    data: { id, phone: `${PREFIX_UJI}${String(urutan).padStart(4, "0")}`, fullName: "Uji", role },
  });
  akun.set(id, { id, role, tokenVersion: 0 });
  return id;
}

/** Pelamar lengkap: akun, CV, dan profil dengan data disabilitas ber-consent. */
async function buatPelamar(): Promise<{ userId: string; resumeId: string; token: string }> {
  const userId = await buatUser("seeker");
  const resumeId = uuidV7();
  await prisma.resume.create({ data: { id: resumeId, userId, title: "CV Uji" } });
  await prisma.seekerProfile.create({
    data: {
      userId,
      consentSensitiveAt: new Date(),
      disabilityTypes: crypto.encryptJson(["netra"]),
      accommodationNeeds: crypto.encryptJson({ tags: ["ramah_screen_reader"], notes: null }),
    },
  });
  const token = await tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 });
  return { userId, resumeId, token };
}

function lamar(
  token: string,
  body: unknown,
  kunci: string | undefined,
  job = jobId,
): Promise<Response> {
  return fetch(`${base}/jobs/${job}/apply`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(kunci === undefined ? {} : { "idempotency-key": kunci }),
    },
    body: JSON.stringify(body),
  });
}

const kunciBaru = () => `uji075-${uuidV7()}`;

/** Audit ditulis fire-and-forget (core/audit) — tunggu sampai barisnya ada. */
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
    const klien = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    klien.on("error", () => {});
    await klien.connect();
    await klien.ping();
    redis = klien;
    tersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB/Redis tidak terjangkau — integration test apply dilewati.");
    return;
  }

  companyId = uuidV7();
  jobId = uuidV7();
  await prisma.company.create({ data: { id: companyId, name: `${TANDA} PT` } });
  await prisma.job.create({
    data: {
      id: jobId,
      companyId,
      title: `${TANDA} Lowongan`,
      description: "Deskripsi uji",
      employmentType: "full_time",
      workMode: "remote",
      accommodations: ["ramah_screen_reader"],
      welcomedDisabilityTypes: [],
      status: "published",
      publishedAt: new Date(),
    },
  });
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

  const profiles = createProfilesModule({
    prisma: appPrisma,
    routes: routes(),
    fieldKeys,
    auditLog,
    events,
  });
  const notifications = createNotificationsModule({
    prisma: appPrisma,
    routes: routes(),
    events,
    direktoriAdmin: createAdminDirectory(createUserProfileRepository(appPrisma)),
  });
  const resumes = createResumesModule({ prisma: appPrisma, routes: routes(), maksPerPengguna: 5 });
  const jobs = createJobsModule({ prisma: appPrisma, routes: routes(), auditLog, events });
  const applications = createApplicationsModule({
    prisma: appPrisma,
    routes: routes(),
    redis: redis!,
    fieldKeys,
    auditLog,
    events,
    logger,
    jobsService: jobs.service,
    resumesService: resumes.service,
    sensitiveAccess: profiles.sensitiveAccess,
  });

  api = createServer(env, logger, {
    routes: (app) => {
      for (const r of [profiles.router, notifications.router, resumes.router, jobs.router]) {
        app.use(r);
      }
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
    const ids = [...akun.keys()];
    if (redis !== null) {
      for (const id of ids) {
        const kunci = await redis.keys(`apply:*${id}*`);
        if (kunci.length > 0) await redis.del(...kunci);
      }
      redis.disconnect();
    }
    // Lamaran ikut cascade dari users; baru sesudahnya lowongan (Restrict) bisa dihapus.
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.job.deleteMany({ where: { id: jobId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

const jumlahLamaran = (userId: string) => prisma.application.count({ where: { userId } });

describe("kontrak HTTP", () => {
  it("tanpa header Idempotency-Key → 400, tanpa lamaran", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const res = await lamar(
      p.token,
      { resumeId: p.resumeId, discloseDisability: false },
      undefined,
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("IDEMPOTENCY_KEY_DIPERLUKAN");
    expect(await jumlahLamaran(p.userId)).toBe(0);
  });

  it("discloseDisability tidak dinyatakan → 400 (tidak ada default diam-diam)", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const res = await lamar(p.token, { resumeId: p.resumeId }, kunciBaru());
    expect(res.status).toBe(400);
  });

  it("akun admin tidak bisa melamar → 403", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const token = await tokens.signAccessToken({ sub: adminId, role: "admin", ver: 0 });
    const res = await lamar(token, { resumeId: uuidV7(), discloseDisability: false }, kunciBaru());
    expect(res.status).toBe(403);
  });
});

describe("AC-1 retry ganda dengan Idempotency-Key sama → satu lamaran", () => {
  it("berurutan: 201 lalu 201 putar ulang dengan id yang SAMA", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const kunci = kunciBaru();
    const body = { resumeId: p.resumeId, discloseDisability: false };

    const a = await lamar(p.token, body, kunci);
    const b = await lamar(p.token, body, kunci);
    const [da, db] = (await Promise.all([a.json(), b.json()])) as Array<{ data: { id: string } }>;

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.headers.get("idempotent-replayed")).toBeNull();
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(db?.data.id).toBe(da?.data.id);
    expect(await jumlahLamaran(p.userId)).toBe(1);
  });

  it("serentak (klik ganda): lima permintaan kunci sama → tepat satu lamaran", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const kunci = kunciBaru();
    const body = { resumeId: p.resumeId, discloseDisability: false };

    const hasil = await Promise.all(Array.from({ length: 5 }, () => lamar(p.token, body, kunci)));
    const status = hasil.map((r) => r.status);

    expect(status).toContain(201);
    expect(status.every((s) => s === 201 || s === 409)).toBe(true);
    expect(await jumlahLamaran(p.userId)).toBe(1);
  });
});

describe("AC-2 balapan berbeda kunci → satu lamaran (unique DB)", () => {
  it("lima permintaan paralel, lima kunci → satu 201, sisanya 409 SUDAH_MELAMAR", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const body = { resumeId: p.resumeId, discloseDisability: false };

    const hasil = await Promise.all(
      Array.from({ length: 5 }, () => lamar(p.token, body, kunciBaru())),
    );
    const status = hasil.map((r) => r.status).sort();
    const kode = await Promise.all(
      hasil
        .filter((r) => r.status === 409)
        .map(async (r) => ((await r.json()) as { code: string }).code),
    );

    expect(status).toEqual([201, 409, 409, 409, 409]);
    expect(new Set(kode)).toEqual(new Set(["SUDAH_MELAMAR"]));
    expect(await jumlahLamaran(p.userId)).toBe(1);
  });
});

describe("AC-3 disclose=false → nol jejak sensitif di record", () => {
  it("kolom snapshot NULL (SQL mentah) dan tidak ada pembacaan sensitif tujuan disclosure", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const res = await lamar(
      p.token,
      { resumeId: p.resumeId, discloseDisability: false },
      kunciBaru(),
    );
    const { data } = (await res.json()) as { data: { id: string } };
    expect(res.status).toBe(201);

    const [baris] = await prisma.$queryRaw<
      Array<{ disclose_disability: boolean; disclosure_snapshot: Buffer | null }>
    >`SELECT disclose_disability, disclosure_snapshot FROM applications WHERE id = ${data.id}::uuid`;
    expect(baris).toEqual({ disclose_disability: false, disclosure_snapshot: null });

    // Beri audit waktu untuk tertulis, lalu pastikan TIDAK ada yang tertulis.
    await tunggu(
      () => prisma.auditLog.count({ where: { entityId: data.id } }),
      (n) => n > 0,
    );
    const bacaan = await prisma.auditLog.count({
      where: { action: AUDIT_ACTION.PROFILE_SENSITIVE_READ, entityId: p.userId },
    });
    expect(bacaan).toBe(0);
  });

  it("CHECK migrasi 20 menolak snapshot pada lamaran ber-disclose=false", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const res = await lamar(
      p.token,
      { resumeId: p.resumeId, discloseDisability: false },
      kunciBaru(),
    );
    const { data } = (await res.json()) as { data: { id: string } };

    await expect(
      prisma.application.update({
        where: { id: data.id },
        data: { disclosureSnapshot: crypto.encryptJson({ bocor: true }) },
      }),
    ).rejects.toThrow(/applications_snapshot_hanya_bila_disclose/);
  });
});

describe("AC-4 disclose=true → snapshot SALINAN, bukan referensi live", () => {
  it("snapshot = profil saat melamar; suntingan profil sesudahnya tidak mengubahnya", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const res = await lamar(
      p.token,
      { resumeId: p.resumeId, discloseDisability: true },
      kunciBaru(),
    );
    const { data } = (await res.json()) as { data: { id: string; discloseDisability: boolean } };
    expect(res.status).toBe(201);
    expect(data.discloseDisability).toBe(true);
    // Respons pelamar TIDAK membawa snapshot.
    expect(JSON.stringify(data)).not.toMatch(/netra|ramah_screen_reader|snapshot/i);

    // Profil berubah total sesudah melamar.
    await prisma.seekerProfile.update({
      where: { userId: p.userId },
      data: {
        disabilityTypes: crypto.encryptJson(["daksa"]),
        accommodationNeeds: crypto.encryptJson({ tags: ["akses_kursi_roda"], notes: "baru" }),
      },
    });

    const baris = await prisma.application.findUniqueOrThrow({ where: { id: data.id } });
    expect(baris.disclosureSnapshot).not.toBeNull();
    const snapshot = disclosureSnapshotSchema.parse(
      crypto.decryptJson(baris.disclosureSnapshot as Buffer),
    );
    expect(snapshot.disabilityTypes).toEqual(["netra"]);
    expect(snapshot.accommodationNeeds).toEqual({ tags: ["ramah_screen_reader"], notes: null });

    // Pengungkapan berjejak: pembacaan sensitif tujuan `disclosure` + lamaran.
    const audit = await tunggu(
      () =>
        prisma.auditLog.findMany({
          where: {
            OR: [
              { action: AUDIT_ACTION.PROFILE_SENSITIVE_READ, entityId: p.userId },
              { action: AUDIT_ACTION.APPLICATION_SUBMITTED, entityId: data.id },
            ],
          },
        }),
      (rows) => rows.length >= 2,
    );
    const baca = audit.find((a) => a.action === AUDIT_ACTION.PROFILE_SENSITIVE_READ);
    const kirim = audit.find((a) => a.action === AUDIT_ACTION.APPLICATION_SUBMITTED);
    expect(baca?.meta).toMatchObject({ purpose: "disclosure" });
    expect(kirim?.meta).toMatchObject({ jobId, disclosed: true });
    expect(JSON.stringify(audit.map((a) => a.meta))).not.toMatch(/netra|ramah_screen_reader/);
  });
});

describe("AC-5 event submitted → notifikasi", () => {
  it("pelamar menerima bukti terima DAN admin menerima kabar lamaran baru", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const res = await lamar(
      p.token,
      { resumeId: p.resumeId, discloseDisability: true },
      kunciBaru(),
    );
    const { data } = (await res.json()) as { data: { id: string } };

    const notifikasi = await tunggu(
      () =>
        prisma.notification.findMany({
          where: { userId: { in: [p.userId, adminId] } },
          select: { userId: true, type: true, payload: true },
        }),
      (rows) =>
        rows.filter((r) => (r.payload as { applicationId?: string }).applicationId === data.id)
          .length >= 2,
    );
    const milikLamaran = notifikasi.filter(
      (r) => (r.payload as { applicationId?: string }).applicationId === data.id,
    );

    expect(milikLamaran).toEqual(
      expect.arrayContaining([
        { userId: p.userId, type: "lamaran.terkirim", payload: { applicationId: data.id, jobId } },
        { userId: adminId, type: "admin.lamaran_baru", payload: { applicationId: data.id, jobId } },
      ]),
    );
    // Kabar admin tidak membawa apa pun tentang disclose maupun isinya.
    expect(JSON.stringify(milikLamaran)).not.toMatch(/netra|disclos/i);
  });
});

describe("ekspor PDP — lamaran milik pelamar, termasuk salinan pengungkapannya", () => {
  it("disclose=true → salinan terdekripsi; disclose=false → null; hanya milik sendiri", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const p = await buatPelamar();
    const lain = await buatPelamar();
    const r1 = await lamar(
      p.token,
      { resumeId: p.resumeId, discloseDisability: true },
      kunciBaru(),
    );
    const { data } = (await r1.json()) as { data: { id: string } };
    await lamar(lain.token, { resumeId: lain.resumeId, discloseDisability: false }, kunciBaru());

    const berkas = (await createApplicationsExport({
      prisma: appPrisma,
      fieldKeys,
    }).kumpulkan(p.userId)) as ExportApplication[];

    expect(berkas).toHaveLength(1);
    expect(berkas[0]?.id).toBe(data.id);
    expect(berkas[0]?.disclosureSnapshot).toMatchObject({
      disabilityTypes: ["netra"],
      accommodationNeeds: { tags: ["ramah_screen_reader"], notes: null },
    });

    const milikLain = (await createApplicationsExport({
      prisma: appPrisma,
      fieldKeys,
    }).kumpulkan(lain.userId)) as ExportApplication[];
    expect(milikLain.map((a) => a.disclosureSnapshot)).toEqual([null]);
  });
});
