// apps/worker — processor `maintenance-retention` (PR-024a, SDD §6.4).
//
// ADAPTER. Sama seperti pdp-purge: validasi payload, rakit kebijakan, panggil
// mesin, tulis log. Aturan umur tinggal di modul pemilik tabelnya — yang untuk
// `refresh_tokens` berarti modul auth, sebab ambangnya adalah jendela deteksi
// reuse dan bukan setelan storage.
import { retentionJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { AuditLog } from "@nawasena/api/core/audit";
import type { AppPrisma } from "@nawasena/api/core/db";
import type { Env } from "@nawasena/api/core/config";
import type { Logger } from "@nawasena/api/core/logger";
import type { EventBus } from "@nawasena/api/core/events";
import { createRefreshTokenPolicies, createRefreshTokenRepository } from "@nawasena/api/modules/auth";
import { createOrphanPolicies, createRetentionService } from "@nawasena/api/modules/users";
import { createJobExpiryService } from "@nawasena/api/modules/jobs";

export interface RetentionProcessorDeps {
  prisma: AppPrisma;
  auditLog: AuditLog;
  events: EventBus;
  logger: Pick<Logger, "info" | "warn">;
  env: Pick<
    Env,
    | "RETENTION_REFRESH_EXPIRED_DAYS"
    | "RETENTION_REFRESH_REVOKED_DAYS"
    | "RETENTION_REFRESH_REUSE_DAYS"
    | "RETENTION_MATCH_SCORES_DAYS"
    | "RETENTION_AI_USAGE_DAYS"
    | "RETENTION_BATCH_SIZE"
    | "RETENTION_MAX_PER_RUN"
  >;
}

export function createRetentionProcessor(deps: RetentionProcessorDeps): JobProcessor {
  const { prisma, env } = deps;

  const service = createRetentionService({
    prisma,
    policies: [
      ...createRefreshTokenPolicies({
        repository: createRefreshTokenRepository(prisma),
        days: {
          expired: env.RETENTION_REFRESH_EXPIRED_DAYS,
          revoked: env.RETENTION_REFRESH_REVOKED_DAYS,
          reuse: env.RETENTION_REFRESH_REUSE_DAYS,
        },
      }),
      ...createOrphanPolicies({
        prisma,
        matchScoresDays: env.RETENTION_MATCH_SCORES_DAYS,
        aiUsageDays: env.RETENTION_AI_USAGE_DAYS,
      }),
    ],
    limits: { batchSize: env.RETENTION_BATCH_SIZE, maxPerRun: env.RETENTION_MAX_PER_RUN },
    auditLog: deps.auditLog,
  });

  // Penutupan lowongan kedaluwarsa (PR-024b) menumpang cron yang SAMA: keduanya
  // kebersihan harian, dan jadwal kedua hanya menambah satu hal lagi yang bisa
  // menyimpang tanpa alasan. Laporannya tetap terpisah — "berapa baris dihapus"
  // dan "berapa lowongan ditutup" adalah dua pertanyaan berbeda.
  const expiry = createJobExpiryService({
    prisma,
    events: deps.events,
    auditLog: deps.auditLog,
    limits: { batchSize: env.RETENTION_BATCH_SIZE, maxPerRun: env.RETENTION_MAX_PER_RUN },
  });

  return async (payload) => {
    const { dryRun } = retentionJobSchema.parse(payload ?? {});
    const laporan = await service.run({ dryRun });
    // SETELAH retensi: penutupan menulis ke `jobs`, yang tidak disentuh
    // kebijakan mana pun — urutannya bebas, dan yang dipilih adalah yang
    // membuat log terbaca sesuai urutan sebab-akibat.
    const lowongan = await expiry.run({ dryRun });

    deps.logger.info(
      {
        dryRun: laporan.dryRun,
        monthsAggregated: laporan.monthsAggregated,
        deleted: laporan.deleted,
        remaining: laporan.remaining,
        // Rincian per kebijakan: "refresh_tokens berkurang 40.000 baris" tidak
        // memberi tahu apakah yang hilang sampah rotasi atau bukti insiden.
        policies: laporan.policies,
        jobsClosed: lowongan.closed,
        jobsRemaining: lowongan.remaining,
      },
      dryRun ? "Dry-run retensi selesai" : "Retensi selesai",
    );

    // Sisa yang tidak menyusut dari hari ke hari berarti tabel tumbuh lebih
    // cepat daripada yang dibersihkan — satu-satunya cara melihatnya adalah
    // membandingkan angka ini antar-run.
    const tertinggal = laporan.policies.filter((p) => p.remaining > 0);
    if (tertinggal.length > 0) {
      deps.logger.warn(
        { policies: tertinggal },
        "Masih ada baris di luar batas run — periksa apakah sisanya menyusut",
      );
    }

    return { ...laporan, jobs: lowongan };
  };
}
