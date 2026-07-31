// modules/internal — wiring modul (DI manual via factory, ADR-002).
import type { Router } from "express";
import type { QueueLike, QueueRegistry } from "../../core/queue/index.js";
import { createQueuesService } from "./services/queues.service.js";
import { createQueuesController } from "./controllers/queues.controller.js";
import { createInternalRouter } from "./routers/index.js";
import { createInternalAuth } from "./internal-auth.js";

export interface InternalModuleDeps {
  registry: QueueRegistry;
  dlqQueueOf: (dlqName: string) => QueueLike;
  /** INTERNAL_TOKEN; undefined = seluruh endpoint internal tertutup. */
  internalToken: string | undefined;
}

export function createInternalModule(deps: InternalModuleDeps): Router {
  return createInternalRouter(
    createQueuesController(createQueuesService(deps)),
    createInternalAuth(deps.internalToken),
  );
}

export { createQueuesService, type QueuesService } from "./services/queues.service.js";
export { createInternalAuth, INTERNAL_TOKEN_HEADER } from "./internal-auth.js";
