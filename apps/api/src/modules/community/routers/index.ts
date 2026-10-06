import {
  communityFeedQuerySchema,
  communityIdParamsSchema,
  communityListQuerySchema,
  communityAdminListQuerySchema,
  communitySlugParamsSchema,
  createCommunitySchema,
  emptyCommunityMutationSchema,
  updateCommunitySchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { CommunityController } from "../controllers/community.controller.js";

export function createCommunityRouter(c: CommunityController, routes: RouteRegistrar) {
  const publicRead = () =>
    access.public(
      "Daftar dan deskripsi ruang dapat ditelusuri sebelum masuk; isi diskusi memerlukan sesi",
    );
  routes.get(
    "/communities",
    publicRead(),
    c.readLimit,
    validate({ query: communityListQuerySchema }),
    asyncHandler(c.list),
  );
  routes.get(
    "/communities/:id/posts",
    access.authenticated(),
    c.readLimit,
    validate({ params: communityIdParamsSchema, query: communityFeedQuerySchema }),
    asyncHandler(c.feed),
  );
  routes.get(
    "/communities/:id/membership",
    access.authenticated(),
    c.readLimit,
    validate({ params: communityIdParamsSchema }),
    asyncHandler(c.membership),
  );
  routes.post(
    "/communities/:id/join",
    access.authenticated(),
    c.writeLimit,
    validate({ params: communityIdParamsSchema, body: emptyCommunityMutationSchema }),
    asyncHandler(c.join),
  );
  routes.delete(
    "/communities/:id/membership",
    access.authenticated(),
    c.writeLimit,
    validate({ params: communityIdParamsSchema, body: emptyCommunityMutationSchema }),
    asyncHandler(c.leave),
  );
  routes.get(
    "/communities/by-id/:id",
    publicRead(),
    c.readLimit,
    validate({ params: communityIdParamsSchema }),
    asyncHandler(c.detailById),
  );
  routes.get(
    "/communities/:slug",
    publicRead(),
    c.readLimit,
    validate({ params: communitySlugParamsSchema }),
    asyncHandler(c.detail),
  );
  routes.get(
    "/admin/communities",
    access.role("admin"),
    c.readLimit,
    validate({ query: communityAdminListQuerySchema }),
    asyncHandler(c.listAdmin),
  );
  routes.get(
    "/admin/communities/:id",
    access.role("admin"),
    c.readLimit,
    validate({ params: communityIdParamsSchema }),
    asyncHandler(c.detailAdmin),
  );
  routes.post(
    "/admin/communities",
    access.role("admin"),
    c.writeLimit,
    validate({ body: createCommunitySchema }),
    asyncHandler(c.create),
  );
  routes.patch(
    "/admin/communities/:id",
    access.role("admin"),
    c.writeLimit,
    validate({ params: communityIdParamsSchema, body: updateCommunitySchema }),
    asyncHandler(c.update),
  );
  // DELETE archives the room; posts, memberships and moderation history survive.
  routes.delete(
    "/admin/communities/:id",
    access.role("admin"),
    c.writeLimit,
    validate({ params: communityIdParamsSchema, body: emptyCommunityMutationSchema }),
    asyncHandler(c.archive),
  );
  return routes.router;
}
