// modules/users — wiring modul (DI manual via factory, ADR-002).
//
// Berbeda dengan modul `auth`, modul ini tidak punya mode "tertutup": profil
// akun tidak bergantung pada kredensial eksternal apa pun. Yang menjaganya
// adalah guard sesi dari registrar — bila kunci RS256 belum di-set, kedua route
// menjawab 503 lewat `requireAuth`, bukan lewat cabang khusus di sini.
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
import { createUsersRouter } from "./routers/index.js";

export interface UsersModuleDeps {
  prisma: AppPrisma;
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
}

export function createUsersModule(deps: UsersModuleDeps): Router {
  const userRepository = createUserProfileRepository(deps.prisma);

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
export { createUsersService, type UsersActor, type UsersService } from "./services/users.service.js";
export {
  createAccountContributor,
  createExportService,
  EXPORT_POLICY,
  type ExportContributor,
  type ExportService,
} from "./services/export.service.js";
