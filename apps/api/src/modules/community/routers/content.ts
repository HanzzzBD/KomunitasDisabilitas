import {
  communityIdParamsSchema,
  communityTargetParamsSchema,
  communityReasonInputSchema,
  communityModerationInputSchema,
  communityReportListQuerySchema,
  emptyCommunityMutationSchema,
  paginationQuerySchema,
  createCommunityContentSchemas,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { CommunityController } from "../controllers/community.controller.js";
import type { CommunityContentController } from "../controllers/content.controller.js";

export function registerCommunityContent(
  c: CommunityContentController,
  common: CommunityController,
  routes: RouteRegistrar,
  policy: { postMaxLength: number; commentMaxLength: number },
) {
  const schemas = createCommunityContentSchemas(policy);
  const ids = communityIdParamsSchema;
  routes.post(
    "/communities/:id/posts",
    access.authenticated(),
    c.createLimit,
    validate({ params: ids, body: schemas.post }),
    asyncHandler(c.createPost),
  );
  routes.get(
    "/community-posts/:id",
    access.authenticated(),
    common.readLimit,
    validate({ params: ids }),
    asyncHandler(c.post),
  );
  routes.patch(
    "/community-posts/:id",
    access.authenticated(),
    common.writeLimit,
    validate({ params: ids, body: schemas.post }),
    asyncHandler(c.editPost),
  );
  routes.delete(
    "/community-posts/:id",
    access.authenticated(),
    common.writeLimit,
    validate({ params: ids, body: emptyCommunityMutationSchema }),
    asyncHandler(c.erasePost),
  );
  routes.get(
    "/community-posts/:id/comments",
    access.authenticated(),
    common.readLimit,
    validate({ params: ids, query: paginationQuerySchema.strict() }),
    asyncHandler(c.comments),
  );
  routes.post(
    "/community-posts/:id/comments",
    access.authenticated(),
    c.createLimit,
    validate({ params: ids, body: schemas.comment }),
    asyncHandler(c.createComment),
  );
  routes.get(
    "/community-comments/:id",
    access.authenticated(),
    common.readLimit,
    validate({ params: ids }),
    asyncHandler(c.comment),
  );
  routes.patch(
    "/community-comments/:id",
    access.authenticated(),
    common.writeLimit,
    validate({ params: ids, body: schemas.comment }),
    asyncHandler(c.editComment),
  );
  routes.delete(
    "/community-comments/:id",
    access.authenticated(),
    common.writeLimit,
    validate({ params: ids, body: emptyCommunityMutationSchema }),
    asyncHandler(c.eraseComment),
  );
  routes.post(
    "/community-content/:targetType/:targetId/reports",
    access.authenticated(),
    c.reportLimit,
    validate({ params: communityTargetParamsSchema, body: communityReasonInputSchema }),
    asyncHandler(c.report),
  );
  routes.get(
    "/admin/community-content/:targetType/:targetId",
    access.role("admin"),
    common.readLimit,
    validate({ params: communityTargetParamsSchema }),
    asyncHandler(c.adminContent),
  );
  routes.post(
    "/admin/community-content/:targetType/:targetId/moderate",
    access.role("admin"),
    common.writeLimit,
    validate({ params: communityTargetParamsSchema, body: communityModerationInputSchema }),
    asyncHandler(c.moderate),
  );
  routes.get(
    "/admin/community-reports",
    access.role("admin"),
    common.readLimit,
    validate({ query: communityReportListQuerySchema }),
    asyncHandler(c.reports),
  );
  routes.post(
    "/admin/community-reports/:id/reject",
    access.role("admin"),
    common.writeLimit,
    validate({ params: ids, body: communityReasonInputSchema }),
    asyncHandler(c.reject),
  );
}
