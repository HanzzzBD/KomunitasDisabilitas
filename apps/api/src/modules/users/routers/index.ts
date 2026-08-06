// modules/users — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// KENAPA `access.authenticated()` DAN BUKAN `access.self()`. Technical Notes
// PR-020 menyebut requireSelf, dan maksudnya benar — tetapi `/me` tidak punya
// param `:userId` untuk dibandingkan. `requireSelf` membaca `req.params[param]`
// dan akan menolak SEMUA permintaan pada route tanpa param (perilaku yang
// sengaja dipilih di PR-019: deklarasi salah tulis tidak boleh berubah menjadi
// endpoint terbuka).
//
// Yang dijaga requireSelf — "pengguna hanya boleh menyentuh miliknya sendiri" —
// di sini dijamin oleh bentuk endpoint-nya: identitas datang dari sesi, dan
// TIDAK ADA saluran input untuk menyebut pengguna lain. Saat endpoint ber-param
// lahir (mis. admin membaca profil orang), itulah tempat `access.self` dipakai.
import type { Router } from "express";
import { updateMeSchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { UsersController } from "../controllers/users.controller.js";

export function createUsersRouter(controller: UsersController, routes: RouteRegistrar): Router {
  routes.get("/me", access.authenticated(), asyncHandler(controller.me));
  routes.put(
    "/me",
    access.authenticated(),
    validate({ body: updateMeSchema }),
    asyncHandler(controller.updateMe),
  );
  return routes.router;
}
