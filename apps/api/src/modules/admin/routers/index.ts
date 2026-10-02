// modules/admin — router. Path relatif; prefix `/api/v1` dipegang registrar.
import type { Router } from "express";
import { adminMetricsQuerySchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { MetricsController } from "../controllers/metrics.controller.js";

export function createAdminRouter(
  controllers: { metrics: MetricsController },
  routes: RouteRegistrar,
): Router {
  routes.get(
    "/admin/metrics",
    access.role("admin"),
    validate({ query: adminMetricsQuerySchema }),
    asyncHandler(controllers.metrics.get),
  );
  return routes.router;
}
