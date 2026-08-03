// Entry point apps/api — fail-fast env, lalu boot (PR-006; wiring modul PR-008).
/* eslint-disable no-console -- sebelum logger siap, satu-satunya saluran adalah console */
import { loadEnv, EnvError } from "./core/config/index.js";
import { parseFieldKeys, FieldKeyError, type FieldKeys } from "./core/crypto/index.js";
import { createLogger } from "./core/logger/index.js";
import { createDbClient, createPrismaClient } from "./core/db/index.js";
import { createRedisClients } from "./core/redis/index.js";
import { createAuditLog, createPrismaAuditWriter } from "./core/audit/index.js";
import { createHealthModule } from "./modules/health/index.js";
import { createInternalModule } from "./modules/internal/index.js";
import { createAuthModule, createOtpSenderFromEnv } from "./modules/auth/index.js";
import { createQueueRegistry, createRawQueuePool, loadQueueConfigs } from "./core/queue/index.js";
import { createServer, registerShutdownHooks } from "./server.js";

let env;
try {
  env = loadEnv();
} catch (err) {
  // Logger belum bisa dibuat (butuh env valid) → console + exit ≠ 0.
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

// Fail-fast kunci enkripsi (PR-013, ADR-007): divalidasi SEBELUM logger, koneksi
// DB/Redis, atau listener dibuat — boot dengan kunci hilang/salah panjang/format
// berhenti di sini, bukan saat modul profiles pertama kali mengenkripsi field.
// Kunci hanya hidup di memori; JANGAN log fieldKeys (redaction = lapisan kedua).
let fieldKeys: FieldKeys;
try {
  fieldKeys = parseFieldKeys();
} catch (err) {
  console.error(err instanceof FieldKeyError ? err.message : err);
  process.exit(1);
}
void fieldKeys; // dipakai modul profiles (PR-037) — divalidasi di boot sejak sekarang.

// Konfigurasi antrean juga fail-fast (PR-015a): override env yang salah
// ketahuan saat boot, bukan saat job pertama dikirim.
let queueConfigs;
try {
  queueConfigs = loadQueueConfigs();
} catch (err) {
  console.error(err instanceof EnvError ? err.message : err);
  process.exit(1);
}

const logger = createLogger(env);
const db = createDbClient(env);
const prisma = createPrismaClient();
const redis = createRedisClients(env);

// Audit (PR-014) mulai dipakai modul auth. Sink metrik masih hitungan memori:
// pengiriman ke backend metrik produksi = PR observability (PR-103).
const auditMetricCounts = new Map<string, number>();
const auditLog = createAuditLog({
  writer: createPrismaAuditWriter(prisma),
  logger,
  metrics: { increment: (name) => auditMetricCounts.set(name, (auditMetricCounts.get(name) ?? 0) + 1) },
});

// API hanya PRODUSER job; konsumennya proses apps/worker terpisah (ADR-004).
const queues = createQueueRegistry({
  configs: queueConfigs,
  connection: { url: env.REDIS_QUEUE_URL },
});
const dlqQueues = createRawQueuePool({ url: env.REDIS_QUEUE_URL });

const api = createServer(env, logger, {
  routes: (app) => {
    app.use(createHealthModule(db, redis)); // /healthz /readyz (root, non-versioned)
    app.use(
      createInternalModule({
        registry: queues,
        dlqQueueOf: (dlqName) => dlqQueues.queueOf(dlqName),
        internalToken: env.INTERNAL_TOKEN,
      }),
    );
    // Endpoint klien selalu di bawah /api/v1 (SDD §11).
    app.use(
      "/api/v1",
      createAuthModule({
        prisma,
        redis: redis.cache,
        otpHashSecret: env.OTP_HASH_SECRET,
        // Fonnte primer → Twilio SMS cadangan; keduanya opsional (SDD §8.1).
        sender: createOtpSenderFromEnv(env, logger),
        auditLog,
        logger,
      }),
    );
  },
});

registerShutdownHooks(api, logger, undefined, async () => {
  // Setelah server berhenti menerima koneksi: tutup koneksi infra.
  await Promise.allSettled([
    queues.close(),
    dlqQueues.close(),
    db.end(),
    prisma.$disconnect(),
    redis.end(),
  ]);
});

try {
  await api.start();
} catch (err) {
  logger.fatal({ err }, "Gagal memulai server");
  process.exit(1);
}
