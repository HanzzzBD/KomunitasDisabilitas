// core/queue/definitions — tabel queue SDD §16 + pembacaan override dari env.
//
// AC PR-015: "Config queue (concurrency/retry/timeout) dari env/config, bukan
// hardcode". Pendekatan: nilai SDD §16 menjadi DEFAULT yang terdokumentasi,
// dan SETIAP field boleh ditimpa lewat variabel env berpola
//   QUEUE_<NAMA_QUEUE>_<FIELD>   contoh: QUEUE_AI_EMBED_CONCURRENCY=8
// Semua override opsional, jadi menambah variabel baru tidak pernah memaksa
// perubahan .env yang sudah jalan (backward-compatible).
//
// Validasi memakai queueConfigSchema dari @nawasena/schemas dan kegagalannya
// dilempar sebagai EnvError — pola fail-fast yang sama dengan core/config
// (PR-006): proses mati saat boot dengan daftar variabel bermasalah, bukan
// berjalan dengan antrean salah konfigurasi.
import {
  QUEUE_CONFIG_FIELDS,
  QUEUE_NAMES,
  queueConfigSchema,
  type QueueConfig,
  type QueueConfigField,
  type QueueName,
} from "@nawasena/schemas";
import { EnvError } from "../config/index.js";

/** Konfigurasi seluruh queue, ter-index nama. */
export type QueueConfigs = Record<QueueName, QueueConfig>;

/** Kebijakan retensi umum SDD §16 — berlaku untuk semua queue. */
export const QUEUE_RETENTION = {
  removeOnComplete: 100,
  removeOnFail: 1000,
} as const;

/**
 * Default per queue = tabel SDD §16 verbatim.
 *
 * Catatan pemetaan (dilakukan sekali di sini agar tidak salah tafsir berulang):
 * - Kolom "Retry" SDD berarti jumlah RETRY; `attempts` BullMQ = retry + 1.
 *   "2×, exp 5 s" → attempts 3, backoffMs 5000.
 * - "manual" (pdp-purge) dan "alert bila gagal" (backup) = tanpa retry
 *   otomatis → attempts 1. Penanganannya operasional, bukan retry BullMQ.
 * - SDD tidak menyebut backoff untuk `ai-rerank-feed` dan `pdf-render`;
 *   backoffMs 0 = retry langsung (keputusan sadar, bukan nilai karangan).
 */
export const QUEUE_DEFAULTS: QueueConfigs = {
  "ai-extract-resume": {
    concurrency: 2,
    attempts: 3,
    backoffMs: 5_000,
    timeoutMs: 60_000,
    ...QUEUE_RETENTION,
  },
  "ai-rerank-feed": {
    concurrency: 2,
    attempts: 2,
    backoffMs: 0,
    timeoutMs: 30_000,
    ...QUEUE_RETENTION,
  },
  "ai-embed": {
    concurrency: 4,
    attempts: 4,
    backoffMs: 10_000,
    timeoutMs: 30_000,
    ...QUEUE_RETENTION,
  },
  "pdf-render": {
    // Concurrency 1 disengaja: Puppeteer boros RAM (risiko T4 SDD §20).
    concurrency: 1,
    attempts: 3,
    backoffMs: 0,
    timeoutMs: 90_000,
    ...QUEUE_RETENTION,
  },
  "notify-push": {
    concurrency: 8,
    attempts: 4,
    backoffMs: 30_000,
    timeoutMs: 15_000,
    ...QUEUE_RETENTION,
  },
  "notify-email": {
    concurrency: 4,
    attempts: 4,
    backoffMs: 30_000,
    timeoutMs: 15_000,
    ...QUEUE_RETENTION,
  },
  "maintenance-pdp-purge": {
    concurrency: 1,
    attempts: 1,
    backoffMs: 0,
    timeoutMs: 600_000, // 10 menit
    ...QUEUE_RETENTION,
  },
  // PR-024a. Angka mengikuti pdp-purge dan alasannya sama: operasi destruktif
  // tidak boleh di-retry otomatis (attempts 1) — kegagalan di tengah batch
  // harus dilihat manusia, bukan diulang membuta. Penanganannya operasional.
  "maintenance-retention": {
    concurrency: 1,
    attempts: 1,
    backoffMs: 0,
    timeoutMs: 600_000, // 10 menit
    ...QUEUE_RETENTION,
  },
  "maintenance-backup": {
    concurrency: 1,
    attempts: 1,
    backoffMs: 0,
    timeoutMs: 1_800_000, // 30 menit
    ...QUEUE_RETENTION,
  },
  // PR-043b — jejak biaya per panggilan AI. Angkanya diturunkan dari sifat
  // pekerjaannya, bukan disalin dari queue tetangga:
  // - concurrency 2: satu INSERT kecil per job, dan puncaknya sudah dibatasi
  //   pagu global AI (~1.500 panggilan/hari). Angka lebih besar hanya merebut
  //   slot worker dari `pdf-render` (RAM-bound, concurrency 1) tanpa masalah
  //   throughput yang perlu dipecahkan.
  // - attempts 4 (= 3 retry): job hilang = baris jejak biaya hilang selamanya.
  //   Retry aman TANPA risiko baris dobel karena idempoten by construction
  //   (UUID baris dibuat API; P2002 & P2003 ditelan processor).
  // - backoff 10 detik eksponensial: mode gagalnya adalah Postgres tumbang atau
  //   jenuh. 10/20/40 detik ≈ 70 detik, cukup melewati restart dan jauh lebih
  //   cepat daripada batas yang benar-benar penting (agregasi bulanan). Bukan
  //   30 detik seperti `notify-*`: tidak ada provider luar yang perlu disopani.
  // - timeout 15 detik: satu INSERT. Lebih lambat dari itu berarti DB sakit, dan
  //   anggaran pendek mengembalikan slot alih-alih memakunya.
  "ai-usage-record": {
    concurrency: 2,
    attempts: 4,
    backoffMs: 10_000,
    timeoutMs: 15_000,
    ...QUEUE_RETENTION,
  },
};

/**
 * Nama variabel env override untuk satu field satu queue.
 * `ai-extract-resume` + `backoffMs` → `QUEUE_AI_EXTRACT_RESUME_BACKOFF_MS`.
 */
export function queueEnvVar(queue: QueueName, field: QueueConfigField): string {
  const namaQueue = queue.replace(/[:-]/g, "_").toUpperCase();
  const namaField = field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  return `QUEUE_${namaQueue}_${namaField}`;
}

/** Daftar seluruh variabel override yang dikenali — dipakai dokumentasi & test. */
export function queueEnvVars(): string[] {
  return QUEUE_NAMES.flatMap((queue) =>
    QUEUE_CONFIG_FIELDS.map((field) => queueEnvVar(queue, field)),
  );
}

/**
 * Bangun konfigurasi seluruh queue: default SDD §16 ditimpa override env.
 * Melempar EnvError berisi [variabel, alasan] bila ada override yang tidak
 * valid — dipanggil saat boot API/worker sehingga salah konfigurasi ketahuan
 * sebelum ada job yang diproses.
 */
export function loadQueueConfigs(source: NodeJS.ProcessEnv = process.env): QueueConfigs {
  const issues: Array<readonly [string, string]> = [];
  const configs: Partial<QueueConfigs> = {};

  for (const queue of QUEUE_NAMES) {
    const draft: Record<string, unknown> = { ...QUEUE_DEFAULTS[queue] };

    for (const field of QUEUE_CONFIG_FIELDS) {
      const variable = queueEnvVar(queue, field);
      const raw = source[variable];
      if (raw === undefined || raw.trim() === "") continue; // tidak di-set → pakai default

      const angka = Number(raw);
      if (raw.trim() === "" || Number.isNaN(angka) || !Number.isFinite(angka)) {
        issues.push([variable, "harus angka"] as const);
        continue;
      }
      draft[field] = angka;
    }

    const parsed = queueConfigSchema.safeParse(draft);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        const variable =
          typeof field === "string" && (QUEUE_CONFIG_FIELDS as readonly string[]).includes(field)
            ? queueEnvVar(queue, field as QueueConfigField)
            : `QUEUE_${queue}`;
        issues.push([variable, issue.message] as const);
      }
      continue;
    }

    configs[queue] = parsed.data;
  }

  if (issues.length > 0) throw new EnvError(issues);
  return configs as QueueConfigs;
}
