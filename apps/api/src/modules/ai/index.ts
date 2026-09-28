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
// - Sesi AI CV Builder (PR-065) ikut `createAiModule`: endpoint bacanya HTTP,
//   dan service-nya dikembalikan untuk PR-066. Kebijakan retensinya diekspor
//   terpisah dengan alasan yang sama seperti recorder — pemakainya worker.
import type { Router } from "express";
import type { AiQuota } from "../../core/ai/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AppPrisma } from "../../core/db/index.js";
import { createAiQuotaService } from "./services/quota.service.js";
import { createAiController } from "./controllers/ai.controller.js";
import { createAiChatSessionsRouter, createAiQuotaRouter } from "./routers/index.js";
import { createChatSessionsRepository } from "./repositories/chat-sessions.repository.js";
import {
  createAiChatSessionsService,
  type AiChatSessionsService,
} from "./services/chat-sessions.service.js";
import { createAiChatSessionsController } from "./controllers/chat-sessions.controller.js";
import { createAiChatExportContributor } from "./services/chat-export.service.js";

export interface AiModuleDeps {
  prisma: AppPrisma;
  /** Mesin kuota yang dirakit di composition root — di atas `redis.queue`. */
  quota: AiQuota;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
}

export interface AiModule {
  router: Router;
  /**
   * Service sesi yang SAMA dengan yang melayani `GET /ai/cv-chat/:session`.
   * Konsumennya PR-066 (endpoint SSE) — belum ada pemanggil hari ini, pola yang
   * sama dengan `service` di modul resumes.
   */
  chatSessions: AiChatSessionsService;
  /** Bagian `aiChatSessions` berkas ekspor PDP — dipasang ke modul users di boot. */
  exportContributor: ReturnType<typeof createAiChatExportContributor>;
}

export function createAiModule(deps: AiModuleDeps): AiModule {
  const quota = createAiQuotaService({ quota: deps.quota });
  createAiQuotaRouter(createAiController(quota), deps.routes);

  const chatSessions = createAiChatSessionsService({
    repo: createChatSessionsRepository(deps.prisma),
  });
  const router = createAiChatSessionsRouter(
    createAiChatSessionsController(chatSessions),
    deps.routes,
  );

  return {
    router,
    chatSessions,
    exportContributor: createAiChatExportContributor({ chatSessions }),
  };
}

export {
  createAiQuotaService,
  type AiQuotaActor,
  type AiQuotaService,
} from "./services/quota.service.js";
export { createAiController, type AiController } from "./controllers/ai.controller.js";
export { createAiChatSessionsRouter, createAiQuotaRouter } from "./routers/index.js";
export {
  createChatSessionsRepository,
  type BatasTranskrip,
  type ChatSessionRow,
  type ChatSessionsRepository,
  type GiliranTulis,
  type HasilAppend,
  type KategoriRetensiChat,
} from "./repositories/chat-sessions.repository.js";
export {
  createAiChatSessionsService,
  type AiChatActor,
  type AiChatSessionsService,
  type AiChatSessionsServiceDeps,
  type GiliranBaru,
} from "./services/chat-sessions.service.js";
export {
  createAiChatSessionsController,
  type AiChatSessionsController,
} from "./controllers/chat-sessions.controller.js";
export { createAiChatSessionPolicies } from "./services/chat-retention.service.js";
export { createAiChatExportContributor } from "./services/chat-export.service.js";
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
