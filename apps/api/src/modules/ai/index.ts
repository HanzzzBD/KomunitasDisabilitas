// modules/ai — wiring modul (DI manual via factory, ADR-002).
//
// Modul ini punya DUA jalur yang sengaja tidak bertemu di satu factory:
// - `createAiModule` merakit `GET /ai/quota`, yang jawabannya seluruhnya hidup
//   di penghitung Redis milik `core/ai/quota.ts` — tanpa repository sama sekali.
// - Recorder `ai_usage` (PR-043b) adalah jalur TULIS yang dipakai `AiClient` di
//   sisi api dan `AiUsageRepository` yang dipakai processor di `apps/worker`.
//   Keduanya diekspor terpisah karena pemakainya bukan HTTP: merakitnya ke dalam
//   `createAiModule` berarti memaksa worker menyeret router express yang tidak
//   pernah ia jalankan.
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
export {
  createAiUsageRecorder,
  METRIK_ENQUEUE_GAGAL,
  type AiUsageRecorderDeps,
} from "./services/ai-usage.service.js";
export {
  createAiUsageRepository,
  type AiUsageRepository,
  type HasilSimpan,
} from "./repositories/ai-usage.repository.js";
