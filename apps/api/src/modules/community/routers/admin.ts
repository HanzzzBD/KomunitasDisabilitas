import {
  communityIdParamsSchema,
  communityReportListQuerySchema,
  communityReasonInputSchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { CommunityController } from "../controllers/community.controller.js";
import type { createCommunityAdminController } from "../controllers/admin.controller.js";
export function registerCommunityAdmin(
  c: ReturnType<typeof createCommunityAdminController>,
  common: CommunityController,
  routes: RouteRegistrar,
) {
  routes.get(
    "/admin/community-queue",
    access.role("admin"),
    common.readLimit,
    validate({ query: communityReportListQuerySchema }),
    asyncHandler(c.queue),
  );
  routes.get(
    "/admin/community-queue/:id",
    access.role("admin"),
    common.readLimit,
    validate({ params: communityIdParamsSchema }),
    asyncHandler(c.report),
  );
  routes.get(
    "/admin/community-metrics",
    access.role("admin"),
    common.readLimit,
    asyncHandler(c.metrics),
  );
  routes.post(
    "/admin/community-queue/:id/reject",
    access.role("admin"),
    common.writeLimit,
    validate({ params: communityIdParamsSchema, body: communityReasonInputSchema }),
    asyncHandler(c.reject),
  );
}
