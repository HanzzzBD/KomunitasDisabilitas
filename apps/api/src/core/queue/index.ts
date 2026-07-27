// core/queue — registry BullMQ + helper enqueue (SDD §16, ADR-004).
//
// Satu-satunya jalur produser job di seluruh aplikasi. Modul TIDAK boleh
// membuat `new Queue(...)` sendiri: registry-lah yang menjamin setiap job
// membawa kebijakan retry/backoff/retensi sesuai konfigurasi queue-nya.
//
// Konsumen (Worker + processor + DLQ) menyusul di PR-015b; file ini sengaja
// hanya sisi produser agar PR tetap kecil dan teruji.
import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import type { QueueConfig, QueueName } from "@incasif/schemas";
import { QUEUE_NAMES } from "@incasif/schemas";
import type { QueueConfigs } from "./definitions.js";

export * from "./definitions.js";

/**
 * Permukaan Queue yang dipakai registry. Sengaja sempit supaya unit test bisa
 * menyuntik queue palsu tanpa Redis (pola injeksi yang sama dengan
 * AuditWriter di core/audit, PR-014).
 */
export interface QueueLike {
  add(jobName: string, payload: unknown, options: JobsOptions): Promise<{ id?: string | null }>;
  close(): Promise<void>;
}

export type QueueFactory = (name: QueueName, config: QueueConfig) => QueueLike;

export interface EnqueueOptions {
  /**
   * Job id deterministik — kunci anti-duplikat BullMQ: job dengan id yang
   * sudah ada TIDAK ditambahkan lagi (SDD §16). Pakai buildJobId().
   */
  jobId?: string;
  /** Tunda eksekusi (ms). */
  delayMs?: number;
}

export interface EnqueueResult {
  /** Id job di BullMQ (custom jobId bila diberikan, selain itu id generate). */
  jobId: string | null;
}

export interface QueueRegistry {
  /** Konfigurasi efektif satu queue (default SDD §16 + override env). */
  configOf(name: QueueName): QueueConfig;
  /** Instance queue (dibuat malas, di-cache). */
  queueOf(name: QueueName): QueueLike;
  /**
   * Kirim job dengan kebijakan retry/backoff/retensi queue-nya.
   *
   * Anti-duplikat: bila `options.jobId` diisi, BullMQ TIDAK menambahkan job
   * kedua dengan id sama — job yang sudah ada dipertahankan. BullMQ tidak
   * mengembalikan penanda "ini duplikat", jadi registry pun tidak mengarang
   * satu; pembuktian "tidak diproses dua kali" dilakukan dengan worker nyata
   * pada integration test PR-015b.
   */
  enqueue(name: QueueName, payload: unknown, options?: EnqueueOptions): Promise<EnqueueResult>;
  /** Tutup seluruh queue yang sempat dibuat (dipanggil saat shutdown). */
  close(): Promise<void>;
}

export interface QueueRegistryOptions {
  configs: QueueConfigs;
  /** Koneksi Redis queue (REDIS_QUEUE_URL — noeviction, ADR-004). */
  connection?: ConnectionOptions;
  /** Override pembuat queue (test). Default: BullMQ sungguhan. */
  factory?: QueueFactory;
}

/**
 * Susun job id deterministik dari bagian-bagian yang stabil.
 *
 * PENTING: BullMQ MELARANG karakter `:` pada custom job id (dipakai sebagai
 * pemisah key Redis internal). Contoh SDD §16 `extract:{sessionId}` karena itu
 * tidak bisa dipakai apa adanya — separator di sini `-`, dan `:` yang terbawa
 * dari input (mis. nama queue) ikut diganti. Hasilnya tetap deterministik:
 * input sama → id sama → BullMQ menolak duplikatnya.
 */
export function buildJobId(prefix: string, ...parts: Array<string | number>): string {
  const potongan = [prefix, ...parts]
    .map((bagian) => String(bagian).trim())
    .filter((bagian) => bagian.length > 0);

  if (potongan.length === 0) {
    throw new Error("buildJobId membutuhkan minimal satu bagian tidak kosong");
  }

  return potongan.join("-").replace(/:/g, "-");
}

/** Opsi job BullMQ untuk sebuah queue — kebijakan SDD §16, bukan hardcode pemanggil. */
export function jobOptionsFor(config: QueueConfig, options: EnqueueOptions = {}): JobsOptions {
  const jobOptions: JobsOptions = {
    attempts: config.attempts,
    backoff: { type: "exponential", delay: config.backoffMs },
    removeOnComplete: config.removeOnComplete,
    removeOnFail: config.removeOnFail,
  };

  if (options.jobId !== undefined) jobOptions.jobId = options.jobId;
  if (options.delayMs !== undefined) jobOptions.delay = options.delayMs;

  return jobOptions;
}

function defaultFactory(connection: ConnectionOptions | undefined): QueueFactory {
  return (name) => {
    if (connection === undefined) {
      throw new Error(
        "createQueueRegistry membutuhkan `connection` (REDIS_QUEUE_URL) atau `factory` pengganti",
      );
    }
    return new Queue(name, { connection }) as unknown as QueueLike;
  };
}

export function createQueueRegistry(options: QueueRegistryOptions): QueueRegistry {
  const factory = options.factory ?? defaultFactory(options.connection);
  const queues = new Map<QueueName, QueueLike>();

  function configOf(name: QueueName): QueueConfig {
    const config = options.configs[name];
    if (config === undefined) throw new Error(`Queue tidak dikenal: ${name}`);
    return config;
  }

  function queueOf(name: QueueName): QueueLike {
    const cached = queues.get(name);
    if (cached !== undefined) return cached;

    const queue = factory(name, configOf(name));
    queues.set(name, queue);
    return queue;
  }

  return {
    configOf,
    queueOf,

    async enqueue(name, payload, enqueueOptions = {}) {
      const config = configOf(name);
      const job = await queueOf(name).add(name, payload, jobOptionsFor(config, enqueueOptions));
      return { jobId: job.id ?? null };
    },

    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
      queues.clear();
    },
  };
}

/** Nama seluruh queue — re-export agar pemanggil tidak perlu impor schemas langsung. */
export { QUEUE_NAMES };
