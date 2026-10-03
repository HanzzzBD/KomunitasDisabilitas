// modules/signbridge — wiring modul (DI manual via factory, ADR-002).
//
// SignBridge v1 (ADR-010): kamus video BISINDO. v2 (computer vision) adalah
// service terpisah dan TIDAK ditulis di sini sebelum gerbang riset Fase 3.
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import { createSignVideosRepository } from "./repositories/sign-videos.repository.js";
import { createSignVideosService, type SignVideoStorage } from "./services/sign-videos.service.js";
import { createSignVideosController } from "./controllers/sign-videos.controller.js";
import { createSignbridgeRouter } from "./routers/index.js";

export interface SignbridgeModuleDeps {
  prisma: AppPrisma;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  auditLog: AuditLog;
  /** undefined = storage belum diatur → pencarian, presign, dan simpan key menjawab 503. */
  storage: SignVideoStorage | undefined;
}

export interface SignbridgeModule {
  router: Router;
}

export function createSignbridgeModule(deps: SignbridgeModuleDeps): SignbridgeModule {
  const service = createSignVideosService({
    repository: createSignVideosRepository(deps.prisma),
    auditLog: deps.auditLog,
    storage: deps.storage,
  });
  return { router: createSignbridgeRouter(createSignVideosController(service), deps.routes) };
}

export {
  createSignVideosRepository,
  type SignVideoRow,
  type SignVideosRepository,
} from "./repositories/sign-videos.repository.js";
export {
  AUDIT_ENTITY,
  createSignVideosService,
  kekuranganTerbit,
  mediaKeySah,
  type SignVideosActor,
  type SignVideosService,
  type SignVideoStorage,
} from "./services/sign-videos.service.js";
