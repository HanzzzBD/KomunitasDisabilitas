// modules/health — wiring modul (DI manual via factory, ADR-002).
import type { Router } from "express";
import type { DbClient } from "../../core/db/index.js";
import type { RedisClients } from "../../core/redis/index.js";
import { createHealthService } from "./services/health.service.js";
import { createHealthController } from "./controllers/health.controller.js";
import { createHealthRouter } from "./routers/index.js";

export function createHealthModule(db: DbClient, redis: RedisClients): Router {
  return createHealthRouter(createHealthController(createHealthService(db, redis)));
}

export {
  createHealthService,
  type HealthService,
  type ReadinessDetail,
} from "./services/health.service.js";
