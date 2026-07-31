// Entry point apps/worker — konsumen BullMQ (PR-015b, ADR-004, SDD §16).
//
// Proses TERPISAH dari API: beban Puppeteer/AI tidak boleh menyentuh latensi
// request. Codebase sama dengan api (core/queue diimpor lewat @incasif/api),
// hanya entry-nya berbeda.
//
// Processor fitur (ekstraksi CV, embedding, render PDF, notifikasi) belum ada
// di Phase 1 — masing-masing didaftarkan oleh PR fiturnya di PROCESSORS.
/* eslint-disable no-console -- sebelum logger siap, satu-satunya saluran adalah console */
import { loadEnv, EnvError } from "@incasif/api/core/config";
import { createLogger } from "@incasif/api/core/logger";
import {
  createDlqHandler,
  createRawQueuePool,
  createWorkerRuntime,
  loadQueueConfigs,
  type ProcessorMap,
} from "@incasif/api/core/queue";

/** Registry processor. Diisi per PR fitur; kosong = worker menganggur. */
const PROCESSORS: ProcessorMap = {};

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

const logger = createLogger(env).child({ service: "worker" });
const connection = { url: env.REDIS_QUEUE_URL };

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
    .then(() => Promise.allSettled([dlq.close(), dlqPool.close()]))
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
