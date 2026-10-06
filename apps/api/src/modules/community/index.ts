import type { AppPrisma } from "../../core/db/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import type { EventBus } from "../../core/events/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import { createCommunityRepository } from "./repositories/community.repository.js";
import {
  createCommunityRateRepository,
  type CommunityRedis,
} from "./repositories/rate-limit.repository.js";
import { createCommunityService, type CommunityPolicy } from "./services/community.service.js";
import { createCommunityMembershipExport } from "./services/membership-export.service.js";
import { createCommunityController } from "./controllers/community.controller.js";
import { createCommunityRouter } from "./routers/index.js";

export function createCommunityModule(deps: {
  prisma: AppPrisma;
  redis: CommunityRedis;
  routes: RouteRegistrar;
  auditLog: AuditLog;
  events: EventBus;
  policy?: CommunityPolicy;
}) {
  const repository = createCommunityRepository(deps.prisma);
  const service = createCommunityService({
    ...deps,
    repository,
    rate: createCommunityRateRepository(deps.redis),
  });
  return {
    router: createCommunityRouter(createCommunityController(service), deps.routes),
    service,
    exportContributor: createCommunityMembershipExport(repository),
  };
}
