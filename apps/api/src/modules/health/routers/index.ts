// modules/health — router. Di ROOT app (bukan /api/v1): konsumen adalah
// compose healthcheck & Uptime Kuma, bukan klien API (SDD §11).
import { Router } from "express";
import { asyncHandler } from "../../../core/http/index.js";
import type { HealthController } from "../controllers/health.controller.js";

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get("/healthz", controller.healthz);
  router.get("/readyz", asyncHandler(controller.readyz));
  return router;
}
