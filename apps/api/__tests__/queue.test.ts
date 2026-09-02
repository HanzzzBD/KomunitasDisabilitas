import { describe, it, expect, vi } from "vitest";
import {
  QUEUE_NAME,
  QUEUE_NAMES,
  dlqNameOf,
  queueConfigSchema,
  type QueueName,
} from "@nawasena/schemas";
import { EnvError } from "../src/core/config/index.js";
import {
  QUEUE_DEFAULTS,
  QUEUE_RETENTION,
  buildJobId,
  createQueueRegistry,
  jobOptionsFor,
  loadQueueConfigs,
  queueEnvVar,
  queueEnvVars,
  type QueueLike,
} from "../src/core/queue/index.js";

/** Queue palsu: registry teruji penuh tanpa Redis (pola injeksi core/audit). */
function fakeQueue(): QueueLike & { add: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  const add = vi.fn((_jobName: string, _payload: unknown) => Promise.resolve({ id: "job-1" }));
  const close = vi.fn(() => Promise.resolve());
  return { add, close } as unknown as QueueLike & {
    add: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

describe("nama queue harus valid untuk BullMQ", () => {
  // Regresi PR-015b: BullMQ melempar "Queue name cannot contain :" saat
  // Queue/Worker dibuat. Unit test PR-015a lolos karena tidak pernah membuat
  // Queue sungguhan — kesalahan baru ketahuan di integration test CI.
  // Guard ini menangkapnya tanpa perlu Redis.
  it("tidak ada nama queue yang memuat ':'", () => {
    for (const queue of QUEUE_NAMES) {
      expect(queue).not.toContain(":");
    }
  });

  it("tidak ada nama DLQ yang memuat ':'", () => {
    for (const queue of QUEUE_NAMES) {
      expect(dlqNameOf(queue)).not.toContain(":");
    }
  });
});

describe("QUEUE_DEFAULTS — tabel SDD §16", () => {
  it("mencakup seluruh queue dan semuanya lolos queueConfigSchema", () => {
    expect(Object.keys(QUEUE_DEFAULTS).sort()).toEqual([...QUEUE_NAMES].sort());
    for (const queue of QUEUE_NAMES) {
      expect(queueConfigSchema.safeParse(QUEUE_DEFAULTS[queue]).success).toBe(true);
    }
  });

  it("retensi seluruh queue = removeOnComplete 100 / removeOnFail 1000 (kebijakan umum SDD §16)", () => {
    for (const queue of QUEUE_NAMES) {
      expect(QUEUE_DEFAULTS[queue].removeOnComplete).toBe(QUEUE_RETENTION.removeOnComplete);
      expect(QUEUE_DEFAULTS[queue].removeOnFail).toBe(QUEUE_RETENTION.removeOnFail);
    }
  });

  it("nilai per queue sesuai tabel SDD §16 (attempts = retry + 1)", () => {
    // Snapshot sengaja eksplisit: perubahan angka SDD harus lewat review.
    expect({
      concurrency: QUEUE_DEFAULTS[QUEUE_NAME.AI_EXTRACT_RESUME].concurrency,
      attempts: QUEUE_DEFAULTS[QUEUE_NAME.AI_EXTRACT_RESUME].attempts,
      backoffMs: QUEUE_DEFAULTS[QUEUE_NAME.AI_EXTRACT_RESUME].backoffMs,
      timeoutMs: QUEUE_DEFAULTS[QUEUE_NAME.AI_EXTRACT_RESUME].timeoutMs,
    }).toEqual({ concurrency: 2, attempts: 3, backoffMs: 5_000, timeoutMs: 60_000 });

    expect(QUEUE_DEFAULTS[QUEUE_NAME.AI_EMBED]).toMatchObject({
      concurrency: 4,
      attempts: 4,
      backoffMs: 10_000,
      timeoutMs: 30_000,
    });

    // Puppeteer boros RAM (risiko T4 SDD §20) — concurrency wajib 1.
    expect(QUEUE_DEFAULTS[QUEUE_NAME.PDF_RENDER].concurrency).toBe(1);
    expect(QUEUE_DEFAULTS[QUEUE_NAME.NOTIFY_PUSH].concurrency).toBe(8);

    // PR-043b — jejak biaya AI: satu INSERT kecil, tetapi job yang hilang
    // berarti baris jejak biaya yang hilang, jadi retry-nya 3×.
    expect(QUEUE_DEFAULTS[QUEUE_NAME.AI_USAGE_RECORD]).toMatchObject({
      concurrency: 2,
      attempts: 4,
      backoffMs: 10_000,
      timeoutMs: 15_000,
    });

    // "manual" / "alert bila gagal" = tanpa retry otomatis.
    expect(QUEUE_DEFAULTS[QUEUE_NAME.MAINTENANCE_PDP_PURGE].attempts).toBe(1);
    expect(QUEUE_DEFAULTS[QUEUE_NAME.MAINTENANCE_BACKUP].attempts).toBe(1);
  });
});

describe("queueEnvVar — pemetaan nama variabel override", () => {
  it("mengubah ':' dan '-' jadi '_' dan camelCase jadi UPPER_SNAKE", () => {
    expect(queueEnvVar(QUEUE_NAME.AI_EXTRACT_RESUME, "backoffMs")).toBe(
      "QUEUE_AI_EXTRACT_RESUME_BACKOFF_MS",
    );
    expect(queueEnvVar(QUEUE_NAME.AI_EMBED, "concurrency")).toBe("QUEUE_AI_EMBED_CONCURRENCY");
    expect(queueEnvVar(QUEUE_NAME.MAINTENANCE_PDP_PURGE, "removeOnComplete")).toBe(
      "QUEUE_MAINTENANCE_PDP_PURGE_REMOVE_ON_COMPLETE",
    );
  });

  it("seluruh variabel yang dikenali unik (tidak ada tabrakan nama)", () => {
    const vars = queueEnvVars();
    expect(vars).toHaveLength(QUEUE_NAMES.length * 6);
    expect(new Set(vars).size).toBe(vars.length);
  });
});

describe("loadQueueConfigs — config dari env, bukan hardcode", () => {
  it("tanpa env apa pun mengembalikan default SDD §16", () => {
    expect(loadQueueConfigs({})).toEqual(QUEUE_DEFAULTS);
  });

  it("override env menimpa hanya field & queue yang disebut", () => {
    const configs = loadQueueConfigs({
      QUEUE_AI_EMBED_CONCURRENCY: "8",
      QUEUE_PDF_RENDER_TIMEOUT_MS: "120000",
    });

    expect(configs[QUEUE_NAME.AI_EMBED].concurrency).toBe(8);
    expect(configs[QUEUE_NAME.PDF_RENDER].timeoutMs).toBe(120_000);
    // field lain pada queue yang sama tetap default
    expect(configs[QUEUE_NAME.AI_EMBED].attempts).toBe(QUEUE_DEFAULTS[QUEUE_NAME.AI_EMBED].attempts);
    // queue lain tidak tersentuh
    expect(configs[QUEUE_NAME.NOTIFY_PUSH]).toEqual(QUEUE_DEFAULTS[QUEUE_NAME.NOTIFY_PUSH]);
  });

  it("variabel kosong dianggap tidak di-set (pakai default)", () => {
    expect(loadQueueConfigs({ QUEUE_AI_EMBED_CONCURRENCY: "   " })).toEqual(QUEUE_DEFAULTS);
  });

  it("override bukan angka → EnvError menyebut variabelnya", () => {
    try {
      loadQueueConfigs({ QUEUE_AI_EMBED_CONCURRENCY: "banyak" });
      expect.unreachable("seharusnya melempar EnvError");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as EnvError).issues).toContainEqual(["QUEUE_AI_EMBED_CONCURRENCY", "harus angka"]);
    }
  });

  it("override di luar rentang → EnvError berisi pesan Bahasa Indonesia", () => {
    try {
      loadQueueConfigs({ QUEUE_PDF_RENDER_CONCURRENCY: "0" });
      expect.unreachable("seharusnya melempar EnvError");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const [variable, alasan] = (error as EnvError).issues[0]!;
      expect(variable).toBe("QUEUE_PDF_RENDER_CONCURRENCY");
      expect(alasan).toBe("concurrency minimal 1");
    }
  });

  it("beberapa override rusak dilaporkan sekaligus, bukan satu per satu", () => {
    try {
      loadQueueConfigs({
        QUEUE_AI_EMBED_CONCURRENCY: "bukan-angka",
        QUEUE_NOTIFY_EMAIL_ATTEMPTS: "99",
      });
      expect.unreachable("seharusnya melempar EnvError");
    } catch (error) {
      const variabel = (error as EnvError).issues.map(([nama]) => nama);
      expect(variabel).toContain("QUEUE_AI_EMBED_CONCURRENCY");
      expect(variabel).toContain("QUEUE_NOTIFY_EMAIL_ATTEMPTS");
    }
  });
});

describe("buildJobId — id deterministik & aman untuk BullMQ", () => {
  it("input sama menghasilkan id sama (fondasi anti-duplikat)", () => {
    expect(buildJobId("extract", "sesi-123")).toBe(buildJobId("extract", "sesi-123"));
  });

  it("input berbeda menghasilkan id berbeda", () => {
    expect(buildJobId("extract", "sesi-123")).not.toBe(buildJobId("extract", "sesi-124"));
  });

  it("tidak pernah memuat ':' — BullMQ melarangnya pada custom job id", () => {
    expect(buildJobId("ai:embed", "job:1")).toBe("ai-embed-job-1");
    expect(buildJobId("ai:embed", "job:1")).not.toContain(":");
  });

  it("menerima angka dan membuang bagian kosong", () => {
    expect(buildJobId("notify", "", 42)).toBe("notify-42");
  });

  it("menolak bila seluruh bagian kosong", () => {
    expect(() => buildJobId("   ")).toThrow(/minimal satu bagian/);
  });
});

describe("jobOptionsFor — kebijakan SDD §16 melekat pada setiap job", () => {
  it("membawa attempts, backoff eksponensial, dan retensi dari config", () => {
    expect(jobOptionsFor(QUEUE_DEFAULTS[QUEUE_NAME.AI_EXTRACT_RESUME])).toEqual({
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    });
  });

  it("jobId dan delayMs hanya muncul bila diminta", () => {
    const tanpa = jobOptionsFor(QUEUE_DEFAULTS[QUEUE_NAME.AI_EMBED]);
    expect(tanpa).not.toHaveProperty("jobId");
    expect(tanpa).not.toHaveProperty("delay");

    const dengan = jobOptionsFor(QUEUE_DEFAULTS[QUEUE_NAME.AI_EMBED], {
      jobId: "embed-1",
      delayMs: 250,
    });
    expect(dengan).toMatchObject({ jobId: "embed-1", delay: 250 });
  });
});

describe("createQueueRegistry", () => {
  it("enqueue memakai kebijakan queue-nya sendiri, bukan nilai pemanggil", async () => {
    const queue = fakeQueue();
    const registry = createQueueRegistry({
      configs: QUEUE_DEFAULTS,
      factory: () => queue,
    });

    await registry.enqueue(QUEUE_NAME.NOTIFY_EMAIL, { notificationId: "n-1" }, { jobId: "notif-1" });

    expect(queue.add).toHaveBeenCalledWith(
      QUEUE_NAME.NOTIFY_EMAIL,
      { notificationId: "n-1" },
      {
        attempts: QUEUE_DEFAULTS[QUEUE_NAME.NOTIFY_EMAIL].attempts,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
        jobId: "notif-1",
      },
    );
  });

  it("mengembalikan jobId dari BullMQ", async () => {
    const registry = createQueueRegistry({ configs: QUEUE_DEFAULTS, factory: () => fakeQueue() });
    await expect(registry.enqueue(QUEUE_NAME.AI_EMBED, {})).resolves.toEqual({ jobId: "job-1" });
  });

  it("queue dibuat malas dan dipakai ulang (satu instance per nama)", () => {
    const factory = vi.fn(() => fakeQueue());
    const registry = createQueueRegistry({ configs: QUEUE_DEFAULTS, factory });

    expect(factory).not.toHaveBeenCalled(); // belum ada yang dipakai
    const a = registry.queueOf(QUEUE_NAME.AI_EMBED);
    const b = registry.queueOf(QUEUE_NAME.AI_EMBED);

    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledOnce();
  });

  it("close menutup semua queue yang sempat dibuat", async () => {
    const dibuat: ReturnType<typeof fakeQueue>[] = [];
    const registry = createQueueRegistry({
      configs: QUEUE_DEFAULTS,
      factory: () => {
        const queue = fakeQueue();
        dibuat.push(queue);
        return queue;
      },
    });

    registry.queueOf(QUEUE_NAME.AI_EMBED);
    registry.queueOf(QUEUE_NAME.PDF_RENDER);
    await registry.close();

    expect(dibuat).toHaveLength(2);
    for (const queue of dibuat) expect(queue.close).toHaveBeenCalledOnce();
  });

  it("configOf mengembalikan config efektif hasil override env", () => {
    const registry = createQueueRegistry({
      configs: loadQueueConfigs({ QUEUE_AI_EMBED_CONCURRENCY: "8" }),
      factory: () => fakeQueue(),
    });
    expect(registry.configOf(QUEUE_NAME.AI_EMBED).concurrency).toBe(8);
  });

  it("tanpa connection dan tanpa factory → error jelas saat queue dipakai", () => {
    const registry = createQueueRegistry({ configs: QUEUE_DEFAULTS });
    expect(() => registry.queueOf(QUEUE_NAME.AI_EMBED)).toThrow(/REDIS_QUEUE_URL/);
  });

  it("nama queue tak dikenal ditolak", () => {
    const registry = createQueueRegistry({ configs: QUEUE_DEFAULTS, factory: () => fakeQueue() });
    expect(() => registry.configOf("tidak:ada" as QueueName)).toThrow(/Queue tidak dikenal/);
  });
});
