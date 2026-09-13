// modules/jobs — wiring modul (DI manual via factory, ADR-002).
//
// Lahir PARSIAL di PR-024b (lapisan service saja: penutupan otomatis). PR-055
// melengkapinya dengan router/controller/repository dan `createJobsModule()` —
// pertama kalinya modul ini punya route sungguhan.
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { EventBus } from "../../core/events/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import { createJobsRepository } from "./repositories/jobs.repository.js";
import { createJobsService } from "./services/jobs.service.js";
import { createJobsController } from "./controllers/jobs.controller.js";
import { createJobsRouter } from "./routers/index.js";

export interface JobsModuleDeps {
  prisma: AppPrisma;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  auditLog: AuditLog;
  /** Penerbit `job.published`/`job.closed`; pelanggan menyusul (lihat core/events). */
  events: EventBus;
  clock?: () => Date;
}

export interface JobsModule {
  router: Router;
  /** Diekspos untuk modul lain (`companies`) — komunikasi antar-modul lewat lapisan service. */
  service: ReturnType<typeof createJobsService>;
}

export function createJobsModule(deps: JobsModuleDeps): JobsModule {
  const service = createJobsService({
    jobsRepository: createJobsRepository(deps.prisma),
    auditLog: deps.auditLog,
    events: deps.events,
    clock: deps.clock,
  });
  const router = createJobsRouter(createJobsController(service), deps.routes);

  return { router, service };
}

export {
  createJobsRepository,
  type JobCreateData,
  type JobCreateResult,
  type JobDeleteResult,
  type JobRow,
  type JobUpdatePatch,
  type JobsRepository,
} from "./repositories/jobs.repository.js";
export {
  AUDIT_ENTITY,
  createJobsService,
  type JobsActor,
  type JobsService,
  type JobsServiceDeps,
} from "./services/jobs.service.js";
export { createJobsController, type JobsController } from "./controllers/jobs.controller.js";
export { createJobsRouter } from "./routers/index.js";

// Lapisan service PR-024b (penutupan otomatis lowongan kedaluwarsa) — TIDAK
// bagian dari `createJobsModule()`: penerbitnya adalah job terjadwal worker,
// bukan route HTTP.
export {
  createJobExpiryService,
  type JobExpiryLimits,
  type JobExpiryReport,
  type JobExpiryService,
} from "./services/expiry.service.js";
