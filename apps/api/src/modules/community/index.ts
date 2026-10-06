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
import { createCommunityContentRepository } from "./repositories/content.repository.js";
import {
  createCommunityContentService,
  type CommunityContentPolicy,
} from "./services/content.service.js";
import { createCommunityContentController } from "./controllers/content.controller.js";
import { registerCommunityContent } from "./routers/content.js";
import { createCommunityContentExports } from "./services/content-export.service.js";
import { createCommunityAdminRepository } from "./repositories/admin.repository.js";
import { createCommunityAdminService } from "./services/admin.service.js";
import { createCommunityAdminController } from "./controllers/admin.controller.js";
import { registerCommunityAdmin } from "./routers/admin.js";

export function createCommunityModule(deps: {
  prisma: AppPrisma;
  redis: CommunityRedis;
  routes: RouteRegistrar;
  auditLog: AuditLog;
  events: EventBus;
  policy?: CommunityPolicy;
  contentPolicy?: CommunityContentPolicy;
}) {
  const repository = createCommunityRepository(deps.prisma);
  const service = createCommunityService({
    ...deps,
    repository,
    rate: createCommunityRateRepository(deps.redis),
  });
  const contentRepository = createCommunityContentRepository(deps.prisma, repository);
  const content = createCommunityContentService({
    repository: contentRepository,
    rate: createCommunityRateRepository(deps.redis),
    events: deps.events,
    policy: deps.contentPolicy,
  });
  const controller = createCommunityController(service);
  const router = createCommunityRouter(controller, deps.routes);
  registerCommunityAdmin(
    createCommunityAdminController(
      createCommunityAdminService(createCommunityAdminRepository(deps.prisma), content),
    ),
    controller,
    deps.routes,
  );
  registerCommunityContent(
    createCommunityContentController(content),
    controller,
    deps.routes,
    content.policy,
  );
  return {
    router,
    service,
    content,
    exportContributors: [
      createCommunityMembershipExport(repository),
      ...createCommunityContentExports(contentRepository),
    ],
    exportContributor: createCommunityMembershipExport(repository),
  };
}
