// modules/ai — wiring modul (DI manual via factory, ADR-002).
//
// Modul ini SENGAJA tanpa repository. Yang dijawab `GET /ai/quota` seluruhnya
// hidup di penghitung Redis milik `core/ai/quota.ts`; menambahkan repository
// kosong hanya demi kelengkapan template akan melahirkan lapisan yang tidak
// punya pekerjaan. Pencatatan `ai_usage` (yang memang butuh Prisma) menyusul di
// PR-043b bersama recorder dan processor worker-nya.
import type { Router } from "express";
import type { AiQuota } from "../../core/ai/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import { createAiQuotaService } from "./services/quota.service.js";
import { createAiController } from "./controllers/ai.controller.js";
import { createAiQuotaRouter } from "./routers/index.js";

export interface AiModuleDeps {
  /** Mesin kuota yang dirakit di composition root — di atas `redis.queue`. */
  quota: AiQuota;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
}

export function createAiModule(deps: AiModuleDeps): Router {
  const service = createAiQuotaService({ quota: deps.quota });
  return createAiQuotaRouter(createAiController(service), deps.routes);
}

export {
  createAiQuotaService,
  type AiQuotaActor,
  type AiQuotaService,
} from "./services/quota.service.js";
export { createAiController, type AiController } from "./controllers/ai.controller.js";
export { createAiQuotaRouter } from "./routers/index.js";
