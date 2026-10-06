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
import {
  createInternalAuth,
  createInternalModule,
  createQueuesService,
} from "./modules/internal/index.js";
import { createAdminModule } from "./modules/admin/index.js";
import {
  createAuthModule,
  createGoogleConfigFromEnv,
  createPhoneSenderFromEnv,
  createSessionRevoker,
  createSessionUserSource,
} from "./modules/auth/index.js";
import {
  createAdminDirectory,
  createApplicantDirectory,
  createNotificationChannelsContributor,
  createNotificationPrefsService,
  createUserProfileRepository,
  createUsersModule,
} from "./modules/users/index.js";
import { createAccessibilityModule } from "./modules/accessibility/index.js";
import { createNotificationsModule } from "./modules/notifications/index.js";
import {
  createProfileRepository,
  createProfilesModule,
  createSkillRepository,
  createSkillsService,
} from "./modules/profiles/index.js";
import { createCompaniesModule } from "./modules/companies/index.js";
import { createCommunityModule } from "./modules/community/index.js";
import { createJobsModule } from "./modules/jobs/index.js";
import {
  createApplicationsExport,
  createApplicationsModule,
} from "./modules/applications/index.js";
import {
  bobotDariEnv,
  createMatchingFeedModule,
  createMatchingModule,
} from "./modules/matching/index.js";
import { createResumePdfJobs, createResumesModule } from "./modules/resumes/index.js";
import { createSignbridgeModule } from "./modules/signbridge/index.js";
import {
  StorageNotConfiguredError,
  createObjectStorage,
  storageConfigFromEnv,
  createObjectReader,
} from "./core/storage/index.js";
import {
  createAiModule,
  createAiSimplifyModule,
  createAiUsageRecorder,
} from "./modules/ai/index.js";
import { createAiQuota, rakitAiClient, type AiQuotaConfig } from "./core/ai/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "./core/auth/index.js";
import { createQueueRegistry, createRawQueuePool, type QueueConfigs } from "./core/queue/index.js";
import { createServer, registerShutdownHooks } from "./server.js";

export interface BootOptions {
  env: Env;
  /** Sudah tervalidasi di index.ts; dipakai modul profiles (PR-037). */
  fieldKeys: FieldKeys;
  /** Sudah tervalidasi di index.ts; undefined = fitur sesi mati (503). */
  sessionKeys: SessionKeys | undefined;
  queueConfigs: QueueConfigs;
  /** Sudah tervalidasi di index.ts; dipakai mesin kuota AI (PR-043). */
  quotaConfig: AiQuotaConfig;
}

/** Rakit seluruh dependensi lalu mulai listen. Melempar bila gagal start. */
export async function startApi(options: BootOptions): Promise<void> {
  const { env, fieldKeys, sessionKeys, queueConfigs, quotaConfig } = options;

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

  // API membuat presigned URL dan memproduksi job; binary Chromium tetap hanya
  // ada di worker. Storage opsional pada boot, tetapi endpoint tetap terdaftar
  // dan menjawab 503 bila grup konfigurasinya belum tersedia.
  // Satu adapter dipakai bersama PDF CV dan kamus BISINDO (PR-084).
  let objectStorage: ReturnType<typeof createObjectStorage> | undefined;
  try {
    objectStorage = createObjectStorage(storageConfigFromEnv(env));
  } catch (err) {
    if (err instanceof StorageNotConfiguredError) {
      logger.warn({}, "Object storage belum diatur — endpoint PDF & kamus BISINDO menjawab 503");
    } else {
      throw err;
    }
  }
  const resumePdf =
    objectStorage === undefined
      ? undefined
      : {
          jobs: createResumePdfJobs(queues),
          storage: objectStorage,
          readObject: createObjectReader(storageConfigFromEnv(env), env.PDF_RENDER_MAX_BYTES),
        };

  // Kuota AI (PR-043) di atas klien `redis.queue`, BUKAN `redis.cache`.
  // Instans cache berjalan `allkeys-lru` (ADR-004): kunci yang terusir di sana
  // akan diam-diam memulihkan jatah seorang pengguna DAN menihilkan pagu global
  // justru saat memori sedang tertekan — kebalikan dari gunanya penghitung ini.
  // Penjelasan lengkap beserta dua penjaganya (prefiks `ai:kuota:` + TTL pada
  // setiap kunci) ada di kepala core/ai/quota.ts.
  const aiQuota = createAiQuota({
    redis: redis.queue,
    config: quotaConfig,
    logger,
    failOpen: env.AI_QUOTA_FAIL_OPEN,
  });
  if (env.AI_QUOTA_FAIL_OPEN) {
    // Berisik dengan sengaja: keadaan ini mencabut seluruh kendali biaya AI saat
    // Redis bermasalah, dan tidak boleh berlalu tanpa jejak di log boot.
    logger.warn(
      { failOpen: true },
      "AI_QUOTA_FAIL_OPEN aktif — panggilan AI dilewatkan bila penghitung kuota tak terbaca",
    );
  }

  // RBAC (PR-019). Penjaga dirakit SEKALI di sini — inilah composition root
  // tempat core/auth (bebas Prisma) bertemu repository modul auth.
  const guards = createAccessGuards({
    // undefined = kunci RS256 kosong → route ber-sesi menjawab 503, bukan 401.
    tokenService: sessionKeys === undefined ? undefined : createTokenService(sessionKeys),
    findSessionUser: createSessionUserSource(prisma),
    internalGuard: createInternalAuth(env.INTERNAL_TOKEN),
  });
  const routeRegistry = createRouteRegistry({ guardsFor: guards.guardsFor });

  // Modul profil dirakit LEBIH DULU daripada dipasang, dan DI LUAR callback
  // `routes` — dua alasan yang keduanya nyata:
  //   1. modul `users` membutuhkan bagian ekspor PDP miliknya (PR-038), dan
  //      satu-satunya jalan masuk ke agregator ekspor adalah parameter;
  //   2. hook shutdown di bawah perlu menjangkau `sensitiveAccess` untuk
  //      menuliskan hitungan audit agregat yang masih tertahan (PR-039).
  // Registrar-nya menulis ke Router-nya sendiri, jadi merakit di sini dan
  // memasang di dalam callback tidak mengubah apa pun bagi Express.
  const profiles = createProfilesModule({
    prisma,
    routes: routeRegistry.forModule("/api/v1"),
    // Kunci yang SAMA dengan yang sudah lolos gerbang di index.ts — modul tidak
    // pernah membaca env sendiri (ADR-007, ADR-015).
    fieldKeys,
    auditLog,
    // Penerbit `profile.updated` (PR-038); pelanggannya modul matching di bawah.
    events,
  });

  // Pemicu embedding (PR-069): pelanggan `profile.updated`, `job.published`,
  // dan `job.updated` di bus PROSES INI — penerbit ketiganya hidup di sini
  // (modul profiles & jobs, lewat HTTP). Handler-nya hanya meng-enqueue
  // `ai-embed`; perhitungan vektornya di apps/worker.
  createMatchingModule({ events, queues });

  // Sama seperti `profiles` di atas, dan alasannya persis sama: modul `users`
  // membutuhkan bagian ekspor PDP keduanya (utang U-03 & U-04, dibayar
  // 2026-09-05), dan satu-satunya jalan masuk ke agregator ekspor adalah
  // parameter. Registrar-nya menulis ke Router-nya sendiri, jadi merakit di sini
  // dan memasang di dalam callback tidak mengubah apa pun bagi Express.
  const accessibility = createAccessibilityModule({
    prisma,
    routes: routeRegistry.forModule("/api/v1"),
    auditLog,
    // Pelanggan `auth.user_registered` — baris preferensi bawaan untuk akun
    // yang baru lahir (PR-034).
    events,
  });

  // Preferensi kanal notifikasi (PR-049b). Dirakit DI SINI, bukan di dalam salah
  // satu modul, sebab pembacanya DUA: endpoint `/me/notification-prefs` (modul
  // users, pemilik kolomnya) dan produser job email (modul notifications).
  // Merakitnya di salah satu lalu menyerahkannya ke yang lain akan menutup
  // lingkaran — modul users sudah menerima kontributor ekspor dari notifications.
  const notificationPrefs = createNotificationPrefsService({
    userRepository: createUserProfileRepository(prisma),
  });

  const notifications = createNotificationsModule({
    prisma,
    routes: routeRegistry.forModule("/api/v1"),
    // Produser job `notify:push` (PR-048b). API hanya MEMPRODUKSI; konsumennya
    // proses apps/worker terpisah (ADR-004), yang merakit adapter FCM-nya
    // sendiri dari env yang sama.
    queues,
    // Produser job `notify:email` (PR-049b) memeriksanya lebih dulu: email
    // adalah kanal OPT-IN, jadi tanpa pemeriksaan ini mayoritas notifikasi
    // melahirkan job yang pasti dibuang konsumen.
    preferensiKanal: notificationPrefs,
    // Penerima kabar `admin.lamaran_baru` (PR-075) — kolom `role` milik modul
    // users, jadi daftarnya datang dari sana, bukan dari query di notifications.
    direktoriAdmin: createAdminDirectory(createUserProfileRepository(prisma)),
    logger,
    // Pelanggan `auth.user_registered` (bersama modul accessibility),
    // `application.submitted`, dan `application.status_changed` — instance bus
    // yang SAMA, sebab bus ini in-process dan dua instance tidak saling
    // mendengar. Penerbit `application.submitted` = modul `applications`
    // (PR-075); `application.status_changed` menyusul di PR-076.
    events,
  });

  // Dirakit di LUAR callback `routes`, alasan yang sama dengan `profiles`:
  // modul users membutuhkan bagian ekspor PDP miliknya (transkrip AI CV
  // Builder, PR-065), dan satu-satunya jalan masuk ke agregator adalah
  // parameter. `chatSessions` dikembalikan untuk endpoint SSE PR-066.
  // AiClient (utang U-06, dibayar PR-066): satu-satunya jalan modul ke LLM —
  // kuota → provider → jejak biaya → cache. Disusun `rakitAiClient` (core/ai),
  // perakit yang SAMA dengan worker ekstraksi CV (PR-067) — pabrik provider
  // tidak dipanggil di sini maupun di worker (U-07, `ai-gateway-jangkauan`).
  // Kunci AI kosong bukan kegagalan boot: gateway menjadi penolak
  // `AI_NOT_CONFIGURED` dan fitur AI jatuh ke jalur non-AI (ADR-005).
  const aiMetricCounts = new Map<string, number>();
  const aiMetrics = {
    increment: (name: string) => aiMetricCounts.set(name, (aiMetricCounts.get(name) ?? 0) + 1),
  };
  const aiClient = rakitAiClient({
    env,
    logger,
    quota: aiQuota,
    // Produser `ai:usage-record`; konsumennya worker (PR-043b).
    recorder: createAiUsageRecorder({ queues, logger, metrics: aiMetrics }),
    // `redis.cache` (allkeys-lru), BUKAN `redis.queue` — kebalikan kuota.
    cacheRedis: redis.cache,
    metrics: aiMetrics,
  });

  // Dirakit di LUAR callback `routes`, alasan yang sama dengan `profiles`:
  // modul users membutuhkan bagian ekspor PDP miliknya (transkrip AI CV
  // Builder PR-065, jejak pemakaian AI U-05), dan satu-satunya jalan masuk ke
  // agregator adalah parameter.
  // CV jalur manual (PR-060) — dirakit di LUAR callback `routes` sejak PR-067:
  // modul ai membutuhkan service-nya untuk menghitung CV sebelum finalize.
  // TIDAK bergantung pada gateway AI sama sekali, dan itu justru intinya:
  // graceful degradation adalah kewajiban produk (PRD), jadi jalur ini harus
  // tetap hidup utuh saat kuota habis atau kedua penyedia LLM tumbang.
  const resumes = createResumesModule({
    prisma,
    routes: routeRegistry.forModule("/api/v1"),
    maksPerPengguna: env.RESUME_MAX_PER_USER,
    pdf: resumePdf,
  });

  const ai = createAiModule({
    prisma,
    quota: aiQuota,
    routes: routeRegistry.forModule("/api/v1"),
    cvChat: { ai: aiClient, aktif: env.AI_CV_CHAT_ENABLED, logger },
    // PR-067: produser `ai-extract-resume` + batas CV yang SAMA dengan jalur
    // manual, dibaca lewat service modul resumes (ADR-001).
    finalize: {
      queues,
      cv: { jumlah: async (actor) => (await resumes.service.list(actor)).length },
      maksCv: env.RESUME_MAX_PER_USER,
    },
  });
  if (!env.AI_SIMPLIFY_ENABLED) {
    logger.warn(
      { fitur: "simplify_text" },
      "AI_SIMPLIFY_ENABLED=false — tombol Sederhanakan disembunyikan, teks asli tetap tampil",
    );
  }
  if (!env.AI_CV_CHAT_ENABLED) {
    logger.warn(
      { fitur: "cv_chat" },
      "AI_CV_CHAT_ENABLED=false — chat CV dimatikan, pengguna diarahkan ke formulir",
    );
  }

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
          alamatBanding: env.SUPPORT_EMAIL,
          prisma,
          redis: redis.cache,
          otpHashSecret: env.OTP_HASH_SECRET,
          // undefined bila JWT_PRIVATE_KEY/PUBLIC_KEY kosong → /auth/refresh
          // dan kedua metode masuk menjawab 503 (PR-018b).
          sessionKeys,
          // `Secure` dilepas HANYA di dev, tempat API berjalan di http localhost.
          cookieSecure: env.NODE_ENV !== "development",
          // Utang U-10: balapan rotasi (dua tab, boot vs 401) tidak lagi
          // mencabut keluarga sesi milik pemenangnya.
          toleransiRotasiDetik: env.AUTH_REFRESH_ROTATION_GRACE_SECONDS,
          // Fonnte primer → Twilio SMS cadangan; keduanya opsional (SDD §8.1).
          sender: createPhoneSenderFromEnv(env, logger),
          // Produser `notify:email` (PR-049a): pemberitahuan pasca-hapus bagi
          // akun tanpa nomor HP. Lewat antrean, bukan panggilan langsung —
          // gerbang U-02, alasannya di account.service.ts.
          queues,
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
      const community = createCommunityModule({
        prisma,
        redis: redis.queue,
        routes: routeRegistry.forModule("/api/v1"),
        auditLog,
        events,
        policy: {
          readMax: env.COMMUNITY_READ_MAX,
          writeMax: env.COMMUNITY_WRITE_MAX,
          windowMs: env.COMMUNITY_RATE_WINDOW_MS,
        },
        contentPolicy: {
          postMaxLength: env.COMMUNITY_POST_MAX_LENGTH,
          commentMaxLength: env.COMMUNITY_COMMENT_MAX_LENGTH,
          createMax: env.COMMUNITY_CREATE_MAX,
          reportMax: env.COMMUNITY_REPORT_MAX,
          windowMs: env.COMMUNITY_RATE_WINDOW_MS,
        },
      });
      app.use(community.router);
      app.use(
        createUsersModule({
          prisma,
          // PR-083 — moderasi: penangguhan mencabut SEMUA sesi akun ybs.
          cabutSemuaSesi: createSessionRevoker(prisma),
          // Kuota ekspor PDP (PR-022) — cache, bukan queue: batasnya harian dan
          // kehilangannya saat evict hanya mengembalikan jatah, bukan merusak.
          redis: redis.cache,
          routes: routeRegistry.forModule("/api/v1"),
          auditLog,
          notificationPrefs,
          // Bagian berkas ekspor dari modul lain. URUTANNYA menentukan urutan
          // key di berkas yang diunduh pengguna (agregatornya berjalan
          // berurutan), jadi disusun dari yang paling mendasar ke yang paling
          // panjang: profil karier, lalu preferensi aksesibilitas, lalu riwayat
          // notifikasi yang bisa ratusan baris. `account` selalu pertama —
          // dipasang agregatornya sendiri.
          contributors: [
            // PR-038: akun, profil karier, riwayat kerja, pendidikan, keahlian.
            profiles.exportContributor,
            // U-03: preferensi aksesibilitas. Ada untuk SETIAP pengguna sejak
            // PR-034, dan selama lima phase tidak ikut terekspor.
            accessibility.exportContributor,
            // PR-049b: preferensi kanal notifikasi. Ditulis bersama kolomnya,
            // bukan menyusul — pelajaran U-03/U-04.
            createNotificationChannelsContributor(notificationPrefs),
            // U-04: riwayat notifikasi. Utang yang dilahirkan PR-047 sendiri.
            notifications.exportContributor,
            // PR-065: transkrip AI CV Builder. Ditulis bersama tabelnya.
            ai.exportContributor,
            // U-05 (PR-066): jejak pemakaian AI — metadata biaya saja.
            ai.usageExportContributor,
            // U-25 (2026-10-01): CV — pemicunya menyala sejak PR-060.
            resumes.exportContributor,
            // PR-075: lamaran + salinan pengungkapannya — ditulis bersama
            // endpoint apply, bukan menyusul (pelajaran U-03/U-04/U-25).
            createApplicationsExport({ prisma, fieldKeys }),
            ...community.exportContributors,
          ],
        }),
      );
      app.use(accessibility.router);
      app.use(notifications.router);
      app.use(ai.router);
      app.use(profiles.router);
      // CV jalur manual (PR-060) — dirakit di atas (PR-067), dipasang di sini.
      app.use(resumes.router);
      // Dirakit SEBELUM `companies`: companies butuh `jobs.service` untuk
      // `GET /companies/:id/jobs` (PR-054/055, komunikasi antar-modul lewat
      // lapisan service — CLAUDE.md §3.2). Penerbit `job.published` +
      // `job.updated` (pelanggannya matching, PR-069) + `job.closed` (reason
      // `closed_by_admin`); `job.closed` sudah punya
      // pelanggan SISTEM sejak PR-024b (worker retention), tetapi lewat
      // proses TERPISAH (bus ini in-process, lihat core/events) — jadi tetap
      // belum ada pelanggan DI PROSES API ini.
      const jobs = createJobsModule({
        prisma,
        routes: routeRegistry.forModule("/api/v1"),
        auditLog,
        events,
      });
      app.use(jobs.router);
      // "Sederhanakan" teks lowongan (PR-087) — SESUDAH `jobs`: teksnya dibaca
      // lewat `getPublic` (lowongan aktif saja), bukan dari body permintaan.
      app.use(
        createAiSimplifyModule({
          routes: routeRegistry.forModule("/api/v1"),
          ai: aiClient,
          bacaLowongan: (id) => jobs.service.getPublic(id),
          aktif: env.AI_SIMPLIFY_ENABLED,
          logger,
        }).router,
      );
      // Apply + Disclosure Control (PR-075) — SESUDAH `jobs` dan `resumes`
      // (lowongan aktif & kepemilikan CV lewat service keduanya). Snapshot
      // pengungkapan dibaca lewat `sensitiveAccess` modul profiles (tujuan
      // `disclosure`, selalu ber-audit) dan dienkripsi dengan kunci yang SAMA.
      app.use(
        createApplicationsModule({
          prisma,
          routes: routeRegistry.forModule("/api/v1"),
          // Cache, bukan queue: kunci yang terusir hanya menurunkan "putar
          // ulang" menjadi 409 dari unique DB — tidak pernah lamaran ganda.
          redis: redis.cache,
          fieldKeys,
          auditLog,
          events,
          logger,
          jobsService: jobs.service,
          resumesService: resumes.service,
          sensitiveAccess: profiles.sensitiveAccess,
          // PR-077a: nama + kontak pelamar bagi admin — kolom milik modul users.
          identitasPelamar: (ids) =>
            createApplicantDirectory(createUserProfileRepository(prisma)).identitas(ids),
        }).router,
      );
      // Metrik pilot (PR-080) — agregat read-only, admin saja. DLQ dibaca lewat
      // QueuesService modul `internal` (sumber yang sama dengan /internal/queues).
      const statusAntrean = createQueuesService({
        registry: queues,
        dlqQueueOf: (dlqName) => dlqQueues.queueOf(dlqName),
      });
      app.use(
        createAdminModule({
          prisma,
          routes: routeRegistry.forModule("/api/v1"),
          // Cache, bukan queue: metrik yang terusir hanya dihitung ulang.
          cache: redis.cache,
          bacaDlqTotal: async () => (await statusAntrean.status()).dlqTotal,
          logger,
        }).router,
      );
      // Feed AI Job Matching (PR-073) — SESUDAH `jobs` (kartu lowongan lewat
      // service-nya). Profil dibaca lewat jalur AMAN (`findSafeByUserId`, kolom
      // sensitif tidak meninggalkan PostgreSQL); satu-satunya bacaan sensitif
      // adalah hard filter akomodasi lewat `sensitiveAccess` ber-audit (PR-071).
      const profilAman = createProfileRepository(prisma);
      const keahlian = createSkillsService(createSkillRepository(prisma), { events });
      const matching = createMatchingFeedModule({
        prisma,
        routes: routeRegistry.forModule("/api/v1"),
        queues,
        quota: aiQuota,
        // Penanda nasib re-rank — cache, boleh hilang (dibaca "tanpa AI").
        redis: redis.cache,
        logger,
        sensitiveAccess: profiles.sensitiveAccess,
        bacaProfil: async (userId) => {
          const profil = await profilAman.findSafeByUserId(userId);
          return profil === null
            ? null
            : { city: profil.city, province: profil.province, openToRemote: profil.openToRemote };
        },
        bacaKeahlian: (userId) => keahlian.listFor(userId),
        bacaLowongan: (ids) => jobs.service.bacaUntukFeed(ids),
        config: {
          efSearch: env.MATCHING_HNSW_EF_SEARCH,
          bobot: bobotDariEnv(env),
          paruhKebaruanHari: env.MATCHING_RECENCY_HALF_LIFE_DAYS,
          rerankAktif: env.MATCHING_RERANK_ENABLED,
        },
      });
      app.use(matching.router);
      if (!env.MATCHING_RERANK_ENABLED) {
        logger.warn(
          { fitur: "rerank" },
          "MATCHING_RERANK_ENABLED=false — feed memakai urutan skor + penjelasan template",
        );
      }
      // Admin-only PERTAMA di repo (PR-051) — `/companies/:id` di dalamnya
      // tetap publik (US-09); lihat komentar router modul untuk alasannya.
      app.use(
        createCompaniesModule({
          prisma,
          routes: routeRegistry.forModule("/api/v1"),
          auditLog,
          // Penerbit `company.verified`; belum ada pelanggan (core/events).
          events,
          jobsService: jobs.service,
        }).router,
      );
      // Kamus video BISINDO (PR-084, SignBridge v1) — pencarian publik +
      // CRUD admin. URL media presigned dari storage yang sama dengan PDF CV.
      app.use(
        createSignbridgeModule({
          prisma,
          routes: routeRegistry.forModule("/api/v1"),
          auditLog,
          storage: objectStorage,
        }).router,
      );
    },
  });

  // Gerbang terakhir sebelum listen: rute tanpa deklarasi akses (atau router di
  // luar registry) membuat boot GAGAL — bukan API yang menyala setengah
  // terbuka. Melempar RouteAccessError yang ditangkap index.ts lewat startApi.
  assertRoutesDeclared(api.app, routeRegistry);
  logger.info({ rute: routeRegistry.list().length }, "Deklarasi akses route lengkap");

  registerShutdownHooks(api, logger, undefined, async () => {
    // Hitungan audit agregat (PR-039) ditulis SEBELUM koneksi ditutup —
    // sesudahnya tidak ada lagi yang bisa menuliskannya. Penulisannya sendiri
    // fire-and-forget seperti seluruh audit lain (core/audit), jadi proses yang
    // dibunuh paksa tetap kehilangannya; yang dijaga di sini adalah berhenti
    // dengan tertib, bukan berhenti mendadak.
    const tertahan = profiles.sensitiveAccess.tertahan();
    if (tertahan > 0) {
      profiles.sensitiveAccess.flushAudit();
      logger.info({ tertahan }, "Audit akses sensitif teragregasi ditulis saat shutdown");
    }

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
