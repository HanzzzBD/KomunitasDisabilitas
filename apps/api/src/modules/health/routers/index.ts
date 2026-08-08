// modules/health — router. Di ROOT app (bukan /api/v1): konsumen adalah
// compose healthcheck & Uptime Kuma, bukan klien API (SDD §11).
import type { Router } from "express";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler } from "../../../core/http/index.js";
import type { HealthController } from "../controllers/health.controller.js";

/**
 * Publik dengan sengaja: probe container/monitoring berjalan sebelum ada
 * pengguna mana pun, dan jawabannya (hidup/siap) tidak memuat data siapa pun.
 * Detail kesiapan yang lebih dalam ada di /internal/* yang bertoken.
 */
const ALASAN = "probe liveness/readiness untuk container & monitoring";

export function createHealthRouter(controller: HealthController, routes: RouteRegistrar): Router {
  routes.get("/healthz", access.public(ALASAN), controller.healthz);
  routes.get("/readyz", access.public(ALASAN), asyncHandler(controller.readyz));
  return routes.router;
}
