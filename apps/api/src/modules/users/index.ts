// modules/users — wiring modul (DI manual via factory, ADR-002).
//
// Berbeda dengan modul `auth`, modul ini tidak punya mode "tertutup": profil
// akun tidak bergantung pada kredensial eksternal apa pun. Yang menjaganya
// adalah guard sesi dari registrar — bila kunci RS256 belum di-set, kedua route
// menjawab 503 lewat `requireAuth`, bukan lewat cabang khusus di sini.
import { createModerationRepository } from "./repositories/moderation.repository.js";
import { createModerationService } from "./services/moderation.service.js";
import { createModerationController } from "./controllers/moderation.controller.js";
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import { createUserProfileRepository } from "./repositories/user.repository.js";
import {
  createExportQuotaRepository,
  type ExportRedisLike,
} from "./repositories/export-quota.repository.js";
import { createUsersService } from "./services/users.service.js";
import {
  createAccountContributor,
  createExportService,
  type ExportContributor,
} from "./services/export.service.js";
import { createUsersController } from "./controllers/users.controller.js";
import type { NotificationPrefsService } from "./services/notification-prefs.service.js";
import { createUsersRouter, daftarkanRuteModerasi } from "./routers/index.js";

export interface UsersModuleDeps {
  prisma: AppPrisma;
  /**
   * Pencabut semua sesi satu akun (`createSessionRevoker` modul auth, PR-083).
   * Tanpa ini rute moderasi `/admin/users*` TIDAK didaftarkan.
   */
  cabutSemuaSesi?: (userId: string) => Promise<void>;
  /** Klien Redis CACHE — kuota ekspor boleh hilang saat evict (batasnya harian). */
  redis: ExportRedisLike;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  auditLog: AuditLog;
  /**
   * Bagian ekspor dari modul LAIN (PR-022). Kosong hari ini: tidak ada modul
   * lain yang menyimpan data pengguna. Saat `profiles`/`resumes`/`applications`
   * lahir, mereka menyerahkan kontributornya lewat sini — bukan lewat
   * repository yang di-import agregator, yang akan melanggar batas modul.
   */
  contributors?: readonly ExportContributor[];
  /**
   * Preferensi kanal notifikasi (PR-049b). Dirakit di composition root, bukan di
   * sini, sebab PEMBACANYA ada dua: endpoint `/me/notification-prefs` di modul
   * ini, dan produser job email di modul `notifications`. Merakitnya di dalam
   * salah satu modul lalu menyerahkannya ke modul lain akan membuat keduanya
   * saling membutuhkan — modul `users` sudah menerima kontributor ekspor DARI
   * `notifications`, jadi arah sebaliknya menutup lingkaran.
   */
  notificationPrefs: NotificationPrefsService;
}

export function createUsersModule(deps: UsersModuleDeps): Router {
  const userRepository = createUserProfileRepository(deps.prisma);

  // PR-083 — moderasi akun admin. Opsional supaya perakitan test lama yang
  // tidak menyentuh moderasi tidak dipaksa menyediakan pencabut sesi.
  if (deps.cabutSemuaSesi !== undefined) {
    daftarkanRuteModerasi(
      createModerationController(
        createModerationService({
          repo: createModerationRepository(deps.prisma),
          auditLog: deps.auditLog,
          cabutSemuaSesi: deps.cabutSemuaSesi,
        }),
      ),
      deps.routes,
    );
  }

  return createUsersRouter(
    createUsersController(
      createUsersService({ userRepository, auditLog: deps.auditLog }),
      createExportService({
        // `account` selalu pertama: pembaca berkas menemukan identitas
        // pemiliknya di baris paling atas, bukan setelah menggulir data lain.
        contributors: [createAccountContributor(userRepository), ...(deps.contributors ?? [])],
        quotaRepository: createExportQuotaRepository(deps.redis),
        auditLog: deps.auditLog,
      }),
      deps.notificationPrefs,
    ),
    deps.routes,
  );
}

export {
  createUserProfileRepository,
  EmailSudahDipakaiError,
  type ExportAccountRow,
  type UserProfileRepository,
  type UserProfileRow,
} from "./repositories/user.repository.js";
export {
  createExportQuotaRepository,
  type ExportQuotaRepository,
  type ExportRedisLike,
} from "./repositories/export-quota.repository.js";
export {
  createUsersService,
  type UsersActor,
  type UsersService,
} from "./services/users.service.js";
export {
  createAccountContributor,
  createExportService,
  createNotificationChannelsContributor,
  EXPORT_POLICY,
  type ExportContributor,
  type ExportService,
} from "./services/export.service.js";
export {
  createPurgeService,
  kandidatWhere,
  PURGE_POLICY,
  TABEL_DIHAPUS,
  type PurgeService,
} from "./services/purge.service.js";
export { COMMUNITY_PURGE_MODELS } from "./services/community-purge.js";
export {
  createOrphanPolicies,
  createRetentionService,
  type RetentionLimits,
  type RetentionPolicy,
  type RetentionService,
} from "./services/retention.service.js";
export {
  createNotificationPrefsService,
  uraiPrefs,
  type NotificationPrefsActor,
  type NotificationPrefsService,
  type NotificationPrefsServiceDeps,
} from "./services/notification-prefs.service.js";
export {
  createAdminDirectory,
  createApplicantDirectory,
  type AdminDirectory,
  type ApplicantDirectory,
} from "./services/admin-directory.service.js";

export { createEmployerEnrollment } from "./services/employer-enrollment.service.js";
