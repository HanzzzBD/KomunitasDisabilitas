// Perakitan aplikasi (wiring) — dipisah dari index.ts DENGAN SENGAJA.
//
// index.ts hanya memuat gerbang fail-fast (env, kunci enkripsi, config queue)
// dan meng-import file ini secara DINAMIS setelah semua gerbang lolos. Alasannya
// bukan gaya: `@prisma/client` memuat `apps/api/.env` ke `process.env` saat
// di-import. Bila modul yang menyentuh Prisma ikut ter-import di index.ts,
// seluruh gerbang akan berjalan SETELAH .env menambal variabel yang hilang —
// artinya boot yang seharusnya mati (mis. tanpa FIELD_KEY_V1) malah lanjut.
// Simpan semua import yang menyentuh Prisma di sini, jangan di index.ts.
import type { Env } from "./core/config/index.js";
import type { FieldKeys } from "./core/crypto/index.js";
import type { SessionKeys } from "./core/auth/index.js";
import { createLogger } from "./core/logger/index.js";
import { createDbClient, createPrismaClient } from "./core/db/index.js";
import { createRedisClients } from "./core/redis/index.js";
import { createAuditLog, createPrismaAuditWriter } from "./core/audit/index.js";
import { createHealthModule } from "./modules/health/index.js";
import { createInternalModule } from "./modules/internal/index.js";
import {
  createAuthModule,
  createGoogleConfigFromEnv,
  createOtpSenderFromEnv,
} from "./modules/auth/index.js";
import {
  createQueueRegistry,
  createRawQueuePool,
  type QueueConfigs,
} from "./core/queue/index.js";
import { createServer, registerShutdownHooks } from "./server.js";

export interface BootOptions {
  env: Env;
  /** Sudah tervalidasi di index.ts; dipakai modul profiles (PR-037). */
  fieldKeys: FieldKeys;
  /** Sudah tervalidasi di index.ts; undefined = fitur sesi mati (503). */
  sessionKeys: SessionKeys | undefined;
  queueConfigs: QueueConfigs;
}

/** Rakit seluruh dependensi lalu mulai listen. Melempar bila gagal start. */
export async function startApi(options: BootOptions): Promise<void> {
  const { env, fieldKeys, sessionKeys, queueConfigs } = options;
  void fieldKeys; // dipakai modul profiles (PR-037) — divalidasi di boot sejak sekarang.

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
    metrics: {
      increment: (name) => auditMetricCounts.set(name, (auditMetricCounts.get(name) ?? 0) + 1),
    },
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
          // undefined bila JWT_PRIVATE_KEY/PUBLIC_KEY kosong → /auth/refresh
          // dan kedua metode masuk menjawab 503 (PR-018b).
          sessionKeys,
          // `Secure` dilepas HANYA di dev, tempat API berjalan di http localhost.
          cookieSecure: env.NODE_ENV !== "development",
          // Fonnte primer → Twilio SMS cadangan; keduanya opsional (SDD §8.1).
          sender: createOtpSenderFromEnv(env, logger),
          // undefined bila kredensial Google kosong → /auth/google jawab 503.
          google: createGoogleConfigFromEnv(env),
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
}
