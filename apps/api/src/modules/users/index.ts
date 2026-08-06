// modules/users — wiring modul (DI manual via factory, ADR-002).
//
// Berbeda dengan modul `auth`, modul ini tidak punya mode "tertutup": profil
// akun tidak bergantung pada kredensial eksternal apa pun. Yang menjaganya
// adalah guard sesi dari registrar — bila kunci RS256 belum di-set, kedua route
// menjawab 503 lewat `requireAuth`, bukan lewat cabang khusus di sini.
import type { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AuditLog } from "../../core/audit/index.js";
import { createUserProfileRepository } from "./repositories/user.repository.js";
import { createUsersService } from "./services/users.service.js";
import { createUsersController } from "./controllers/users.controller.js";
import { createUsersRouter } from "./routers/index.js";

export interface UsersModuleDeps {
  prisma: PrismaClient;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  auditLog: AuditLog;
}

export function createUsersModule(deps: UsersModuleDeps): Router {
  return createUsersRouter(
    createUsersController(
      createUsersService({
        userRepository: createUserProfileRepository(deps.prisma),
        auditLog: deps.auditLog,
      }),
    ),
    deps.routes,
  );
}

export {
  createUserProfileRepository,
  EmailSudahDipakaiError,
  type UserProfileRepository,
  type UserProfileRow,
} from "./repositories/user.repository.js";
export { createUsersService, type UsersActor, type UsersService } from "./services/users.service.js";
