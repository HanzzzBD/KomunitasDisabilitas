// modules/admin — wiring modul (DI manual via factory, ADR-002).
//
// Modul resmi ke-13 (SDD §5.1: "internal ops, analytics"). Lahir di PR-080
// dengan satu tanggung jawab: metrik agregat pilot. Operasi admin atas
// entitas domain (perusahaan, lowongan, lamaran) TETAP di modul domainnya —
// preseden PR-051/PR-077a; modul ini hanya MEMBACA agregat.
import type { Router } from "express";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AppPrisma } from "../../core/db/index.js";
import type { Logger } from "../../core/logger/index.js";
import { createMetricsRepository } from "./repositories/metrics.repository.js";
import { createMetricsService, type MetricsCacheLike } from "./services/metrics.service.js";
import { createMetricsController } from "./controllers/metrics.controller.js";
import { createAdminRouter } from "./routers/index.js";

export interface AdminModuleDeps {
  prisma: AppPrisma;
  routes: RouteRegistrar;
  /** Redis CACHE (allkeys-lru) — metrik yang terusir hanya dihitung ulang. */
  cache: MetricsCacheLike;
  /** Total DLQ seluruh antrean — dari `internal` QueuesService. */
  bacaDlqTotal(): Promise<number>;
  logger: Pick<Logger, "warn">;
  clock?: () => Date;
}

export function createAdminModule(deps: AdminModuleDeps): { router: Router } {
  const service = createMetricsService({
    repo: createMetricsRepository(deps.prisma),
    cache: deps.cache,
    bacaDlqTotal: deps.bacaDlqTotal,
    logger: deps.logger,
    clock: deps.clock,
  });
  return { router: createAdminRouter({ metrics: createMetricsController(service) }, deps.routes) };
}

export {
  createMetricsService,
  jendelaAi,
  jendelaDari,
  kunciCache,
  METRICS_POLICY,
  type MetricsService,
} from "./services/metrics.service.js";
export {
  createMetricsRepository,
  kueriAiUsage,
  kueriFunnel,
  kueriNorthStar,
  type JendelaMetrik,
} from "./repositories/metrics.repository.js";
