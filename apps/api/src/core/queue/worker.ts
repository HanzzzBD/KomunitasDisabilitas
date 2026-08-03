// core/queue/worker — runtime konsumen BullMQ (SDD §16, ADR-004).
//
// Satu Worker per queue yang punya processor terdaftar. Concurrency, jumlah
// percobaan, dan timeout diambil dari konfigurasi queue (PR-015a) — processor
// fitur tidak pernah menentukan angka itu sendiri.
//
// Processor fitur (ekstraksi CV, embedding, render PDF, notifikasi) didaftarkan
// oleh PR fitur masing-masing; di Phase 1 registry-nya sengaja kosong.
import { Worker, type ConnectionOptions } from "bullmq";
import type { QueueConfig, QueueName } from "@nawasena/schemas";
import type { Logger } from "../logger/index.js";
import type { QueueConfigs } from "./definitions.js";
import type { FailedJobInfo } from "./dlq.js";

/** Konteks minimal yang diterima processor — tanpa objek Job BullMQ mentah. */
export interface JobContext {
  queue: QueueName;
  jobId: string | null;
  attemptsMade: number;
}

export type JobProcessor = (payload: unknown, context: JobContext) => Promise<unknown>;

/** Peta processor per queue. Queue tanpa processor tidak dijalankan worker-nya. */
export type ProcessorMap = Partial<Record<QueueName, JobProcessor>>;

/** Permukaan Worker yang dipakai runtime — sempit agar bisa dipalsukan di test. */
export interface WorkerLike {
  close(force?: boolean): Promise<void>;
}

export interface WorkerFactoryArgs {
  name: QueueName;
  config: QueueConfig;
  /** Jalankan satu job (sudah dibungkus timeout). */
  run: (job: FailedJobInfo) => Promise<unknown>;
  /** Dipanggil BullMQ saat job gagal (termasuk yang masih akan di-retry). */
  onFailed: (job: FailedJobInfo | undefined, error: unknown) => void;
}

export type WorkerFactory = (args: WorkerFactoryArgs) => WorkerLike;

/** Job melewati batas waktu queue-nya (SDD §16 kolom Timeout). */
export class JobTimeoutError extends Error {
  constructor(queue: QueueName, timeoutMs: number) {
    super(`Job pada antrean ${queue} melewati batas waktu ${timeoutMs} ms`);
    this.name = "JobTimeoutError";
  }
}

/**
 * Batasi durasi sebuah job. BullMQ v5 tidak lagi punya opsi `timeout` di level
 * job, jadi penegakannya ada di sisi worker: processor yang menggantung
 * dijadikan kegagalan biasa sehingga tunduk pada retry/DLQ yang normal.
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  queue: QueueName,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new JobTimeoutError(queue, timeoutMs)), timeoutMs);
        timer.unref?.(); // timer tidak boleh menahan proses tetap hidup
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface WorkerRuntimeOptions {
  configs: QueueConfigs;
  processors: ProcessorMap;
  logger: Logger;
  /** Dipanggil pada setiap event `failed` — biasanya DlqHandler.onFailed. */
  onFailed: (queue: QueueName, job: FailedJobInfo | undefined, error: unknown) => Promise<void>;
  connection?: ConnectionOptions;
  factory?: WorkerFactory;
}

export interface WorkerRuntime {
  /** Nama queue yang benar-benar punya worker berjalan. */
  running(): QueueName[];
  /**
   * Berhenti dengan rapi: berhenti mengambil job baru dan TUNGGU job aktif
   * selesai (drain). BullMQ `close()` tanpa argumen bersifat graceful —
   * `close(true)` yang memotong paksa, dan itu sengaja tidak dipakai.
   */
  drain(): Promise<void>;
}

function defaultFactory(connection: ConnectionOptions | undefined): WorkerFactory {
  return ({ name, config, run, onFailed }) => {
    if (connection === undefined) {
      throw new Error(
        "createWorkerRuntime membutuhkan `connection` (REDIS_QUEUE_URL) atau `factory` pengganti",
      );
    }
    const worker = new Worker(name, async (job) => run(job as unknown as FailedJobInfo), {
      connection,
      concurrency: config.concurrency,
    });
    worker.on("failed", (job, error) => {
      onFailed(job as unknown as FailedJobInfo | undefined, error);
    });
    return worker as unknown as WorkerLike;
  };
}

export function createWorkerRuntime(options: WorkerRuntimeOptions): WorkerRuntime {
  const factory = options.factory ?? defaultFactory(options.connection);
  const workers = new Map<QueueName, WorkerLike>();

  for (const [queue, processor] of Object.entries(options.processors) as Array<
    [QueueName, JobProcessor | undefined]
  >) {
    if (processor === undefined) continue;

    const config = options.configs[queue];
    if (config === undefined) throw new Error(`Queue tidak dikenal: ${queue}`);

    const worker = factory({
      name: queue,
      config,
      run: (job) =>
        withTimeout(
          processor(job.data, {
            queue,
            jobId: job.id ?? null,
            attemptsMade: job.attemptsMade ?? 0,
          }),
          config.timeoutMs,
          queue,
        ),
      onFailed: (job, error) => {
        // Kegagalan audit/DLQ tidak boleh menjatuhkan worker.
        void options.onFailed(queue, job, error).catch((dlqError: unknown) => {
          options.logger.error(
            { queue, err: dlqError instanceof Error ? dlqError.message : String(dlqError) },
            "Penanganan kegagalan job ikut gagal",
          );
        });
      },
    });

    workers.set(queue, worker);
    options.logger.info(
      { queue, concurrency: config.concurrency, timeoutMs: config.timeoutMs },
      "Worker antrean berjalan",
    );
  }

  if (workers.size === 0) {
    options.logger.warn(
      "Tidak ada processor terdaftar — worker menganggur (normal di Phase 1, processor menyusul per PR fitur)",
    );
  }

  return {
    running() {
      return [...workers.keys()];
    },

    async drain() {
      options.logger.info(
        { queues: [...workers.keys()] },
        "Menutup worker (menunggu job aktif selesai)…",
      );
      await Promise.all([...workers.values()].map((worker) => worker.close()));
      workers.clear();
      options.logger.info("Seluruh worker tertutup bersih");
    },
  };
}
