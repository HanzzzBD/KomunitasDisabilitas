// Integration queue (PR-015b) — Redis NYATA, mengikuti pola skip-anggun test DB.
//
// Membuktikan tiga AC yang tidak bisa dibuktikan unit test:
//   - job-id sama tidak diproses dua kali
//   - job gagal-final masuk DLQ dan terlihat lewat cacah queue
//   - shutdown drain menunggu job aktif selesai (tidak terpotong)
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_NAME, dlqNameOf, type QueueName } from "@incasif/schemas";
import {
  QUEUE_DEFAULTS,
  buildJobId,
  createDlqHandler,
  createQueueRegistry,
  createRawQueuePool,
  createWorkerRuntime,
  type QueueConfigs,
  type QueueLike,
} from "../src/core/queue/index.js";

const REDIS_URL = process.env.REDIS_QUEUE_URL ?? "redis://localhost:6380";
const connection = { url: REDIS_URL };

/** Queue uji terisolasi agar tidak menyentuh antrean dev/CI yang lain. */
const QUEUE: QueueName = QUEUE_NAME.AI_EMBED;

let redisTersedia = false;
let redis: Redis | null = null;
const bersihkan: Array<() => Promise<unknown>> = [];

/** Config uji: cepat, deterministik — angka produksi tetap di QUEUE_DEFAULTS. */
function configUji(override: Partial<(typeof QUEUE_DEFAULTS)[typeof QUEUE]> = {}): QueueConfigs {
  return {
    ...QUEUE_DEFAULTS,
    [QUEUE]: {
      ...QUEUE_DEFAULTS[QUEUE],
      concurrency: 1,
      attempts: 2,
      backoffMs: 0,
      timeoutMs: 5_000,
      ...override,
    },
  };
}

const NAMA_DIPAKAI = [QUEUE, dlqNameOf(QUEUE)];

async function kosongkanRedis(): Promise<void> {
  if (redis === null) return;
  for (const nama of NAMA_DIPAKAI) {
    const keys = await redis.keys(`bull:${nama}:*`);
    if (keys.length > 0) await redis.del(...keys);
  }
}

beforeAll(async () => {
  try {
    redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.ping();
    redisTersedia = true;
    await kosongkanRedis();
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("Redis queue tidak terjangkau — integration test antrean dilewati.");
    redis?.disconnect();
    redis = null;
  }
});

afterEach(async () => {
  await Promise.allSettled(bersihkan.splice(0).map((tutup) => tutup()));
  await kosongkanRedis();
});

afterAll(async () => {
  redis?.disconnect();
});

/** Tunggu sampai kondisi terpenuhi atau waktu habis. */
async function tunggu(kondisi: () => boolean | Promise<boolean>, batasMs = 8_000): Promise<void> {
  const mulai = Date.now();
  while (Date.now() - mulai < batasMs) {
    if (await kondisi()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Batas waktu menunggu kondisi terlampaui");
}

// Guard per test (bukan describe.skipIf): status Redis baru diketahui di
// beforeAll, sedangkan skipIf dievaluasi saat koleksi test.
describe("integration antrean (Redis nyata)", () => {
  it("job dengan job-id sama TIDAK diproses dua kali", async (ctx) => {
    if (!redisTersedia) return ctx.skip();

    const registry = createQueueRegistry({ configs: configUji(), connection });
    bersihkan.push(() => registry.close());

    const diproses: string[] = [];
    const runtime = createWorkerRuntime({
      configs: configUji(),
      processors: {
        [QUEUE]: (payload) => {
          diproses.push((payload as { tandai: string }).tandai);
          return Promise.resolve();
        },
      },
      logger: { info() {}, warn() {}, error() {} } as never,
      onFailed: () => Promise.resolve(),
      connection,
    });
    bersihkan.push(() => runtime.drain());

    const jobId = buildJobId("uji-dedup", "sesi-1");
    await registry.enqueue(QUEUE, { tandai: "pertama" }, { jobId });
    await registry.enqueue(QUEUE, { tandai: "kedua" }, { jobId });
    await registry.enqueue(QUEUE, { tandai: "ketiga" }, { jobId });

    await tunggu(() => diproses.length >= 1);
    // Beri kesempatan job duplikat muncul bila anti-duplikat tidak bekerja.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(diproses).toEqual(["pertama"]);
  });

  it("job gagal-final masuk DLQ dan terlihat pada cacah queue", async (ctx) => {
    if (!redisTersedia) return ctx.skip();

    const configs = configUji({ attempts: 2 });
    const registry = createQueueRegistry({ configs, connection });
    bersihkan.push(() => registry.close());

    const dlqPool = createRawQueuePool(connection);
    bersihkan.push(() => dlqPool.close());

    const dlq = createDlqHandler({
      dlqFactory: (nama) => dlqPool.queueOf(nama),
      logger: { warn() {}, error() {} } as never,
      metrics: { increment() {} },
    });

    let percobaan = 0;
    const runtime = createWorkerRuntime({
      configs,
      processors: {
        [QUEUE]: () => {
          percobaan += 1;
          return Promise.reject(new Error("selalu gagal"));
        },
      },
      logger: { info() {}, warn() {}, error() {} } as never,
      onFailed: (queue, job, error) => dlq.onFailed(queue, job, error),
      connection,
    });
    bersihkan.push(() => runtime.drain());

    await registry.enqueue(QUEUE, { profileId: "p-1" }, { jobId: buildJobId("uji-dlq", "1") });

    const dlqQueue: QueueLike = dlqPool.queueOf(dlqNameOf(QUEUE));
    await tunggu(async () => {
      const cacah = await dlqQueue.getJobCounts();
      return (cacah.waiting ?? 0) >= 1;
    });

    // Retry berjalan sesuai attempts, DLQ hanya menerima kegagalan FINAL.
    expect(percobaan).toBe(2);
    const cacah = await dlqQueue.getJobCounts();
    expect(cacah.waiting).toBe(1);

    // Catatan DLQ tidak menyalin nilai payload.
    const dlqInspeksi = new Queue(dlqNameOf(QUEUE), { connection });
    const isi = await dlqInspeksi.getJobs(["waiting"]);
    expect(isi[0]?.data).toMatchObject({ queue: QUEUE, payloadKeys: ["profileId"] });
    expect(JSON.stringify(isi[0]?.data)).not.toContain("p-1");
    await dlqInspeksi.close();
  });

  it("drain menunggu job aktif selesai (tidak terpotong)", async (ctx) => {
    if (!redisTersedia) return ctx.skip();

    const configs = configUji({ timeoutMs: 10_000 });
    const registry = createQueueRegistry({ configs, connection });
    bersihkan.push(() => registry.close());

    let mulai = false;
    let selesai = false;
    const runtime = createWorkerRuntime({
      configs,
      processors: {
        [QUEUE]: async () => {
          mulai = true;
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          selesai = true;
        },
      },
      logger: { info() {}, warn() {}, error() {} } as never,
      onFailed: () => Promise.resolve(),
      connection,
    });

    await registry.enqueue(QUEUE, {}, { jobId: buildJobId("uji-drain", "1") });
    await tunggu(() => mulai);

    expect(selesai).toBe(false); // job masih berjalan saat drain dimulai
    await runtime.drain();
    expect(selesai).toBe(true); // drain menunggu, bukan memotong
  }, 20_000);

  it("removeOnComplete/Fail SDD §16 benar-benar terpasang di Redis", async (ctx) => {
    if (!redisTersedia) return ctx.skip();

    const registry = createQueueRegistry({ configs: configUji(), connection });
    bersihkan.push(() => registry.close());

    await registry.enqueue(QUEUE, { a: 1 }, { jobId: buildJobId("uji-opts", "1") });

    const queue = new Queue(QUEUE, { connection });
    const jobs = await queue.getJobs(["waiting"]);
    expect(jobs[0]?.opts).toMatchObject({
      attempts: 2,
      removeOnComplete: QUEUE_DEFAULTS[QUEUE].removeOnComplete,
      removeOnFail: QUEUE_DEFAULTS[QUEUE].removeOnFail,
    });
    await queue.close();
  });

  it("worker BullMQ nyata memakai concurrency dari config", async (ctx) => {
    if (!redisTersedia) return ctx.skip();

    const configs = configUji({ concurrency: 1 });
    const registry = createQueueRegistry({ configs, connection });
    bersihkan.push(() => registry.close());

    let berjalanBersamaan = 0;
    let puncak = 0;
    const runtime = createWorkerRuntime({
      configs,
      processors: {
        [QUEUE]: async () => {
          berjalanBersamaan += 1;
          puncak = Math.max(puncak, berjalanBersamaan);
          await new Promise((resolve) => setTimeout(resolve, 100));
          berjalanBersamaan -= 1;
        },
      },
      logger: { info() {}, warn() {}, error() {} } as never,
      onFailed: () => Promise.resolve(),
      connection,
    });
    bersihkan.push(() => runtime.drain());

    for (let i = 0; i < 4; i += 1) {
      await registry.enqueue(QUEUE, { i }, { jobId: buildJobId("uji-conc", i) });
    }

    await tunggu(async () => {
      const cacah = await registry.queueOf(QUEUE).getJobCounts();
      return (cacah.waiting ?? 0) === 0 && (cacah.active ?? 0) === 0;
    });

    expect(puncak).toBe(1);
  }, 20_000);
});
