// modules/companies — wiring modul (DI manual via factory, ADR-002).
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { EventBus } from "../../core/events/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import { createCompaniesRepository } from "./repositories/companies.repository.js";
import { createCompaniesService } from "./services/companies.service.js";
import { createCompaniesController } from "./controllers/companies.controller.js";
import { createCompaniesRouter } from "./routers/index.js";

export interface CompaniesModuleDeps {
  prisma: AppPrisma;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  auditLog: AuditLog;
  /** Penerbit `company.verified` (PR-051); belum ada pelanggan (core/events). */
  events: EventBus;
  clock?: () => Date;
}

export interface CompaniesModule {
  router: Router;
}

export function createCompaniesModule(deps: CompaniesModuleDeps): CompaniesModule {
  const service = createCompaniesService({
    companiesRepository: createCompaniesRepository(deps.prisma),
    auditLog: deps.auditLog,
    events: deps.events,
    clock: deps.clock,
  });
  const router = createCompaniesRouter(createCompaniesController(service), deps.routes);

  return { router };
}

export {
  createCompaniesRepository,
  type CompaniesRepository,
  type CompanyCreateData,
  type CompanyRow,
  type CompanyUpdatePatch,
} from "./repositories/companies.repository.js";
export {
  AUDIT_ENTITY,
  createCompaniesService,
  type CompaniesActor,
  type CompaniesService,
  type CompaniesServiceDeps,
} from "./services/companies.service.js";
export { createCompaniesController, type CompaniesController } from "./controllers/companies.controller.js";
export { createCompaniesRouter } from "./routers/index.js";
