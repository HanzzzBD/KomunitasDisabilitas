// modules/applications — router (PR-075). Path relatif; prefix `/api/v1` dipegang registrar.
//
// `access.role("seeker")`, bukan `authenticated()`: admin dan employer tidak
// melamar. Lamaran admin "atas nama" seseorang akan menulis pengungkapan data
// disabilitas yang tidak pernah diputuskan pemiliknya.
import type { Router } from "express";
import { applyJobSchema, jobIdParamsSchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { ApplyController } from "../controllers/apply.controller.js";

export function createApplicationsRouter(
  controller: ApplyController,
  routes: RouteRegistrar,
): Router {
  routes.post(
    "/jobs/:id/apply",
    access.role("seeker"),
    validate({ params: jobIdParamsSchema, body: applyJobSchema }),
    asyncHandler(controller.apply),
  );
  return routes.router;
}
