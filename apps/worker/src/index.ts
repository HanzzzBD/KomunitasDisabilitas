// Entry point apps/worker — konsumen BullMQ (PR-015b, ADR-004, SDD §16).
//
// Proses TERPISAH dari API: beban Puppeteer/AI tidak boleh menyentuh latensi
// request. Codebase sama dengan api (core/queue diimpor lewat @nawasena/api),
// hanya entry-nya berbeda.
//
// Processor fitur (ekstraksi CV, embedding, render PDF, notifikasi) belum ada
// di Phase 1 — masing-masing didaftarkan oleh PR fiturnya di PROCESSORS.
/* eslint-disable no-console -- sebelum logger siap, satu-satunya saluran adalah console */
import { QUEUE_NAME } from "@nawasena/schemas";
import { loadEnv, EnvError } from "@nawasena/api/core/config";
import { createLogger } from "@nawasena/api/core/logger";
import { createAuditLog, createPrismaAuditWriter } from "@nawasena/api/core/audit";
import { createPrismaClient } from "@nawasena/api/core/db";
import { createEventBus } from "@nawasena/api/core/events";
import {
  createDeviceRepository,
  createDevicesService,
  createFcmSenderFromEnv,
  createNotificationRepository,
  createPushService,
} from "@nawasena/api/modules/notifications";
import {
  createAccessibilityRepository,
  createAccessibilityService,
} from "@nawasena/api/modules/accessibility";
import {
  createDlqHandler,
  createRawQueuePool,
  createWorkerRuntime,
  loadQueueConfigs,
  type ProcessorMap,
} from "@nawasena/api/core/queue";
import { createPdpPurgeProcessor } from "./processors/pdp-purge.js";
import { createRetentionProcessor } from "./processors/retention.js";
import { createAiUsageProcessor } from "./processors/ai-usage.js";
import { createPushProcessor } from "./processors/push.js";

/**
 * Jadwal cron purge PDP — SDD §16: harian 03:17 WIB.
 *
 * Menit ganjil disengaja (bukan 03:00): jam bulat adalah tempat semua job
 * terjadwal di dunia berkumpul, dan job destruktif tidak boleh berebut I/O
 * dengan backup.
 */
const JADWAL_PURGE = { pattern: "17 3 * * *", tz: "Asia/Jakarta" } as const;

/**
 * Retensi (PR-024a) berjalan 02:47 WIB — SEBELUM purge (03:17), sesudah backup
 * (02:07). Urutannya disengaja: purge menghapus `ai_usage` milik akun terpurge
 * tanpa memandang umur, jadi menjalankan agregasi lebih dulu memperkecil
 * jendela pemakaian AI yang hilang dari agregat bulanan sebelum sempat dihitung.
 */
const JADWAL_RETENSI = { pattern: "47 2 * * *", tz: "Asia/Jakarta" } as const;

let env;
try {
  env = loadEnv();
} catch (err) {
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

let queueConfigs;
try {
  queueConfigs = loadQueueConfigs();
} catch (err) {
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

const logger = createLogger(env, { service: "worker" });
const connection = { url: env.REDIS_QUEUE_URL };

// Klien Prisma ber-penjaga soft delete (PR-021). Purge memang perlu melihat
// baris terhapus — dan ia menyebut `deletedAt` sendiri di where-nya, jalan
// keluar yang dirancang eksplisit supaya terbaca di tempat panggilan.
const prisma = createPrismaClient();
const auditLog = createAuditLog({
  writer: createPrismaAuditWriter(prisma),
  logger,
  metrics: { increment: (name) => logger.warn({ metric: name }, "Metrik audit bertambah") },
});

// Bus event domain (PR-024b). Langganan didaftarkan DI SINI, di composition
// root — bukan di dalam service. Hari ini belum ada satu pun; begitu modul
// notifikasi lahir, ia mendaftar di sini dan penerbitnya tidak berubah
// sedikit pun. Itulah seluruh gunanya.
const events = createEventBus({ logger });

// Jalur push (PR-048b). Dirakit DI SINI, di composition root, dari potongan
// modul `notifications` — bukan dengan meng-import repository-nya di dalam
// processor. Adapter FCM-nya menjawab "tidak tersedia" bila kredensialnya
// kosong, dan itu keadaan sah: worker tetap menyala dan tetap menjalankan purge
// PDP serta retensi, yang tidak ada hubungannya dengan push.
const fcm = createFcmSenderFromEnv(env);
if (!fcm.tersedia) {
  // Berisik di boot, sekali, bukan senyap: push yang mati diam-diam adalah kabar
  // yang tidak pernah sampai tanpa satu pun jejak.
  logger.warn({}, "Kredensial FCM belum diatur — job notify-push akan dilewati");
}

const pushService = createPushService({
  notificationRepository: createNotificationRepository(prisma),
  devices: createDevicesService({ deviceRepository: createDeviceRepository(prisma) }),
  fcm,
  // Varian bahasa push mengikuti preferensi pemiliknya (ADR-008) — service yang
  // SAMA dengan yang melayani `/me/accessibility`, bukan pembacaan kedua.
  accessibility: createAccessibilityService({
    accessibilityRepository: createAccessibilityRepository(prisma),
  }),
  logger,
});

/** Registry processor. Diisi per PR fitur; kosong = worker menganggur. */
const PROCESSORS: ProcessorMap = {
  [QUEUE_NAME.MAINTENANCE_PDP_PURGE]: createPdpPurgeProcessor({ prisma, auditLog, logger }),
  [QUEUE_NAME.MAINTENANCE_RETENTION]: createRetentionProcessor({
    prisma,
    auditLog,
    events,
    logger,
    env,
  }),
  // PR-043b. TIDAK ikut `jadwalkan()` di bawah: queue ini event-driven —
  // produsernya `AiClient` pada setiap panggilan AI yang berhasil. Sampai PR
  // fitur AI pertama merakit `AiClient` di `boot.ts`, konsumen ini menganggur,
  // dan menganggur adalah keadaan yang benar (bukan kegagalan).
  [QUEUE_NAME.AI_USAGE_RECORD]: createAiUsageProcessor({ prisma, logger }),
  // PR-048b. TIDAK ikut `jadwalkan()` — event-driven, produsernya modul
  // notifications di proses API pada setiap notifikasi yang baru lahir.
  [QUEUE_NAME.NOTIFY_PUSH]: createPushProcessor({ push: pushService, logger }),
};

// DLQ ditulis lewat pool queue bernama bebas (`<queue>-dlq`).
const dlqPool = createRawQueuePool(connection);
const dlq = createDlqHandler({
  dlqFactory: (nama) => dlqPool.queueOf(nama),
  logger,
  metrics: {
    // Backend metrik produksi menyusul (ADR-017); untuk sekarang penghitung
    // ini cukup agar kegagalan tidak senyap — nilainya terbaca di log.
    increment: (name) => logger.warn({ metric: name }, "Metrik antrean bertambah"),
  },
});

const runtime = createWorkerRuntime({
  configs: queueConfigs,
  processors: PROCESSORS,
  logger,
  connection,
  onFailed: (queue, job, error) => dlq.onFailed(queue, job, error),
});

/**
 * Daftarkan job berulang purge PDP. BullMQ menyimpannya di bawah kunci yang
 * diturunkan dari pola + nama, jadi memanggil ini pada SETIAP boot bersifat
 * idempoten — restart tidak menumpuk jadwal ganda.
 *
 * Dijadwalkan worker sendiri, bukan cron sistem: satu-satunya prasyaratnya
 * Redis yang memang sudah ada, dan jadwalnya ikut berpindah bersama kode alih-
 * alih hidup di berkas crontab yang tidak pernah masuk review.
 */
function jadwalkan(
  queue: (typeof QUEUE_NAME)[keyof typeof QUEUE_NAME],
  jadwal: { pattern: string; tz: string },
  jobId: string,
  keterangan: string,
): void {
  dlqPool
    .queueOf(queue)
    .add(queue, {}, { repeat: jadwal, jobId })
    .then(() => logger.info({ queue, jadwal: jadwal.pattern }, `${keterangan} terjadwal`))
    .catch((err: unknown) => {
      // Bukan alasan menjatuhkan worker: processor lain tetap berguna, dan job
      // tetap bisa di-enqueue manual. Tetapi ia HARUS berisik — job kebersihan
      // yang tidak terjadwal berarti kebijakan berhenti ditepati tanpa gejala.
      logger.error({ err, queue }, `Gagal menjadwalkan ${keterangan} — jalankan manual`);
    });
}

jadwalkan(QUEUE_NAME.MAINTENANCE_PDP_PURGE, JADWAL_PURGE, "cron-pdp-purge", "Purge PDP");
jadwalkan(QUEUE_NAME.MAINTENANCE_RETENTION, JADWAL_RETENSI, "cron-retention", "Retensi data");

logger.info({ queues: runtime.running() }, "Worker siap");

/**
 * Graceful shutdown: berhenti mengambil job baru, TUNGGU job aktif selesai
 * (drain), baru tutup koneksi. Job tidak boleh terpotong di tengah jalan.
 */
let sedangBerhenti = false;
function shutdown(signal: string): void {
  if (sedangBerhenti) return;
  sedangBerhenti = true;
  logger.info({ signal }, "Menerima sinyal berhenti");

  runtime
    .drain()
    .then(() => Promise.allSettled([dlq.close(), dlqPool.close(), prisma.$disconnect()]))
    .then(() => {
      logger.info("Worker berhenti bersih");
      process.exit(0);
    })
    .catch((err: unknown) => {
      logger.error({ err }, "Gagal menutup worker dengan bersih");
      process.exit(1);
    });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
