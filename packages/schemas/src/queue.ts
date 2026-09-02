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
  MAINTENANCE_RETENTION: "maintenance-retention",
  MAINTENANCE_BACKUP: "maintenance-backup",
  AI_USAGE_RECORD: "ai-usage-record",
} as const;

export const queueNameSchema = z.enum([
  QUEUE_NAME.AI_EXTRACT_RESUME,
  QUEUE_NAME.AI_RERANK_FEED,
  QUEUE_NAME.AI_EMBED,
  QUEUE_NAME.PDF_RENDER,
  QUEUE_NAME.NOTIFY_PUSH,
  QUEUE_NAME.NOTIFY_EMAIL,
  QUEUE_NAME.MAINTENANCE_PDP_PURGE,
  QUEUE_NAME.MAINTENANCE_RETENTION,
  QUEUE_NAME.MAINTENANCE_BACKUP,
  QUEUE_NAME.AI_USAGE_RECORD,
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

/**
 * Payload job `maintenance-retention` (PR-024a).
 *
 * `dryRun` mengikuti alasan yang sama dengan pdp-purge: operator harus bisa
 * melihat apa yang akan hilang sebelum sesuatu hilang. Default `false` — cron
 * mengirim payload kosong, dan retensi yang diam-diam menjadi dry-run adalah
 * kebijakan SDD §6.4 yang tidak pernah berjalan tanpa ada yang menyadarinya.
 */
export const retentionJobSchema = z.object({
  dryRun: z.boolean().default(false),
});

export type RetentionJob = z.infer<typeof retentionJobSchema>;

/** Hasil satu kebijakan dalam satu run. */
export const retentionPolicyResultSchema = z.object({
  /** Nama kebijakan, mis. `refresh_tokens.reuse`. Bukan PII. */
  policy: z.string(),
  deleted: z.number().int().min(0),
  /**
   * Baris yang MASIH memenuhi syarat hapus setelah run ini — sisa di luar
   * batas batch. Tanpa angka ini, tabel yang tumbuh lebih cepat daripada yang
   * dibersihkan terlihat persis seperti tabel yang sehat.
   */
  remaining: z.number().int().min(0),
});

export type RetentionPolicyResult = z.infer<typeof retentionPolicyResultSchema>;

/** Hasil satu run retensi — dikembalikan processor dan dicatat audit. */
export const retentionReportSchema = z.object({
  dryRun: z.boolean(),
  /** Bulan `ai_usage` yang difinalkan ke agregat pada run ini. */
  monthsAggregated: z.number().int().min(0),
  policies: z.array(retentionPolicyResultSchema),
  deleted: z.number().int().min(0),
  remaining: z.number().int().min(0),
});

export type RetentionReport = z.infer<typeof retentionReportSchema>;

/**
 * Fitur AI yang punya jatah kuota — SALINAN KETIGA daftar yang sama.
 *
 * Dua salinan lain: enum `AiFeature` di `schema.prisma` (tipe kolom
 * `ai_usage.feature`) dan `AI_FEATURES` di `apps/api/src/core/ai/quota-config.ts`.
 * Ketiganya sengaja tidak saling mengimpor: paket ini tidak boleh bergantung
 * pada Prisma (ia juga dipakai web & mobile), dan `quota-config.ts` berdiri di
 * jalur sempit gerbang boot yang tidak boleh menyeret dependensi baru. Penjaga
 * kesamaannya adalah test (`ai-quota-config.test.ts`), bukan tipe — nilai DAN
 * urutannya dibandingkan tiga arah.
 */
export const aiFeatureSchema = z.enum([
  "cv_chat",
  "cv_finalize",
  "cv_check",
  "simplify_text",
  "interview_sim",
  "rerank",
  "embed",
]);

export type AiFeatureName = z.infer<typeof aiFeatureSchema>;

/**
 * Payload job `ai-usage-record` (PR-043b) — satu panggilan AI sukses = satu job
 * = satu baris `ai_usage`.
 *
 * TANPA ISI PROMPT ATAU JAWABAN. Yang lewat batas proses ini hanya metadata
 * biaya: siapa, fitur apa, provider mana, berapa token. Karena itu skemanya
 * `.strict()` dan bukan `.passthrough()`: kunci asing — mis. seseorang kelak
 * menempelkan `prompt` "sebentar saja untuk debug" — DITOLAK keras sehingga
 * job-nya gagal dan masuk DLQ, terlihat di `GET /internal/queues`. Membuang
 * kunci itu diam-diam adalah kebocoran yang lolos review berikutnya.
 *
 * `id` dibuat API (kolom `ai_usage.id` sengaja tanpa default DB): ia yang
 * membuat penulisan idempoten. Retry BullMQ membawa payload yang sama, jadi
 * UUID-nya sama, jadi penulisan kedua menabrak primary key dan ditelan.
 *
 * `createdAt` juga dibuat API, bukan `now()` saat worker menulis. Backlog
 * antrean yang melewati pergantian bulan — atau job DLQ yang di-replay manual —
 * akan mendarat di bulan yang salah, dan `finalkanBulanAiUsage` memfinalkan satu
 * bulan SEKALI tanpa pernah menghitung ulang: kesalahannya permanen dan senyap.
 */
export const aiUsageRecordJobSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    feature: aiFeatureSchema,
    provider: z.string().min(1).max(40),
    tokensIn: z.number().int().min(0),
    tokensOut: z.number().int().min(0),
    /**
     * Versi template prompt (SDD §7.3). OPSIONAL, bukan nullable: "belum ada
     * registry prompt berversi" cukup dinyatakan dengan ketiadaan kunci — dua
     * cara mengatakan hal yang sama akan bercabang di setiap pembaca, dan
     * `JSON.stringify` lewat Redis memang menghapus kunci `undefined`. Registry
     * lahir di PR-044; sampai saat itu kunci ini tidak pernah terisi.
     */
    promptVersion: z.string().min(1).max(40).optional(),
    /** ISO-8601 waktu panggilan AI, bukan waktu worker menulis. */
    createdAt: z.string().datetime(),
  })
  .strict();

export type AiUsageRecordJob = z.infer<typeof aiUsageRecordJobSchema>;
