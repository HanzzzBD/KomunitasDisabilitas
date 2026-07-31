// core/queue/dlq — pencatatan job gagal-final (SDD §16, §17).
//
// BullMQ tidak punya DLQ bawaan. Pola di sini: saat sebuah job kehabisan
// `attempts`, sebuah CATATAN dimasukkan ke queue pendamping `<queue>-dlq`.
// Kedalaman DLQ dibaca GET /internal/queues dan menjadi sinyal alert
// "DLQ > 0" (SDD §17).
//
// PRIVASI — catatan DLQ TIDAK menyalin payload job.
// SDD §16 mensyaratkan payload job bebas PII "bila memungkinkan", dan DLQ
// bukan tempat yang tepat untuk mengambil risiko itu: yang disimpan hanya
// penunjuk (queue, jobId, nama job, jumlah percobaan, alasan gagal yang
// dipotong) plus DAFTAR NAMA KEY payload — bukan nilainya. Payload aslinya
// tetap tersedia untuk investigasi lewat job gagal yang ditahan BullMQ
// (`removeOnFail: 1000`, SDD §16), jadi tidak ada informasi yang hilang.
import type { QueueName } from "@incasif/schemas";
import { dlqNameOf } from "@incasif/schemas";
import type { Logger } from "../logger/index.js";
import type { QueueLike } from "./index.js";

export { dlqNameOf };

/** Batas panjang alasan gagal yang disimpan — cegah stack trace raksasa. */
const MAX_ALASAN = 500;

export const DLQ_METRIC = {
  JOB_DEAD_LETTERED: "queue_job_dead_lettered",
  DLQ_WRITE_FAILED: "queue_dlq_write_failed",
} as const;

export type DlqMetricName = (typeof DLQ_METRIC)[keyof typeof DLQ_METRIC];

export interface DlqMetricSink {
  increment(name: DlqMetricName): void;
}

/** Catatan yang masuk DLQ — penunjuk, bukan salinan data. */
export interface DlqRecord {
  queue: QueueName;
  jobId: string | null;
  jobName: string;
  attemptsMade: number;
  failedReason: string;
  /** Nama key payload saja (tanpa nilai) — cukup untuk triase, bebas PII. */
  payloadKeys: string[];
  failedAt: string;
}

/** Informasi job gagal yang dibutuhkan handler (subset Job BullMQ). */
export interface FailedJobInfo {
  id?: string | null;
  name?: string;
  attemptsMade?: number;
  data?: unknown;
  opts?: { attempts?: number };
}

export interface DlqHandlerOptions {
  /** Pembuat queue DLQ (nama `<queue>-dlq`). */
  dlqFactory: (dlqName: string) => QueueLike;
  logger: Pick<Logger, "error" | "warn">;
  metrics: DlqMetricSink;
  /** Sumber waktu — injectable agar test deterministik. */
  now?: () => Date;
}

/** true bila job sudah kehabisan jatah percobaan (gagal-final, bukan retry). */
export function isFinalFailure(job: FailedJobInfo): boolean {
  const attempts = job.opts?.attempts ?? 1;
  return (job.attemptsMade ?? 0) >= attempts;
}

/** Ambil nama key payload tanpa nilainya. */
export function payloadKeysOf(data: unknown): string[] {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.keys(data as Record<string, unknown>).sort();
}

function ringkasAlasan(error: unknown): string {
  const pesan = error instanceof Error ? error.message : String(error);
  return pesan.length > MAX_ALASAN ? `${pesan.slice(0, MAX_ALASAN)}…` : pesan;
}

export interface DlqHandler {
  /**
   * Dipanggil pada event `failed`. Job yang masih punya sisa retry diabaikan;
   * hanya kegagalan final yang masuk DLQ.
   */
  onFailed(queue: QueueName, job: FailedJobInfo | undefined, error: unknown): Promise<void>;
  close(): Promise<void>;
}

export function createDlqHandler(options: DlqHandlerOptions): DlqHandler {
  const now = options.now ?? (() => new Date());
  const dlqs = new Map<string, QueueLike>();

  function dlqFor(queue: QueueName): QueueLike {
    const nama = dlqNameOf(queue);
    const cached = dlqs.get(nama);
    if (cached !== undefined) return cached;
    const dibuat = options.dlqFactory(nama);
    dlqs.set(nama, dibuat);
    return dibuat;
  }

  return {
    async onFailed(queue, job, error) {
      if (job === undefined || !isFinalFailure(job)) return; // masih akan di-retry

      const record: DlqRecord = {
        queue,
        jobId: job.id ?? null,
        jobName: job.name ?? queue,
        attemptsMade: job.attemptsMade ?? 0,
        failedReason: ringkasAlasan(error),
        payloadKeys: payloadKeysOf(job.data),
        failedAt: now().toISOString(),
      };

      options.metrics.increment(DLQ_METRIC.JOB_DEAD_LETTERED);
      // Gagal-final SELALU terlihat, bahkan bila penulisan DLQ ikut gagal.
      options.logger.error(
        {
          metric: DLQ_METRIC.JOB_DEAD_LETTERED,
          queue: record.queue,
          jobId: record.jobId,
          attemptsMade: record.attemptsMade,
          payloadKeys: record.payloadKeys,
        },
        "Job gagal final, dipindah ke DLQ",
      );

      try {
        // Catatan DLQ tidak perlu retry sendiri: attempts 1, disimpan lama.
        await dlqFor(queue).add(dlqNameOf(queue), record, {
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        });
      } catch (dlqError) {
        options.metrics.increment(DLQ_METRIC.DLQ_WRITE_FAILED);
        options.logger.error(
          {
            metric: DLQ_METRIC.DLQ_WRITE_FAILED,
            queue: record.queue,
            jobId: record.jobId,
            err: dlqError instanceof Error ? dlqError.message : String(dlqError),
          },
          "Gagal menulis catatan DLQ",
        );
      }
    },

    async close() {
      await Promise.all([...dlqs.values()].map((dlq) => dlq.close()));
      dlqs.clear();
    },
  };
}
