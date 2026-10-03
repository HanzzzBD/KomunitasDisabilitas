// Kamus video BISINDO (PR-084) — integrasi: PostgreSQL nyata + HTTP + RS256.
//
// Siklus: admin membuat draft → publish ditolak 422 (caption/transkrip kurang)
// → PUT key media → publish 200 + audit → pencarian frasa publik (FTS)
// menemukannya, draft tidak pernah tampil. Plus: kategori tervalidasi, RBAC,
// dan CHECK DB sebagai jaring terakhir di bawah service.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { AUDIT_ACTION, type SignVideoAdmin, type SignVideoPublic } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createAuditLog, createPrismaAuditWriter } from "../src/core/audit/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { createSessionUserSource } from "../src/modules/auth/index.js";
import { AUDIT_ENTITY, createSignbridgeModule } from "../src/modules/signbridge/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const prisma = new PrismaClient();
const appPrisma = prisma as unknown as AppPrisma;
const tokens = createTokenService(SESSION_KEYS);
const PREFIX_UJI = "+62887084";
const TANDA = "UJI-PR084";
/** Kata langka supaya pencarian tidak tertukar dengan isi kamus dev. */
const KATA = "zebrakudaujian";

let tersedia = false;
let api: ApiServer | null = null;
let base = "";
let adminId = "";
let adminToken = "";
let seekerToken = "";
const userIds: string[] = [];
const videoIds: string[] = [];
/** Isi bucket palsu — `unggah()` meniru browser yang menyelesaikan PUT presigned. */
const bucket = new Map<string, { size: number; contentType: string }>();

function unggah(key: string, contentType: string, size = 100): void {
  bucket.set(key, { size, contentType });
}

async function buatUser(role: "seeker" | "admin", urutan: number): Promise<string> {
  const id = uuidV7();
  await prisma.user.create({
    data: { id, phone: `${PREFIX_UJI}${String(urutan).padStart(4, "0")}`, fullName: TANDA, role },
  });
  userIds.push(id);
  return id;
}

function panggil(
  token: string | null,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function buatDraft(phrase: string, category = "salam"): Promise<SignVideoAdmin> {
  const res = await panggil(adminToken, "POST", "/admin/sign-videos", { phrase, category });
  expect(res.status).toBe(201);
  const { data } = (await res.json()) as { data: SignVideoAdmin };
  videoIds.push(data.id);
  return data;
}

async function lengkapiDanTerbitkan(id: string): Promise<void> {
  unggah(`sign-videos/${id}/source.mp4`, "video/mp4");
  unggah(`sign-videos/${id}/caption.vtt`, "text/vtt");
  const put = await panggil(adminToken, "PUT", `/admin/sign-videos/${id}`, {
    videoKey: `sign-videos/${id}/source.mp4`,
    captionKey: `sign-videos/${id}/caption.vtt`,
    transcript: "Transkrip isyarat untuk pengujian.",
  });
  expect(put.status).toBe(200);
  expect((await panggil(adminToken, "POST", `/admin/sign-videos/${id}/publish`)).status).toBe(200);
}

async function cari(qs: string): Promise<SignVideoPublic[]> {
  const res = await panggil(null, "GET", `/sign-videos?${qs}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: SignVideoPublic[] }).data;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    tersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test kamus BISINDO dilewati.");
    return;
  }
  // Sisa run yang terputus (nomor HP unik) tidak boleh menjatuhkan run berikutnya.
  await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX_UJI } } });
  await prisma.signVideo.deleteMany({ where: { phrase: { contains: KATA } } });
  adminId = await buatUser("admin", 1);
  adminToken = await tokens.signAccessToken({ sub: adminId, role: "admin", ver: 0 });
  const seekerId = await buatUser("seeker", 2);
  seekerToken = await tokens.signAccessToken({ sub: seekerId, role: "seeker", ver: 0 });

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
      findSessionUser: createSessionUserSource(appPrisma),
    }).guardsFor,
  });
  const signbridge = createSignbridgeModule({
    prisma: appPrisma,
    routes: registry.forModule("/api/v1"),
    auditLog,
    // Storage palsu: SigV4 & PUT presigned nyata sudah diuji `storage-minio.test.ts`.
    storage: {
      presignDownload: async ({ key }) => ({
        url: `https://storage.test/${key}?sig=uji`,
        expiresAt: new Date(Date.now() + 300_000),
      }),
      presignUpload: async ({ key, contentType }) => ({
        url: `https://storage.test/${key}?put=uji`,
        method: "PUT",
        headers: { "content-type": contentType },
        expiresAt: new Date(Date.now() + 300_000),
      }),
      stat: async (key) => bucket.get(key) ?? null,
    },
  });
  api = createServer(env, logger, { routes: (app) => app.use(signbridge.router) });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  base = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await api?.stop();
  if (tersedia) {
    await prisma.signVideo.deleteMany({ where: { id: { in: videoIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

describe("siklus draft → publish", () => {
  it("publish tanpa caption/transkrip 422; lengkap → 200 + audit publish", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const draft = await buatDraft(`Selamat pagi ${KATA}`);
    expect(draft.status).toBe("draft");
    expect(draft.createdBy).toBe(adminId);

    // Video saja belum cukup — server yang menolak, bukan formulir.
    unggah(`sign-videos/${draft.id}/source.mp4`, "video/mp4");
    await panggil(adminToken, "PUT", `/admin/sign-videos/${draft.id}`, {
      videoKey: `sign-videos/${draft.id}/source.mp4`,
    });
    const tolak = await panggil(adminToken, "POST", `/admin/sign-videos/${draft.id}/publish`);
    expect(tolak.status).toBe(422);
    const galat = (await tolak.json()) as { code: string; hint: string };
    expect(galat.code).toBe("VIDEO_ISYARAT_BELUM_LENGKAP");
    expect(galat.hint).toBe("Lengkapi dulu: caption (.vtt), transkrip");

    await lengkapiDanTerbitkan(draft.id);
    const ulang = await panggil(adminToken, "POST", `/admin/sign-videos/${draft.id}/publish`);
    expect(ulang.status).toBe(409);

    await vi.waitFor(async () => {
      const audit = await prisma.auditLog.findMany({
        where: { entityId: draft.id, action: AUDIT_ACTION.ADMIN_RESOURCE_CHANGED },
      });
      expect(audit.map((a) => (a.meta as { operation: string }).operation).sort()).toEqual([
        "create",
        "publish",
        "update",
        "update",
      ]);
      expect(audit.every((a) => a.entity === AUDIT_ENTITY && a.actorId === adminId)).toBe(true);
    });
  });

  it("key milik video lain ditolak 422", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const a = await buatDraft(`Halo ${KATA}`);
    const b = await buatDraft(`Sampai jumpa ${KATA}`);
    const res = await panggil(adminToken, "PUT", `/admin/sign-videos/${a.id}`, {
      videoKey: `sign-videos/${b.id}/source.mp4`,
    });
    expect(res.status).toBe(422);
  });
});

describe("presign → unggah → simpan key (PR-085)", () => {
  it("key dari presign baru bisa disimpan setelah objeknya ada", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const draft = await buatDraft(`Unggah ${KATA}`);
    const res = await panggil(adminToken, "POST", "/admin/sign-videos/presign", {
      videoId: draft.id,
      kind: "caption",
      contentType: "text/vtt",
      size: 64,
    });
    expect(res.status).toBe(200);
    const { data: izin } = (await res.json()) as { data: { key: string; headers: object } };
    expect(izin.key.startsWith(`sign-videos/${draft.id}/caption-`)).toBe(true);
    expect(izin.headers).toEqual({ "content-type": "text/vtt" });

    // Simpan SEBELUM unggahan selesai → ditolak.
    const dini = await panggil(adminToken, "PUT", `/admin/sign-videos/${draft.id}`, {
      captionKey: izin.key,
    });
    expect(dini.status).toBe(422);
    expect(((await dini.json()) as { code: string }).code).toBe("BERKAS_VIDEO_ISYARAT_TIDAK_ADA");

    unggah(izin.key, "text/vtt", 64);
    const sah = await panggil(adminToken, "PUT", `/admin/sign-videos/${draft.id}`, {
      captionKey: izin.key,
    });
    expect(sah.status).toBe(200);
  });

  it("tipe & ukuran disaring server; pencari kerja 403", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const draft = await buatDraft(`Saring ${KATA}`);
    const dasar = { videoId: draft.id, kind: "video", contentType: "video/mp4", size: 10 };
    const besar = await panggil(adminToken, "POST", "/admin/sign-videos/presign", {
      ...dasar,
      size: 50 * 1024 * 1024 + 1,
    });
    expect(besar.status).toBe(400);
    const tipe = await panggil(adminToken, "POST", "/admin/sign-videos/presign", {
      ...dasar,
      contentType: "video/quicktime",
    });
    expect(tipe.status).toBe(400);
    expect((await panggil(seekerToken, "POST", "/admin/sign-videos/presign", dasar)).status).toBe(
      403,
    );
  });
});

describe("unpublish (PR-085)", () => {
  it("entri ditarik hilang dari publik; tarik dua kali 409", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const entri = await buatDraft(`Tarik ${KATA}`, "umum");
    await lengkapiDanTerbitkan(entri.id);
    expect((await cari(`category=umum&query=${KATA}`)).map((v) => v.id)).toContain(entri.id);

    const tarik = await panggil(adminToken, "POST", `/admin/sign-videos/${entri.id}/unpublish`);
    expect(tarik.status).toBe(200);
    expect(((await tarik.json()) as { data: SignVideoAdmin }).data.status).toBe("draft");
    expect((await cari(`category=umum&query=${KATA}`)).map((v) => v.id)).not.toContain(entri.id);

    const ulang = await panggil(adminToken, "POST", `/admin/sign-videos/${entri.id}/unpublish`);
    expect(ulang.status).toBe(409);
  });
});

describe("pencarian publik", () => {
  it("frasa ditemukan lewat FTS; hanya published; filter kategori", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const terbit = await buatDraft(`Wawancara kerja ${KATA}`, "wawancara");
    await lengkapiDanTerbitkan(terbit.id);
    const draft = await buatDraft(`Wawancara kerja rahasia ${KATA}`, "wawancara");

    // FTS bahasa Indonesia: kata utuh, beda huruf besar & urutan kata.
    const hasil = await cari(`query=${encodeURIComponent(`${KATA} WAWANCARA`)}`);
    const ids = hasil.map((v) => v.id);
    expect(ids).toContain(terbit.id);
    expect(ids).not.toContain(draft.id);

    const entri = hasil.find((v) => v.id === terbit.id);
    expect(entri?.videoUrl).toBe(
      `https://storage.test/sign-videos/${terbit.id}/source.mp4?sig=uji`,
    );
    expect(entri?.captionUrl).toContain("caption.vtt");
    expect(entri?.transcript).toBe("Transkrip isyarat untuk pengujian.");
    expect(entri).not.toHaveProperty("videoKey");

    // Ketikan sebagian (belum kata utuh) tetap menemukan.
    expect((await cari(`query=${KATA.slice(0, 8)}`)).map((v) => v.id)).toContain(terbit.id);
    // Wildcard ILIKE di kata kunci adalah huruf biasa.
    expect((await cari("query=%25")).map((v) => v.id)).not.toContain(terbit.id);

    expect((await cari(`category=salam&query=${KATA}`)).map((v) => v.id)).not.toContain(terbit.id);
    expect((await cari(`category=wawancara&query=${KATA}`)).map((v) => v.id)).toContain(terbit.id);
  });

  it("kategori di luar daftar → 400", async (ctx) => {
    if (!tersedia) return ctx.skip();
    expect((await panggil(null, "GET", "/sign-videos?category=olahraga")).status).toBe(400);
    const res = await panggil(adminToken, "POST", "/admin/sign-videos", {
      phrase: "Halo",
      category: "olahraga",
    });
    expect(res.status).toBe(400);
  });
});

describe("RBAC & jaring DB", () => {
  it("mutasi hanya admin: tanpa sesi 401, pencari kerja 403", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const body = { phrase: "Halo", category: "salam" };
    expect((await panggil(null, "POST", "/admin/sign-videos", body)).status).toBe(401);
    expect((await panggil(seekerToken, "POST", "/admin/sign-videos", body)).status).toBe(403);
    expect((await panggil(seekerToken, "GET", "/admin/sign-videos")).status).toBe(403);
  });

  it("CHECK DB menolak baris published tanpa caption, sekalipun lewat jalur lain", async (ctx) => {
    if (!tersedia) return ctx.skip();
    const id = uuidV7();
    videoIds.push(id);
    await expect(
      prisma.signVideo.create({
        data: {
          id,
          phrase: TANDA,
          status: "published",
          videoKey: `sign-videos/${id}/source.mp4`,
          transcript: "ada",
        },
      }),
    ).rejects.toThrow(/sign_videos_terbit_lengkap/);
  });
});
