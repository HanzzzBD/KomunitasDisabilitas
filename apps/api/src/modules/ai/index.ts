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
// - Sesi AI CV Builder (PR-065) dan percakapannya (PR-066) ikut
//   `createAiModule`: endpointnya HTTP. Kebijakan retensinya diekspor terpisah
//   dengan alasan yang sama seperti recorder — pemakainya worker.
import type { Router } from "express";
import {
  AiProviderError,
  cvInterviewerV1,
  type AiClient,
  type AiQuota,
} from "../../core/ai/index.js";
import type { Logger } from "../../core/logger/index.js";
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
import { createAiUsageRepository } from "./repositories/ai-usage.repository.js";
import { createAiUsageExportContributor } from "./services/ai-usage-export.service.js";
import { createCvChatService, type CvChatService } from "./services/cv-chat.service.js";
import { createRegistriAliran } from "./services/cv-chat-aliran.js";
import { createCvChatController } from "./controllers/cv-chat.controller.js";
import { createAiCvChatRouter } from "./routers/index.js";

export interface AiModuleDeps {
  prisma: AppPrisma;
  /** Mesin kuota yang dirakit di composition root — di atas `redis.queue`. */
  quota: AiQuota;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  /**
   * Percakapan AI CV Builder (PR-066). ABSEN = route tetap terdaftar, dan
   * setiap jawaban berakhir event `error` ber-degradasi `AI_NOT_CONFIGURED` —
   * pola deny-by-default gateway, dipakai test yang tidak menyentuh AI.
   */
  cvChat?: {
    /** `AiClient` yang dirakit di composition root — satu-satunya jalan ke LLM. */
    ai: Pick<AiClient, "stream">;
    /** `env.AI_CV_CHAT_ENABLED`. */
    aktif: boolean;
    logger: Pick<Logger, "error">;
  };
}

/** Pengganti bila `cvChat` tidak dirakit: menolak tanpa menyentuh kuota. */
const AI_TIDAK_DIRAKIT: Pick<AiClient, "stream"> = {
  stream: () => Promise.reject(new AiProviderError("AI_NOT_CONFIGURED", "cv-chat")),
};

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
  /** Bagian `aiUsage` berkas ekspor PDP (utang U-05, PR-066). */
  usageExportContributor: ReturnType<typeof createAiUsageExportContributor>;
  /** Service percakapan — dikembalikan untuk test integrasi, bukan untuk modul lain. */
  cvChat: CvChatService;
}

export function createAiModule(deps: AiModuleDeps): AiModule {
  const quota = createAiQuotaService({ quota: deps.quota });
  createAiQuotaRouter(createAiController(quota), deps.routes);

  const chatSessions = createAiChatSessionsService({
    repo: createChatSessionsRepository(deps.prisma),
  });
  createAiChatSessionsRouter(createAiChatSessionsController(chatSessions), deps.routes);

  const cvChat = createCvChatService({
    chatSessions,
    ai: deps.cvChat?.ai ?? AI_TIDAK_DIRAKIT,
    registri: createRegistriAliran(),
    template: cvInterviewerV1,
    aktif: deps.cvChat?.aktif ?? true,
    logger: deps.cvChat?.logger ?? { error: () => undefined },
  });
  // Semua registrar menulis ke Router YANG SAMA (`routes.router`).
  const router = createAiCvChatRouter(createCvChatController(cvChat), deps.routes);

  return {
    router,
    chatSessions,
    exportContributor: createAiChatExportContributor({ chatSessions }),
    usageExportContributor: createAiUsageExportContributor({
      repository: createAiUsageRepository(deps.prisma),
    }),
    cvChat,
  };
}

export {
  createAiQuotaService,
  type AiQuotaActor,
  type AiQuotaService,
} from "./services/quota.service.js";
export { createAiController, type AiController } from "./controllers/ai.controller.js";
export {
  createAiChatSessionsRouter,
  createAiCvChatRouter,
  createAiQuotaRouter,
} from "./routers/index.js";
export {
  createCvChatService,
  EVENT_GILIRAN,
  EVENT_TOKEN,
  type AliranCvChat,
  type CvChatService,
  type CvChatServiceDeps,
} from "./services/cv-chat.service.js";
export {
  createRegistriAliran,
  MAKS_ALIRAN_SERENTAK,
  RETENSI_ALIRAN_MS,
  type HasilDaftar,
  type PenundaAliran,
  type RegistriAliran,
} from "./services/cv-chat-aliran.js";
export { createCvChatController, type CvChatController } from "./controllers/cv-chat.controller.js";
export { createAiUsageExportContributor } from "./services/ai-usage-export.service.js";
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
