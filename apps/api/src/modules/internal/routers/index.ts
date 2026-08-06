// modules/internal — router. Di ROOT app (bukan /api/v1): konsumennya
// operator & monitoring, bukan klien API (SDD §11, §17).
import type { Router } from "express";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler } from "../../../core/http/index.js";
import type { QueuesController } from "../controllers/queues.controller.js";

export function createInternalRouter(controller: QueuesController, routes: RouteRegistrar): Router {
  // `access.internal` memasang penjaga token operator (SDD §16) — sejak PR-019
  // penjaga itu datang dari deklarasi, bukan dirangkai manual per rute. Modul
  // yang lupa menuliskannya tidak akan terbuka; ia gagal boot.
  routes.get(
    "/internal/queues",
    access.internal("status antrean untuk operator; bukan endpoint klien"),
    asyncHandler(controller.list),
  );
  return routes.router;
}
