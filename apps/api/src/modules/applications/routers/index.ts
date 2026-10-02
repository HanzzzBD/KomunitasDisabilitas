// modules/applications — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// `access.role("seeker")` untuk seluruh route, bukan `authenticated()`: admin
// dan employer tidak melamar, dan lamaran admin "atas nama" seseorang akan
// menulis pengungkapan data disabilitas yang tidak pernah diputuskan
// pemiliknya. Jalur admin atas lamaran adalah PR-077, di router admin sendiri.
import type { Router } from "express";
import {
  adminApplicationListQuerySchema,
  applicationIdParamsSchema,
  revealDisclosureSchema,
  updateApplicationStatusSchema,
  applyJobSchema,
  jobIdParamsSchema,
  paginationQuerySchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { ApplyController } from "../controllers/apply.controller.js";
import type { StatusController } from "../controllers/status.controller.js";
import type { AdminApplicationsController } from "../controllers/admin-applications.controller.js";

export function createApplicationsRouter(
  controllers: {
    apply: ApplyController;
    status: StatusController;
    admin: AdminApplicationsController;
  },
  routes: RouteRegistrar,
): Router {
  const { apply, status, admin } = controllers;
  routes.post(
    "/jobs/:id/apply",
    access.role("seeker"),
    validate({ params: jobIdParamsSchema, body: applyJobSchema }),
    asyncHandler(apply.apply),
  );
  routes.get(
    "/me/applications",
    access.role("seeker"),
    validate({ query: paginationQuerySchema }),
    asyncHandler(status.list),
  );
  routes.get(
    "/me/applications/:id",
    access.role("seeker"),
    validate({ params: applicationIdParamsSchema }),
    asyncHandler(status.detail),
  );
  routes.post(
    "/me/applications/:id/withdraw",
    access.role("seeker"),
    validate({ params: applicationIdParamsSchema }),
    asyncHandler(status.withdraw),
  );
  routes.post(
    "/me/applications/:id/confirm-hired",
    access.role("seeker"),
    validate({ params: applicationIdParamsSchema }),
    asyncHandler(status.confirmHired),
  );

  // Jalur admin (PR-077a) — operasional lamaran pilot. Seluruhnya role("admin").
  routes.get(
    "/admin/applications",
    access.role("admin"),
    validate({ query: adminApplicationListQuerySchema }),
    asyncHandler(admin.list),
  );
  routes.get(
    "/admin/applications/:id",
    access.role("admin"),
    validate({ params: applicationIdParamsSchema }),
    asyncHandler(admin.detail),
  );
  routes.put(
    "/admin/applications/:id/status",
    access.role("admin"),
    validate({ params: applicationIdParamsSchema, body: updateApplicationStatusSchema }),
    asyncHandler(admin.ubahStatus),
  );
  routes.post(
    "/admin/applications/:id/disclosure",
    access.role("admin"),
    validate({ params: applicationIdParamsSchema, body: revealDisclosureSchema }),
    asyncHandler(admin.bukaPengungkapan),
  );
  return routes.router;
}
