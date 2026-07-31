import { describe, it, expect, vi } from "vitest";
import { QUEUE_NAME, dlqNameOf } from "@incasif/schemas";
import {
  DLQ_METRIC,
  JobTimeoutError,
  QUEUE_DEFAULTS,
  createDlqHandler,
  createWorkerRuntime,
  isFinalFailure,
  payloadKeysOf,
  withTimeout,
  type FailedJobInfo,
  type QueueLike,
  type WorkerFactoryArgs,
  type WorkerLike,
} from "../src/core/queue/index.js";

function fakeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

function fakeDlqQueue(): QueueLike & { add: ReturnType<typeof vi.fn> } {
  return {
    add: vi.fn(() => Promise.resolve({ id: "dlq-1" })),
    getJobCounts: vi.fn(() => Promise.resolve({})),
    close: vi.fn(() => Promise.resolve()),
  } as unknown as QueueLike & { add: ReturnType<typeof vi.fn> };
}

describe("withTimeout — penegakan batas waktu SDD §16", () => {
  it("meneruskan hasil bila selesai sebelum batas", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1_000, QUEUE_NAME.AI_EMBED)).resolves.toBe("ok");
  });

  it("processor menggantung → JobTimeoutError (bukan menggantung selamanya)", async () => {
    const menggantung = new Promise<never>(() => {
      /* tidak pernah selesai */
    });
    await expect(withTimeout(menggantung, 10, QUEUE_NAME.PDF_RENDER)).rejects.toBeInstanceOf(
      JobTimeoutError,
    );
  });

  it("error asli processor tidak tertukar dengan timeout", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("gagal asli")), 1_000, QUEUE_NAME.AI_EMBED),
    ).rejects.toThrow("gagal asli");
  });
});

describe("isFinalFailure & payloadKeysOf", () => {
  it("job yang masih punya sisa retry bukan gagal-final", () => {
    expect(isFinalFailure({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(false);
    expect(isFinalFailure({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(true);
  });

  it("tanpa opts.attempts dianggap sekali percobaan", () => {
    expect(isFinalFailure({ attemptsMade: 1 })).toBe(true);
  });

  it("hanya mengambil NAMA key payload, tidak pernah nilainya", () => {
    expect(payloadKeysOf({ userId: "u-1", phone: "nomor-rahasia" })).toEqual(["phone", "userId"]);
    expect(payloadKeysOf("teks")).toEqual([]);
    expect(payloadKeysOf(null)).toEqual([]);
    expect(payloadKeysOf([1, 2])).toEqual([]);
  });
});

describe("createDlqHandler", () => {
  const jobGagalFinal: FailedJobInfo = {
    id: "job-9",
    name: "ai:embed",
    attemptsMade: 4,
    opts: { attempts: 4 },
    data: { profileId: "p-1", phone: "nomor-rahasia" },
  };

  it("job yang masih akan di-retry tidak masuk DLQ", async () => {
    const dlqQueue = fakeDlqQueue();
    const logger = fakeLogger();
    const increment = vi.fn();
    const handler = createDlqHandler({ dlqFactory: () => dlqQueue, logger, metrics: { increment } });

    await handler.onFailed(QUEUE_NAME.AI_EMBED, { attemptsMade: 1, opts: { attempts: 4 } }, new Error("x"));

    expect(dlqQueue.add).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it("gagal-final ditulis ke <queue>:dlq TANPA nilai payload", async () => {
    const dlqQueue = fakeDlqQueue();
    const logger = fakeLogger();
    const increment = vi.fn();
    const handler = createDlqHandler({
      dlqFactory: () => dlqQueue,
      logger,
      metrics: { increment },
      now: () => new Date("2026-07-27T10:00:00.000Z"),
    });

    await handler.onFailed(QUEUE_NAME.AI_EMBED, jobGagalFinal, new Error("provider mati"));

    expect(dlqQueue.add).toHaveBeenCalledOnce();
    const [namaJob, record] = dlqQueue.add.mock.calls[0]!;
    expect(namaJob).toBe(dlqNameOf(QUEUE_NAME.AI_EMBED));
    expect(record).toEqual({
      queue: QUEUE_NAME.AI_EMBED,
      jobId: "job-9",
      jobName: "ai:embed",
      attemptsMade: 4,
      failedReason: "provider mati",
      payloadKeys: ["phone", "profileId"],
      failedAt: "2026-07-27T10:00:00.000Z",
    });
    // Nilai payload tidak boleh bocor ke DLQ maupun log.
    expect(JSON.stringify(record)).not.toContain("nomor-rahasia");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("nomor-rahasia");
    expect(increment).toHaveBeenCalledWith(DLQ_METRIC.JOB_DEAD_LETTERED);
  });

  it("alasan gagal yang panjang dipotong", async () => {
    const dlqQueue = fakeDlqQueue();
    const handler = createDlqHandler({
      dlqFactory: () => dlqQueue,
      logger: fakeLogger(),
      metrics: { increment: vi.fn() },
    });

    await handler.onFailed(QUEUE_NAME.AI_EMBED, jobGagalFinal, new Error("x".repeat(2_000)));

    const record = dlqQueue.add.mock.calls[0]![1] as { failedReason: string };
    expect(record.failedReason.length).toBeLessThanOrEqual(501);
    expect(record.failedReason.endsWith("…")).toBe(true);
  });

  it("kegagalan menulis DLQ tetap ter-log + metrik (tidak senyap)", async () => {
    const logger = fakeLogger();
    const increment = vi.fn();
    const handler = createDlqHandler({
      dlqFactory: () =>
        ({
          add: () => Promise.reject(new Error("redis mati")),
          getJobCounts: () => Promise.resolve({}),
          close: () => Promise.resolve(),
        }) as unknown as QueueLike,
      logger,
      metrics: { increment },
    });

    await handler.onFailed(QUEUE_NAME.AI_EMBED, jobGagalFinal, new Error("boom"));

    expect(increment).toHaveBeenCalledWith(DLQ_METRIC.DLQ_WRITE_FAILED);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ metric: DLQ_METRIC.DLQ_WRITE_FAILED }),
      "Gagal menulis catatan DLQ",
    );
  });
});

describe("createWorkerRuntime", () => {
  function fakeWorker(): WorkerLike & { close: ReturnType<typeof vi.fn> } {
    return { close: vi.fn(() => Promise.resolve()) } as unknown as WorkerLike & {
      close: ReturnType<typeof vi.fn>;
    };
  }

  it("hanya membuat worker untuk queue yang punya processor", () => {
    const dibuat: string[] = [];
    const runtime = createWorkerRuntime({
      configs: QUEUE_DEFAULTS,
      processors: { [QUEUE_NAME.AI_EMBED]: () => Promise.resolve() },
      logger: fakeLogger() as never,
      onFailed: () => Promise.resolve(),
      factory: (args) => {
        dibuat.push(args.name);
        return fakeWorker();
      },
    });

    expect(dibuat).toEqual([QUEUE_NAME.AI_EMBED]);
    expect(runtime.running()).toEqual([QUEUE_NAME.AI_EMBED]);
  });

  it("concurrency worker diambil dari config, bukan dari processor", () => {
    let terlihat: WorkerFactoryArgs | undefined;
    createWorkerRuntime({
      configs: QUEUE_DEFAULTS,
      processors: { [QUEUE_NAME.NOTIFY_PUSH]: () => Promise.resolve() },
      logger: fakeLogger() as never,
      onFailed: () => Promise.resolve(),
      factory: (args) => {
        terlihat = args;
        return fakeWorker();
      },
    });

    expect(terlihat?.config.concurrency).toBe(QUEUE_DEFAULTS[QUEUE_NAME.NOTIFY_PUSH].concurrency);
  });

  it("processor menerima payload + konteks, dan dibungkus timeout queue-nya", async () => {
    const processor = vi.fn(() => Promise.resolve("selesai"));
    let args: WorkerFactoryArgs | undefined;
    createWorkerRuntime({
      configs: QUEUE_DEFAULTS,
      processors: { [QUEUE_NAME.AI_EMBED]: processor },
      logger: fakeLogger() as never,
      onFailed: () => Promise.resolve(),
      factory: (a) => {
        args = a;
        return fakeWorker();
      },
    });

    await expect(
      args?.run({ id: "j-1", attemptsMade: 2, data: { profileId: "p-1" } }),
    ).resolves.toBe("selesai");
    expect(processor).toHaveBeenCalledWith(
      { profileId: "p-1" },
      { queue: QUEUE_NAME.AI_EMBED, jobId: "j-1", attemptsMade: 2 },
    );
  });

  it("processor yang menggantung melewati timeout → kegagalan biasa (tunduk retry/DLQ)", async () => {
    let args: WorkerFactoryArgs | undefined;
    createWorkerRuntime({
      // timeout dipendekkan lewat config, bukan diakali di kode.
      configs: {
        ...QUEUE_DEFAULTS,
        [QUEUE_NAME.AI_EMBED]: { ...QUEUE_DEFAULTS[QUEUE_NAME.AI_EMBED], timeoutMs: 1_000 },
      },
      processors: {
        [QUEUE_NAME.AI_EMBED]: () =>
          new Promise(() => {
            /* menggantung */
          }),
      },
      logger: fakeLogger() as never,
      onFailed: () => Promise.resolve(),
      factory: (a) => {
        args = a;
        return fakeWorker();
      },
    });

    vi.useFakeTimers();
    const berjalan = args?.run({ id: "j-1", data: {} });
    const harapan = expect(berjalan).rejects.toBeInstanceOf(JobTimeoutError);
    await vi.advanceTimersByTimeAsync(1_100);
    await harapan;
    vi.useRealTimers();
  });

  it("kegagalan penanganan DLQ tidak menjatuhkan worker", async () => {
    const logger = fakeLogger();
    let args: WorkerFactoryArgs | undefined;
    createWorkerRuntime({
      configs: QUEUE_DEFAULTS,
      processors: { [QUEUE_NAME.AI_EMBED]: () => Promise.resolve() },
      logger: logger as never,
      onFailed: () => Promise.reject(new Error("dlq mati")),
      factory: (a) => {
        args = a;
        return fakeWorker();
      },
    });

    expect(() => args?.onFailed({ id: "j-1" }, new Error("boom"))).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ queue: QUEUE_NAME.AI_EMBED }),
      "Penanganan kegagalan job ikut gagal",
    );
  });

  it("drain menutup seluruh worker secara graceful (close tanpa force)", async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const runtime = createWorkerRuntime({
      configs: QUEUE_DEFAULTS,
      processors: {
        [QUEUE_NAME.AI_EMBED]: () => Promise.resolve(),
        [QUEUE_NAME.PDF_RENDER]: () => Promise.resolve(),
      },
      logger: fakeLogger() as never,
      onFailed: () => Promise.resolve(),
      factory: () => {
        const worker = fakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    await runtime.drain();

    expect(workers).toHaveLength(2);
    for (const worker of workers) {
      expect(worker.close).toHaveBeenCalledOnce();
      // close(true) = potong paksa; harus TIDAK dipakai.
      expect(worker.close).toHaveBeenCalledWith();
    }
    expect(runtime.running()).toEqual([]);
  });

  it("tanpa processor sama sekali: worker menganggur dengan peringatan, bukan crash", () => {
    const logger = fakeLogger();
    const runtime = createWorkerRuntime({
      configs: QUEUE_DEFAULTS,
      processors: {},
      logger: logger as never,
      onFailed: () => Promise.resolve(),
      factory: () => fakeWorker(),
    });

    expect(runtime.running()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Tidak ada processor"));
  });
});
