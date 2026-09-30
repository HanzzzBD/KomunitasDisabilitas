// Integration feed matching (PR-073) — PostgreSQL + pgvector NYATA, lewat HTTP.
// Skip anggun bila DB tidak terjangkau.
//
// Rantai yang dirakit `createMatchingFeedModule` apa adanya: kandidat pgvector
// (PR-070) → hard filter akomodasi dari kolom terenkripsi lewat jalur ber-audit
// (PR-071) → cache `match_scores` (PR-072) → kartu lowongan modul jobs → HTTP.
// Ditambah AC "p95 endpoint < 800 ms (cache hangat)".
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { matchesResponseSchema, type MatchesResponse } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createAiQuota } from "../src/core/ai/index.js";
import { createFieldCrypto, parseFieldKeys } from "../src/core/crypto/index.js";
import {
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import {
  createProfileRepository,
  createProfilesService,
  createSensitiveAccess,
} from "../src/modules/profiles/index.js";
import { createJobsRepository, createJobsService } from "../src/modules/jobs/index.js";
import { BOBOT_SKOR_SDD, createMatchingFeedModule } from "../src/modules/matching/index.js";
import { busUji } from "./helpers/events.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { redisKuotaPalsu } from "./helpers/redis-kuota.js";

const prisma = new PrismaClient();
const app = prisma as unknown as AppPrisma;
let dbTersedia = false;
let api: ApiServer | null = null;
let base = "";

const DIM = 768;
const vektor = (geser: number) => {
  const v = Array.from({ length: DIM }, (_, i) => Math.sin(i + geser));
  const p = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return `[${v.map((x) => x / p).join(",")}]`;
};

const tokens = createTokenService(SESSION_KEYS);
const user = uuidV7();
const perusahaan = uuidV7();
const jobs = { lengkap: uuidV7(), tanpaJbi: uuidV7(), ditutup: uuidV7() };
const crypto = createFieldCrypto(
  parseFieldKeys({ FIELD_KEY_V1: Buffer.alloc(32, 7).toString("base64") }),
);
const auditLog = () => undefined;
const profileRepository = createProfileRepository(app);

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test feed dilewati.");
    return;
  }
  await prisma.user.create({
    data: { id: user, phone: "+628690730000001", fullName: "Uji PR-073", role: "seeker" },
  });
  // Profil + kebutuhan akomodasi TERENKRIPSI lewat service asli (consent diberikan).
  const profiles = createProfilesService({ profileRepository, crypto, auditLog, events: busUji() });
  await profiles.updateMe(
    { userId: user, requestId: "req-pr073" },
    {
      headline: "Admin data",
      city: "Bandung",
      province: "Jawa Barat",
      openToRemote: true,
      consentSensitive: true,
      disabilityTypes: ["tuli"],
      accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: "RAHASIA-PR073" },
    },
  );
  await prisma.$executeRaw`UPDATE seeker_profiles SET profile_embedding = ${vektor(0)}::vector WHERE user_id = ${user}::uuid`;

  await prisma.company.create({ data: { id: perusahaan, name: "PT Uji Feed" } });
  const buat = async (
    id: string,
    akomodasi: string[],
    status: "published" | "closed",
    geser: number,
  ) => {
    await prisma.job.create({
      data: {
        id,
        companyId: perusahaan,
        title: `Operator Excel ${id.slice(-4)}`,
        description: "Mengolah data dengan Excel.",
        employmentType: "full_time",
        workMode: "remote",
        accommodations: akomodasi,
        welcomedDisabilityTypes: [],
        status,
        publishedAt: new Date(),
      },
    });
    await prisma.$executeRaw`UPDATE jobs SET job_embedding = ${vektor(geser)}::vector WHERE id = ${id}::uuid`;
  };
  await buat(jobs.lengkap, ["juru_bahasa_isyarat", "jam_kerja_fleksibel"], "published", 0.01);
  await buat(jobs.tanpaJbi, ["jam_kerja_fleksibel"], "published", 0.02);
  await buat(jobs.ditutup, ["juru_bahasa_isyarat"], "closed", 0.03);

  const env = loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
  const logger = createLogger(env, { destination: new Writable({ write: (_c, _e, cb) => cb() }) });
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) =>
      Promise.resolve(id === user ? { id, role: "seeker" as const, tokenVersion: 0 } : null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const jobsService = createJobsService({
    jobsRepository: createJobsRepository(app),
    auditLog,
    events: busUji(),
  });
  const penanda = new Map<string, string>();
  const matching = createMatchingFeedModule({
    prisma: app,
    routes: registry.forModule("/api/v1"),
    queues: { enqueue: () => Promise.resolve() } as never,
    quota: createAiQuota({
      redis: redisKuotaPalsu(),
      config: {
        perUserPerDay: {
          cv_chat: 1,
          cv_finalize: 1,
          cv_check: 1,
          simplify_text: 1,
          interview_sim: 1,
          rerank: 3,
          embed: 1,
        },
        globalPerDay: 100,
      },
      logger,
    }),
    redis: {
      set: (k: string, v: string) => Promise.resolve(void penanda.set(k, v)),
      get: (k: string) => Promise.resolve(penanda.get(k) ?? null),
    },
    logger,
    sensitiveAccess: createSensitiveAccess({ profileRepository, crypto, auditLog }),
    bacaProfil: async (userId) => {
      const p = await profileRepository.findSafeByUserId(userId);
      return p === null
        ? null
        : { city: p.city, province: p.province, openToRemote: p.openToRemote };
    },
    bacaKeahlian: () => Promise.resolve([{ name: "Excel" }]),
    bacaLowongan: (ids) => jobsService.bacaUntukFeed(ids),
    config: { efSearch: 100, bobot: BOBOT_SKOR_SDD, paruhKebaruanHari: 14, rerankAktif: true },
  });
  api = createServer(env, logger, { routes: (a) => a.use(matching.router) });
  const { port } = await api.start();
  base = `http://127.0.0.1:${String(port)}/api/v1`;
});

afterAll(async () => {
  await api?.stop();
  if (dbTersedia) {
    await prisma.matchScore.deleteMany({ where: { userId: user } });
    await prisma.job.deleteMany({ where: { companyId: perusahaan } });
    await prisma.company.deleteMany({ where: { id: perusahaan } });
    await prisma.user.deleteMany({ where: { id: user } });
  }
  await prisma.$disconnect();
});

async function ambil(): Promise<MatchesResponse> {
  const token = await tokens.signAccessToken({ sub: user, role: "seeker", ver: 0 });
  const res = await fetch(`${base}/me/matches?limit=50`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as MatchesResponse;
}

describe("feed ujung ke ujung — PostgreSQL nyata", () => {
  it("hard filter akomodasi (kolom terenkripsi) + lowongan tutup tersaring; kontrak sah", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const r = await ambil();
    expect(matchesResponseSchema.safeParse(r).success).toBe(true);
    const ids = r.data.map((d) => d.job.id);
    // Hanya lowongan uji milik test ini yang diperiksa — DB dev bisa berisi seed lain.
    expect(ids).toContain(jobs.lengkap);
    expect(ids).not.toContain(jobs.tanpaJbi); // tidak menyediakan JBI → hard filter
    expect(ids).not.toContain(jobs.ditutup); // bukan published
    const item = r.data.find((d) => d.job.id === jobs.lengkap);
    expect(item).toMatchObject({
      explanationSource: "template",
      job: {
        companyName: "PT Uji Feed",
        accommodations: ["juru_bahasa_isyarat", "jam_kerja_fleksibel"],
      },
    });
    expect(item?.explanation).toBe("Cocok: bisa kerja dari rumah (remote), sesuai keahlian Excel.");
    expect(r.meta).toMatchObject({ aiMenyusun: true, degraded: false, sisaRefresh: 2 });
    expect(await prisma.matchScore.count({ where: { userId: user } })).toBe(r.data.length);
  });

  it("AC: p95 < 800 ms dengan cache hangat", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await ambil(); // pastikan hangat
    const durasi: number[] = [];
    for (let i = 0; i < 30; i++) {
      const mulai = performance.now();
      await ambil();
      durasi.push(performance.now() - mulai);
    }
    durasi.sort((a, b) => a - b);
    const p95 = durasi[Math.ceil(durasi.length * 0.95) - 1] ?? Infinity;
    // eslint-disable-next-line no-console -- angka bukti AC dicatat di log PR
    console.info(`p95 GET /me/matches (cache hangat): ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThan(800);
  });
});
