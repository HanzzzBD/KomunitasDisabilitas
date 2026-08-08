// modules/internal — wiring modul (DI manual via factory, ADR-002).
import type { Router } from "express";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { QueueLike, QueueRegistry } from "../../core/queue/index.js";
import { createQueuesService } from "./services/queues.service.js";
import { createQueuesController } from "./controllers/queues.controller.js";
import { createInternalRouter } from "./routers/index.js";

export interface InternalModuleDeps {
  registry: QueueRegistry;
  dlqQueueOf: (dlqName: string) => QueueLike;
  /**
   * Registrar route (PR-019). Penjaga token internal-nya datang dari deklarasi
   * `access.internal` — lihat createAccessGuards({ internalGuard }) di boot.
   */
  routes: RouteRegistrar;
}

export function createInternalModule(deps: InternalModuleDeps): Router {
  return createInternalRouter(createQueuesController(createQueuesService(deps)), deps.routes);
}

export { createQueuesService, type QueuesService } from "./services/queues.service.js";
export { createInternalAuth, INTERNAL_TOKEN_HEADER } from "./internal-auth.js";
