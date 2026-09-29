// Integration pipeline embedding (PR-069) — PostgreSQL + Redis NYATA.
// Skip anggun bila salah satunya tidak terjangkau (pola db-seeker / queue-redis).
//
// Unit test (`matching-embedding.test.ts`) memakai repository dan antrean
// palsu, jadi ia TIDAK bisa membuktikan empat hal yang menjadi AC PR ini:
//
//   1. event nyata dari penerbit nyata → job BullMQ → vektor benar-benar
//      mendarat di kolom `vector(768)` (AC `job.published`, `profile.updated`);
//   2. `match_scores` pengguna itu benar-benar terhapus di PostgreSQL;
//   3. 50 event beruntun diringkas menjadi SATU job oleh deduplikasi BullMQ
//      sungguhan (AC batch) — fake antrean hanya menguji tiruan saya sendiri;
//   4. event yang tiba saat job SEDANG BERJALAN tetap melahirkan satu job
//      susulan (`keepLastIfActive`), sehingga suntingan terakhir tidak hilang.
//
// AI-nya palsu dengan sengaja: yang diuji adalah pipeline, bukan Gemini.
// Panggilan Gemini nyata dibuktikan manual (log PR-069).
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { QUEUE_NAME, aiEmbedJobSchema, type QueueName } from "@nawasena/schemas";
import { createPrismaClient } from "../src/core/db/index.js";
import { createEventBus } from "../src/core/events/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { AI_EMBED_DIMENSIONS } from "../src/core/ai/index.js";
import { QUEUE_DEFAULTS, createQueueRegistry, type QueueLike } from "../src/core/queue/index.js";
import { createJobsRepository, createJobsService } from "../src/modules/jobs/index.js";
import {
  createProfileRepository,
  createSkillRepository,
  createSkillsService,
} from "../src/modules/profiles/index.js";
import {
  createEmbeddingService,
  createEmbeddingsRepository,
  daftarkanPemicuEmbedding,
} from "../src/modules/matching/index.js";

const REDIS_URL = process.env.REDIS_QUEUE_URL ?? "redis://localhost:6380";
const connection: ConnectionOptions = { url: REDIS_URL };
/** Prefix Redis sendiri — tidak berbagi kunci dengan queue-redis.test.ts. */
const PREFIX = "uji-pr069";
const QUEUE: QueueName = QUEUE_NAME.AI_EMBED;
const JEDA_MS = 300;

const prisma = createPrismaClient();
const mentah = new PrismaClient();
let redis: Redis | null = null;
let siap = false;

const ids = { kurator: "", seeker: "", company: "", job: "" };
const tutup: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.ping();
    siap = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB/Redis tidak terjangkau — integration test embedding dilewati.");
    redis?.disconnect();
    redis = null;
    return;
  }
  await kosongkanRedis();

  ids.kurator = uuidV7();
  ids.seeker = uuidV7();
  ids.company = uuidV7();
  ids.job = uuidV7();
  await mentah.user.createMany({
    data: [
      { id: ids.kurator, phone: "+62869069000001", fullName: "Kurator Uji PR-069", role: "admin" },
      { id: ids.seeker, phone: "+62869069000002", fullName: "Pencari Uji PR-069" },
    ],
  });
  await mentah.seekerProfile.create({
    data: { userId: ids.seeker, headline: "Admin gudang", summary: "Teliti" },
  });
  await mentah.company.create({ data: { id: ids.company, name: "PT Uji PR-069" } });
  await mentah.job.create({
    data: {
      id: ids.job,
      companyId: ids.company,
      title: "Staf Gudang Uji PR-069",
      description: "Mencatat stok",
      employmentType: "full_time",
      workMode: "onsite",
      accommodations: ["akses_kursi_roda"],
      createdBy: ids.kurator,
    },
  });
});

async function kosongkanRedis(): Promise<void> {
  if (redis === null) return;
  const keys = await redis.keys(`${PREFIX}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

afterEach(async () => {
  await Promise.allSettled(tutup.splice(0).map((f) => f()));
  await kosongkanRedis();
});

afterAll(async () => {
  if (siap) {
    await mentah.job.deleteMany({ where: { id: ids.job } });
    await mentah.company.deleteMany({ where: { id: ids.company } });
    await mentah.user.deleteMany({ where: { id: { in: [ids.kurator, ids.seeker] } } });
  }
  redis?.disconnect();
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

/** Vektor palsu deterministik dari teks — cukup untuk membedakan dua isi. */
function vektorDari(teks: string): number[] {
  const v = Array.from(
    { length: AI_EMBED_DIMENSIONS },
    (_, i) => ((teks.charCodeAt(i % teks.length) + i) % 17) + 1,
  );
  const panjang = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / panjang);
}

/** Rakit satu "dunia": bus + penerbit nyata + antrean nyata + worker nyata. */
function rakit(opsi: { gerbang?: Promise<void> } = {}) {
  const events = createEventBus({ logger: { error: () => {} } });
  const queues = createQueueRegistry({
    configs: { ...QUEUE_DEFAULTS, [QUEUE]: { ...QUEUE_DEFAULTS[QUEUE], backoffMs: 0 } },
    factory: (name) => new Queue(name, { connection, prefix: PREFIX }) as unknown as QueueLike,
  });
  daftarkanPemicuEmbedding({ events, queues, jedaMs: JEDA_MS });

  const embedTeks: string[] = [];
  const embedAtasNama: string[] = [];
  const service = createEmbeddingService({
    repo: createEmbeddingsRepository(prisma),
    ai: {
      embed: (ctx, req) => {
        embedTeks.push(req.text);
        embedAtasNama.push(ctx.userId);
        return Promise.resolve({
          vector: vektorDari(req.text),
          dimensions: AI_EMBED_DIMENSIONS,
          provider: "palsu",
          model: "palsu",
        });
      },
    },
    bacaProfil: async (userId) => {
      const profil = await createProfileRepository(prisma).findSafeByUserId(userId);
      if (profil === null) return null;
      const keahlian = await createSkillsService(createSkillRepository(prisma), { events }).listFor(
        userId,
      );
      return { profil, keahlian, pengalaman: [], pendidikan: [] };
    },
    bacaLowongan: (jobId) =>
      createJobsService({
        jobsRepository: createJobsRepository(prisma),
        auditLog: () => {},
        events,
      }).bacaUntukEmbedding(jobId),
    logger: { error: () => {} },
  });

  let selesai = 0;
  const worker = new Worker(
    QUEUE,
    async (job) => {
      if (opsi.gerbang !== undefined) await opsi.gerbang;
      const hasil = await service.jalankan(aiEmbedJobSchema.parse(job.data));
      selesai += 1;
      return hasil;
    },
    { connection, prefix: PREFIX, concurrency: 1 },
  );
  tutup.push(
    () => worker.close(),
    () => queues.close(),
  );

  const jobsService = createJobsService({
    jobsRepository: createJobsRepository(prisma),
    auditLog: () => {},
    events,
  });
  const skills = createSkillsService(createSkillRepository(prisma), { events });

  return {
    events,
    queue: queues.queueOf(QUEUE),
    jobsService,
    skills,
    embedTeks,
    embedAtasNama,
    selesai: () => selesai,
  };
}

async function tungguSampai(
  syarat: () => boolean | Promise<boolean>,
  batasMs = 10_000,
): Promise<void> {
  const akhir = Date.now() + batasMs;
  while (Date.now() < akhir) {
    if (await syarat()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Syarat tidak terpenuhi sebelum batas waktu");
}

async function adaVektor(tabel: "jobs" | "seeker_profiles", id: string): Promise<boolean> {
  const rows =
    tabel === "jobs"
      ? await mentah.$queryRaw<
          Array<{ ada: boolean }>
        >`SELECT job_embedding IS NOT NULL AS ada FROM jobs WHERE id = ${id}::uuid`
      : await mentah.$queryRaw<
          Array<{ ada: boolean }>
        >`SELECT profile_embedding IS NOT NULL AS ada FROM seeker_profiles WHERE user_id = ${id}::uuid`;
  return rows[0]?.ada === true;
}

const aktor = () => ({ userId: ids.kurator, requestId: uuidV7() });
const seeker = () => ({ userId: ids.seeker, requestId: uuidV7() });

describe("PR-069 — event → vektor (PostgreSQL + Redis nyata)", () => {
  it("AC: job.published → job_embedding terisi, dibayar kurator pembuatnya", async (ctx) => {
    if (!siap) return ctx.skip();
    const dunia = rakit();
    expect(await adaVektor("jobs", ids.job)).toBe(false);

    await dunia.jobsService.publish(aktor(), ids.job);
    await tungguSampai(() => adaVektor("jobs", ids.job));

    expect(dunia.embedAtasNama).toEqual([ids.kurator]);
    expect(dunia.embedTeks[0]).toContain("Staf Gudang Uji PR-069");
    // Akomodasi lowongan BUKAN bahan vektor — dinilai terstruktur (PR-071).
    expect(dunia.embedTeks[0]).not.toContain("akses_kursi_roda");
  });

  it("AC: profile.updated → profile_embedding diperbarui + match_scores user itu terhapus", async (ctx) => {
    if (!siap) return ctx.skip();
    const dunia = rakit();
    await mentah.matchScore.create({
      data: { userId: ids.seeker, jobId: ids.job, score: 0.5, explanation: "lama" },
    });

    // Penerbit NYATA: menambah keahlian lewat service profiles.
    await dunia.skills.create(seeker(), { name: "Pengelolaan inventaris", level: null });
    await tungguSampai(() => adaVektor("seeker_profiles", ids.seeker));

    expect(await mentah.matchScore.count({ where: { userId: ids.seeker } })).toBe(0);
    expect(dunia.embedAtasNama).toEqual([ids.seeker]);
    expect(dunia.embedTeks[0]).toContain("Pengelolaan inventaris");

    // Vektor yang tersimpan adalah vektor dari teks itu, tidak sekadar "ada".
    const [baris] = await mentah.$queryRaw<Array<{ jarak: number }>>`
      SELECT profile_embedding <=> ${`[${vektorDari(dunia.embedTeks[0]!).join(",")}]`}::vector AS jarak
      FROM seeker_profiles WHERE user_id = ${ids.seeker}::uuid`;
    expect(baris?.jarak).toBeLessThan(1e-6);
  });

  it("AC batch: 50 event beruntun → SATU job, SATU panggilan embed", async (ctx) => {
    if (!siap) return ctx.skip();
    const dunia = rakit();

    for (let i = 0; i < 50; i += 1) {
      dunia.events.emit("profile.updated", {
        userId: ids.seeker,
        section: "skills",
        updatedAt: new Date().toISOString(),
      });
    }
    // Emit tidak menunggu handler async — tunggu sampai ke-50 enqueue mendarat.
    await tungguSampai(async () => {
      const c = await dunia.queue.getJobCounts();
      return (c.delayed ?? 0) + (c.waiting ?? 0) + (c.active ?? 0) + (c.completed ?? 0) >= 1;
    });
    await new Promise((r) => setTimeout(r, 100));
    const sebelum = await dunia.queue.getJobCounts();
    expect((sebelum.delayed ?? 0) + (sebelum.waiting ?? 0)).toBe(1);

    await tungguSampai(() => dunia.selesai() === 1);
    await new Promise((r) => setTimeout(r, JEDA_MS * 2));
    expect(dunia.embedTeks).toHaveLength(1);
  });

  it("event saat job SEDANG BERJALAN → tepat satu job susulan (suntingan terakhir tidak hilang)", async (ctx) => {
    if (!siap) return ctx.skip();
    let lepas: () => void = () => {};
    const gerbang = new Promise<void>((r) => {
      lepas = r;
    });
    const dunia = rakit({ gerbang });
    const emit = () =>
      dunia.events.emit("profile.updated", {
        userId: ids.seeker,
        section: "profile",
        updatedAt: new Date().toISOString(),
      });

    emit();
    await tungguSampai(async () => ((await dunia.queue.getJobCounts()).active ?? 0) === 1);

    // Tiga suntingan saat job pertama tertahan: diringkas jadi SATU susulan.
    emit();
    emit();
    emit();
    await new Promise((r) => setTimeout(r, 200));
    lepas();

    await tungguSampai(() => dunia.selesai() === 2);
    await new Promise((r) => setTimeout(r, JEDA_MS * 3));
    expect(dunia.selesai()).toBe(2);
  });
});
