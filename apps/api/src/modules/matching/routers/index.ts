// modules/matching — router feed (PR-073). Path relatif; prefix `/api/v1` dipegang registrar.
//
// Refresh adalah POST TERPISAH (keputusan owner 2026-09-30): ia memakan jatah
// harian, jadi tidak boleh bisa dipicu oleh GET yang diulang otomatis
// (prefetch, retry klien/proxy). GET tetap aman diulang — paling jauh ia
// menghitung ulang cache yang sudah kedaluwarsa (PR-072).
import type { Router } from "express";
import { matchesQuerySchema, matchesRefreshQuerySchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { MatchesController } from "../controllers/matches.controller.js";

export function createMatchingRouter(
  controller: MatchesController,
  routes: RouteRegistrar,
): Router {
  routes.get(
    "/me/matches",
    access.authenticated(),
    validate({ query: matchesQuerySchema }),
    asyncHandler(controller.lihat),
  );
  routes.post(
    "/me/matches/refresh",
    access.authenticated(),
    validate({ query: matchesRefreshQuerySchema }),
    asyncHandler(controller.segarkan),
  );
  return routes.router;
}
