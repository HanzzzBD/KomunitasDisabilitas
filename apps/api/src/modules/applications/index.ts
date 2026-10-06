// modules/applications — wiring modul (DI manual via factory, ADR-002).
//
// Lahir di PR-075 (apply + Disclosure Control). Status pipeline (PR-076) dan
// jalur admin (PR-077) menyusul di modul yang sama.
//
// Tiga modul lain disentuh LEWAT SERVICE-NYA, disuntik composition root
// (ADR-001): `jobs` (lowongan aktif), `resumes` (kepemilikan CV), dan `profiles`
// (pembacaan sensitif ber-audit untuk snapshot pengungkapan).
import type { Router } from "express";
import type { Resume, SeekerProfile } from "@nawasena/schemas";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import type { EventBus } from "../../core/events/index.js";
import type { Logger } from "../../core/logger/index.js";
import { createFieldCrypto, type FieldKeys } from "../../core/crypto/index.js";
import { createApplicationsRepository } from "./repositories/applications.repository.js";
import {
  createIdempotensiRepository,
  type ApplyRedisLike,
} from "./repositories/idempotensi.repository.js";
import {
  ALASAN_AKSES_PENGUNGKAPAN,
  createApplyService,
  type ApplicationsActor,
} from "./services/apply.service.js";
import { createApplyController } from "./controllers/apply.controller.js";
import { createStatusController } from "./controllers/status.controller.js";
import { createStatusService, type RingkasanLowongan } from "./services/status.service.js";
import { createPemetaLamaran } from "./services/pemeta-lamaran.js";
import { createAdminApplicationsService } from "./services/admin-applications.service.js";
import { createAdminApplicationsController } from "./controllers/admin-applications.controller.js";
import { createApplicationsRouter } from "./routers/index.js";
import { createApplicationsExportContributor } from "./services/application-export.service.js";

export interface ApplicationsModuleDeps {
  prisma: AppPrisma;
  routes: RouteRegistrar;
  /** `redis.cache` — Idempotency-Key + batas laju (lihat idempotensi.repository.ts). */
  redis: ApplyRedisLike;
  /** Kunci yang SAMA dengan modul profiles — snapshot memakai format ADR-007. */
  fieldKeys: FieldKeys;
  auditLog: AuditLog;
  /** Penerbit `application.submitted`; pelanggannya modul notifications. */
  events: Pick<EventBus, "emit">;
  logger: Pick<Logger, "warn" | "error">;
  jobsService: {
    getPublic(id: string): Promise<unknown>;
    /** PR-076 — judul & perusahaan untuk "Lamaran Saya", termasuk lowongan tutup. */
    ringkasanUntukLamaran(ids: readonly string[]): Promise<RingkasanLowongan[]>;
  };
  /** `get` menyaring pemilik dari `actor.userId` — admin memakainya atas nama pelamar. */
  resumesService: { get(actor: { userId: string }, id: string): Promise<Resume> };
  /** Modul users — identitas + kontak pelamar aktif (PR-077a). */
  identitasPelamar(
    ids: readonly string[],
  ): Promise<Array<{ id: string; fullName: string; phone: string | null; email: string | null }>>;
  sensitiveAccess: {
    bacaSensitif(
      actor: ApplicationsActor,
      targetUserId: string,
      opsi: { purpose: "disclosure"; reason: string },
    ): Promise<SeekerProfile | null>;
  };
  clock?: () => Date;
}

export function createApplicationsModule(deps: ApplicationsModuleDeps): {
  router: Router;
  management: ReturnType<typeof createAdminApplicationsService>;
} {
  const repo = createApplicationsRepository(deps.prisma);
  const service = createApplyService({
    applicationsRepository: repo,
    idempotensi: createIdempotensiRepository(deps.redis),
    crypto: createFieldCrypto(deps.fieldKeys),
    auditLog: deps.auditLog,
    events: deps.events,
    logger: deps.logger,
    clock: deps.clock,
    pastikanLowonganAktif: async (jobId) => {
      await deps.jobsService.getPublic(jobId);
    },
    pastikanCvMilik: async (actor, resumeId) => {
      await deps.resumesService.get(actor, resumeId);
    },
    // Pelaku = targetnya = pelamar sendiri, tetapi TETAP lewat `bacaSensitif`
    // (bukan `snapshotFor`): ini pengungkapan ke pihak lain, dan pertanyaan
    // "kapan data ini pernah diserahkan ke perusahaan?" harus terjawab di
    // audit_logs. Pola yang sama dengan pembaca akomodasi matching (PR-071).
    bacaProfilUntukPengungkapan: (actor) =>
      deps.sensitiveAccess.bacaSensitif(actor, actor.userId, {
        purpose: "disclosure",
        reason: ALASAN_AKSES_PENGUNGKAPAN,
      }),
  });

  // Penerbit `application.status_changed` + `application.hired_confirmed`
  // (pelanggannya modul notifications) — bus yang sama dengan apply.
  const status = createStatusService({
    applicationsRepository: repo,
    ringkasanLowongan: (ids) => deps.jobsService.ringkasanUntukLamaran(ids),
    auditLog: deps.auditLog,
    events: deps.events,
    logger: deps.logger,
    clock: deps.clock,
  });

  const admin = createAdminApplicationsService({
    applicationsRepository: repo,
    pemeta: createPemetaLamaran({
      ringkasanLowongan: (ids) => deps.jobsService.ringkasanUntukLamaran(ids),
      logger: deps.logger,
    }),
    identitas: (ids) => deps.identitasPelamar(ids),
    bacaCv: (userId, resumeId) => deps.resumesService.get({ userId }, resumeId),
    crypto: createFieldCrypto(deps.fieldKeys),
    auditLog: deps.auditLog,
    events: deps.events,
    clock: deps.clock,
  });

  return {
    management: admin,
    router: createApplicationsRouter(
      {
        apply: createApplyController(service),
        status: createStatusController(status),
        admin: createAdminApplicationsController(admin),
      },
      deps.routes,
    ),
  };
}

/**
 * Bagian `applications` berkas ekspor PDP. Dirakit TERPISAH dari modul (yang
 * membutuhkan `jobs.service` dan karena itu lahir di dalam callback routes):
 * agregator ekspor modul `users` dirakit lebih dulu, dan kontributor ini hanya
 * butuh tabelnya sendiri plus kunci enkripsi yang sama.
 */
export function createApplicationsExport(
  deps: Pick<ApplicationsModuleDeps, "prisma" | "fieldKeys">,
) {
  return createApplicationsExportContributor({
    repo: createApplicationsRepository(deps.prisma),
    crypto: createFieldCrypto(deps.fieldKeys),
  });
}

export { createApplicationsExportContributor };
export {
  createApplicationsRepository,
  SudahMelamarError,
  type ApplicationBaru,
  type ApplicationDetailRow,
  type ApplicationExportRow,
  type ApplicationRow,
  type ApplicationsRepository,
} from "./repositories/applications.repository.js";
export {
  createIdempotensiRepository,
  type ApplyRedisLike,
  type CatatanIdempotensi,
  type IdempotensiRepository,
} from "./repositories/idempotensi.repository.js";
export {
  ALASAN_AKSES_PENGUNGKAPAN,
  APPLY_POLICY,
  AUDIT_ENTITY,
  createApplyService,
  type ApplicationsActor,
  type ApplyService,
  type ApplyServiceDeps,
  type HasilApply,
} from "./services/apply.service.js";
export { createApplyController, type ApplyController } from "./controllers/apply.controller.js";
export { createStatusController, type StatusController } from "./controllers/status.controller.js";
export {
  createAdminApplicationsController,
  type AdminApplicationsController,
} from "./controllers/admin-applications.controller.js";
export {
  createAdminApplicationsService,
  type AdminActor,
  type AdminApplicationsService,
  type AdminApplicationsServiceDeps,
} from "./services/admin-applications.service.js";
export { createPemetaLamaran, type PemetaLamaran } from "./services/pemeta-lamaran.js";
export {
  createStatusService,
  type RingkasanLowongan,
  type StatusService,
  type StatusServiceDeps,
} from "./services/status.service.js";
export {
  ALUR_STATUS,
  STATUS_AKHIR,
  bolehPindah,
  statusAktif,
  type PeranPemindah,
} from "./services/status-machine.js";
export { createApplicationsRouter } from "./routers/index.js";
