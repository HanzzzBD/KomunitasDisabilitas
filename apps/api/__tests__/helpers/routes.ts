// Fixture registrar route (PR-019) untuk test HTTP.
//
// Sejak PR-019 setiap router modul lahir dari registrar, bukan Router() polos —
// itulah yang membuat "rute tanpa deklarasi akses" tidak mungkin ada. Helper ini
// merakit registry seukuran test: tanpa kunci sesi dan tanpa penjaga internal,
// kecuali test-nya memang sedang menguji keduanya.
import type { RequestHandler } from "express";
import {
  createAccessGuards,
  createRouteRegistry,
  type RouteRegistrar,
  type RouteRegistry,
  type SessionUserLookup,
  type TokenService,
} from "../../src/core/auth/index.js";

export interface RegistryUjiOptions {
  tokenService?: TokenService;
  findSessionUser?: SessionUserLookup;
  internalGuard?: RequestHandler;
}

export function registryUji(options: RegistryUjiOptions = {}): RouteRegistry {
  const guards = createAccessGuards({
    tokenService: options.tokenService,
    findSessionUser: options.findSessionUser ?? (() => Promise.resolve(null)),
    internalGuard: options.internalGuard,
  });
  return createRouteRegistry({ guardsFor: guards.guardsFor });
}

/** Registrar tunggal — untuk test yang hanya memasang satu modul. */
export function registrarUji(basePath = "", options: RegistryUjiOptions = {}): RouteRegistrar {
  return registryUji(options).forModule(basePath);
}
