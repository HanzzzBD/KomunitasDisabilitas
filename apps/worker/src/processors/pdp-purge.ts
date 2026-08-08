// apps/worker — processor `maintenance-pdp-purge` (PR-023, SDD §16).
//
// ADAPTER, BUKAN LOGIKA. Yang ada di sini hanya tiga hal: memvalidasi payload,
// memanggil service, dan menuliskan hasilnya ke log. Aturan siapa yang dipurge
// dan bagaimana tinggal di `modules/users/services/purge.service.ts` — worker
// adalah entry point, dan aturan bisnis yang tinggal di entry point tidak
// pernah punya test, tidak pernah punya batas modul, dan tidak pernah dipakai
// ulang.
import { pdpPurgeJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { AuditLog } from "@nawasena/api/core/audit";
import type { AppPrisma } from "@nawasena/api/core/db";
import { createPurgeService } from "@nawasena/api/modules/users";
import type { Logger } from "@nawasena/api/core/logger";

export interface PdpPurgeProcessorDeps {
  prisma: AppPrisma;
  auditLog: AuditLog;
  logger: Pick<Logger, "info" | "warn">;
}

export function createPdpPurgeProcessor(deps: PdpPurgeProcessorDeps): JobProcessor {
  const service = createPurgeService({ prisma: deps.prisma, auditLog: deps.auditLog });

  return async (payload) => {
    // Payload cron datang tanpa isi; `default(false)` di skema yang menjadikan
    // run terjadwal selalu penghapusan sungguhan, bukan dry-run diam-diam.
    const { dryRun } = pdpPurgeJobSchema.parse(payload ?? {});
    const laporan = await service.run({ dryRun });

    // Log run SELALU ditulis, termasuk saat tidak ada kandidat: "job berjalan
    // dan tidak menemukan apa-apa" dan "job tidak berjalan sama sekali" adalah
    // dua keadaan yang sangat berbeda, dan tanpa baris ini keduanya terlihat
    // persis sama di log.
    deps.logger.info({ ...laporan }, dryRun ? "Dry-run purge PDP selesai" : "Purge PDP selesai");

    // Sisa kandidat bukan kegagalan — batas per run memang disengaja — tetapi
    // backlog yang tidak pernah habis berarti janji 30 hari mulai meleset.
    if (laporan.hasMore) {
      deps.logger.warn(
        { accounts: laporan.accounts },
        "Masih ada kandidat purge di luar batas run — periksa apakah backlog menyusut",
      );
    }

    return laporan;
  };
}
