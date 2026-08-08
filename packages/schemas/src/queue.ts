// Kontrak antrean bersama (SDD §16, ADR-004). Satu sumber kebenaran untuk
// nama queue dan bentuk konfigurasinya, dipakai oleh:
//   - core/queue di apps/api (produser: enqueue)
//   - apps/worker (konsumer: concurrency, retry, timeout) — PR-015b
//   - endpoint internal GET /internal/queues (observability DLQ) — PR-015b
// Nilai default per queue TIDAK di sini: itu keputusan runtime backend
// (apps/api/src/core/queue/definitions.ts), bukan kontrak lintas-klien.
import { z } from "zod";

/**
 * Nama queue mengikuti tabel SDD §16, tetapi dengan separator `-`.
 *
 * PENTING: **BullMQ melarang karakter ':' pada NAMA QUEUE** (dipakai untuk
 * namespacing key Redis) — `new Queue("ai:embed")` melempar
 * "Queue name cannot contain :". Penulisan SDD §16 (`ai:extract-resume`,
 * `pdf:render`, dst.) karena itu tidak dapat dipakai apa adanya; domain dan
 * pekerjaan tetap terbaca, hanya pemisahnya `-`. Larangan yang sama berlaku
 * untuk custom job id (lihat buildJobId di core/queue).
 *
 * Nama ini menjadi key Redis, jadi mengubahnya = migrasi antrean (job lama
 * pada nama lama tidak akan terbaca worker baru).
 */
export const QUEUE_NAME = {
  AI_EXTRACT_RESUME: "ai-extract-resume",
  AI_RERANK_FEED: "ai-rerank-feed",
  AI_EMBED: "ai-embed",
  PDF_RENDER: "pdf-render",
  NOTIFY_PUSH: "notify-push",
  NOTIFY_EMAIL: "notify-email",
  MAINTENANCE_PDP_PURGE: "maintenance-pdp-purge",
  MAINTENANCE_BACKUP: "maintenance-backup",
} as const;

export const queueNameSchema = z.enum([
  QUEUE_NAME.AI_EXTRACT_RESUME,
  QUEUE_NAME.AI_RERANK_FEED,
  QUEUE_NAME.AI_EMBED,
  QUEUE_NAME.PDF_RENDER,
  QUEUE_NAME.NOTIFY_PUSH,
  QUEUE_NAME.NOTIFY_EMAIL,
  QUEUE_NAME.MAINTENANCE_PDP_PURGE,
  QUEUE_NAME.MAINTENANCE_BACKUP,
]);

export type QueueName = z.infer<typeof queueNameSchema>;

/** Daftar seluruh nama queue — urutan stabil untuk iterasi & snapshot test. */
export const QUEUE_NAMES: readonly QueueName[] = queueNameSchema.options;

/**
 * Konfigurasi satu queue.
 *
 * `attempts` memakai semantik BullMQ: **total percobaan termasuk yang pertama**
 * (attempts 3 = 1 kali jalan + 2 kali retry). Kolom "Retry" SDD §16 menyebut
 * jumlah RETRY, jadi pemetaannya `attempts = retry + 1` — dilakukan sekali di
 * tabel default agar tidak ada salah tafsir berulang di kode pemanggil.
 *
 * `timeoutMs` bukan opsi job BullMQ v5 (dihapus sejak v4); nilai ini dipakai
 * worker untuk membatalkan processor yang menggantung (PR-015b).
 */
export const queueConfigSchema = z.object({
  concurrency: z
    .number()
    .int({ message: "concurrency harus bilangan bulat" })
    .min(1, { message: "concurrency minimal 1" })
    .max(64, { message: "concurrency maksimal 64" }),
  attempts: z
    .number()
    .int({ message: "attempts harus bilangan bulat" })
    .min(1, { message: "attempts minimal 1 (1 = tanpa retry)" })
    .max(10, { message: "attempts maksimal 10" }),
  backoffMs: z
    .number()
    .int({ message: "backoffMs harus bilangan bulat" })
    .min(0, { message: "backoffMs minimal 0" })
    .max(600_000, { message: "backoffMs maksimal 600000 (10 menit)" }),
  timeoutMs: z
    .number()
    .int({ message: "timeoutMs harus bilangan bulat" })
    .min(1_000, { message: "timeoutMs minimal 1000 (1 detik)" })
    .max(3_600_000, { message: "timeoutMs maksimal 3600000 (1 jam)" }),
  removeOnComplete: z
    .number()
    .int({ message: "removeOnComplete harus bilangan bulat" })
    .min(0, { message: "removeOnComplete minimal 0" }),
  removeOnFail: z
    .number()
    .int({ message: "removeOnFail harus bilangan bulat" })
    .min(0, { message: "removeOnFail minimal 0" }),
});

export type QueueConfig = z.infer<typeof queueConfigSchema>;

/**
 * Nama queue DLQ pendamping. BullMQ tidak punya DLQ bawaan: job gagal-final
 * dicatat ke queue terpisah `<queue>-dlq` (PR-015b). Separator `-`, bukan `:`
 * — lihat catatan larangan ':' pada QUEUE_NAME di atas.
 */
export function dlqNameOf(queue: QueueName): string {
  return `${queue}-dlq`;
}

/** Cacah job per state satu queue — dibaca GET /internal/queues (PR-015b). */
export const queueCountsSchema = z.object({
  waiting: z.number().int().min(0),
  active: z.number().int().min(0),
  delayed: z.number().int().min(0),
  failed: z.number().int().min(0),
  completed: z.number().int().min(0),
});

export type QueueCounts = z.infer<typeof queueCountsSchema>;

/** Ringkasan satu queue + kedalaman DLQ-nya. */
export const queueStatusSchema = z.object({
  name: queueNameSchema,
  counts: queueCountsSchema,
  /** Jumlah job gagal-final yang tercatat di `<queue>-dlq`. */
  dlqDepth: z.number().int().min(0),
  concurrency: z.number().int().min(1),
});

export type QueueStatus = z.infer<typeof queueStatusSchema>;

/** Respons GET /internal/queues. `dlqTotal` = sinyal alert (SDD §17: DLQ > 0). */
export const internalQueuesResponseSchema = z.object({
  queues: z.array(queueStatusSchema),
  dlqTotal: z.number().int().min(0),
});

export type InternalQueuesResponse = z.infer<typeof internalQueuesResponseSchema>;

/** Field konfigurasi yang boleh di-override lewat env (PR-015a, AC "bukan hardcode"). */
export const QUEUE_CONFIG_FIELDS = [
  "concurrency",
  "attempts",
  "backoffMs",
  "timeoutMs",
  "removeOnComplete",
  "removeOnFail",
] as const satisfies readonly (keyof QueueConfig)[];

export type QueueConfigField = (typeof QUEUE_CONFIG_FIELDS)[number];

/**
 * Payload job `maintenance-pdp-purge` (PR-023).
 *
 * `dryRun` ADA karena job ini menghapus data pribadi secara permanen. Operator
 * yang menyalakannya pertama kali di staging harus bisa melihat APA yang akan
 * hilang sebelum sesuatu benar-benar hilang — dan itu mustahil bila satu-satunya
 * cara menjalankannya adalah yang sungguhan.
 *
 * Default `false` disengaja: cron harian menjalankan job TANPA payload, dan
 * purge yang diam-diam menjadi dry-run adalah janji "hapus ≤ 30 hari" yang tidak
 * pernah ditepati tanpa ada yang menyadarinya.
 */
export const pdpPurgeJobSchema = z.object({
  dryRun: z.boolean().default(false),
});

export type PdpPurgeJob = z.infer<typeof pdpPurgeJobSchema>;

/** Hasil satu run purge — dikembalikan processor dan dicatat audit. */
export const pdpPurgeReportSchema = z.object({
  dryRun: z.boolean(),
  /** Akun yang memenuhi syarat pada run ini (dibatasi `batasPerRun`). */
  accounts: z.number().int().min(0),
  /** Akun yang dihapus penuh — tidak punya lamaran hired. */
  deleted: z.number().int().min(0),
  /** Akun yang dianonimkan — lamaran hired-nya dipertahankan. */
  anonymized: z.number().int().min(0),
  /** Total baris data anak pribadi yang dihapus. */
  records: z.number().int().min(0),
  /** true bila masih ada kandidat tersisa di luar batas run ini. */
  hasMore: z.boolean(),
});

export type PdpPurgeReport = z.infer<typeof pdpPurgeReportSchema>;
