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
import { createEventBus } from "./core/events/index.js";
import { createHealthModule } from "./modules/health/index.js";
import { createInternalAuth, createInternalModule } from "./modules/internal/index.js";
import {
  createAuthModule,
  createGoogleConfigFromEnv,
  createOtpSenderFromEnv,
  createSessionUserSource,
} from "./modules/auth/index.js";
import { createUsersModule } from "./modules/users/index.js";
import { createAccessibilityModule } from "./modules/accessibility/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "./core/auth/index.js";
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

  // Bus event domain PROSES INI (PR-024b, dipakai sejak PR-034). Terpisah dari
  // bus milik apps/worker dan itu memang benar: bus-nya in-process, jadi dua
  // proses berarti dua instance. Tidak ada state yang dibagi — `createEventBus`
  // menutup Map baru setiap dipanggil. Yang membedakan barisnya di log adalah
  // `service` dari logger masing-masing proses ("api" vs "worker").
  const events = createEventBus({ logger });

  // API hanya PRODUSER job; konsumennya proses apps/worker terpisah (ADR-004).
  const queues = createQueueRegistry({
    configs: queueConfigs,
    connection: { url: env.REDIS_QUEUE_URL },
  });
  const dlqQueues = createRawQueuePool({ url: env.REDIS_QUEUE_URL });

  // RBAC (PR-019). Penjaga dirakit SEKALI di sini — inilah composition root
  // tempat core/auth (bebas Prisma) bertemu repository modul auth.
  const guards = createAccessGuards({
    // undefined = kunci RS256 kosong → route ber-sesi menjawab 503, bukan 401.
    tokenService: sessionKeys === undefined ? undefined : createTokenService(sessionKeys),
    findSessionUser: createSessionUserSource(prisma),
    internalGuard: createInternalAuth(env.INTERNAL_TOKEN),
  });
  const routeRegistry = createRouteRegistry({ guardsFor: guards.guardsFor });

  const api = createServer(env, logger, {
    routes: (app) => {
      // Prefix ada di argumen forModule(), bukan di app.use(): registrar
      // menuliskan path penuh ke Express DAN ke registry sekaligus, jadi
      // keduanya tidak mungkin berbeda (lihat core/auth/registry.ts).
      app.use(createHealthModule(db, redis, routeRegistry.forModule(""))); // root, non-versioned
      app.use(
        createInternalModule({
          registry: queues,
          dlqQueueOf: (dlqName) => dlqQueues.queueOf(dlqName),
          routes: routeRegistry.forModule(""),
        }),
      );
      // Endpoint klien selalu di bawah /api/v1 (SDD §11).
      app.use(
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
          routes: routeRegistry.forModule("/api/v1"),
          auditLog,
          // Penerbit `auth.user_registered` (PR-034); pelanggannya modul
          // accessibility di bawah — instance bus yang SAMA, sebab bus ini
          // in-process dan dua instance tidak saling mendengar.
          events,
          logger,
        }),
      );
      app.use(
        createUsersModule({
          prisma,
          // Kuota ekspor PDP (PR-022) — cache, bukan queue: batasnya harian dan
          // kehilangannya saat evict hanya mengembalikan jatah, bukan merusak.
          redis: redis.cache,
          routes: routeRegistry.forModule("/api/v1"),
          auditLog,
        }),
      );
      app.use(
        createAccessibilityModule({
          prisma,
          routes: routeRegistry.forModule("/api/v1"),
          auditLog,
          // Pelanggan `auth.user_registered` — baris preferensi bawaan untuk
          // akun yang baru lahir (PR-034).
          events,
        }),
      );
    },
  });

  // Gerbang terakhir sebelum listen: rute tanpa deklarasi akses (atau router di
  // luar registry) membuat boot GAGAL — bukan API yang menyala setengah
  // terbuka. Melempar RouteAccessError yang ditangkap index.ts lewat startApi.
  assertRoutesDeclared(api.app, routeRegistry);
  logger.info({ rute: routeRegistry.list().length }, "Deklarasi akses route lengkap");

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
