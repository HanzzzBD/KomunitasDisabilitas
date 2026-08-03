// modules/internal — router. Di ROOT app (bukan /api/v1): konsumennya
// operator & monitoring, bukan klien API (SDD §11, §17).
import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../../../core/http/index.js";
import type { QueuesController } from "../controllers/queues.controller.js";

export function createInternalRouter(
  controller: QueuesController,
  internalAuth: RequestHandler,
): Router {
  const router = Router();
  // Auth dipasang di level rute, bukan global — /internal/* tidak boleh
  // pernah terlayani tanpa melewatinya.
  router.get("/internal/queues", internalAuth, asyncHandler(controller.list));
  return router;
}
