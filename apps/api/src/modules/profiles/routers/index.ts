// modules/profiles — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// `access.authenticated()`, BUKAN `access.self()` — alasannya sama persis dengan
// `modules/users` dan `modules/accessibility`: `/me/profile` tidak punya param
// `:userId` untuk dibandingkan, dan `requireSelf` membaca `req.params[param]`
// sehingga akan menolak SEMUA permintaan pada route tanpa param (perilaku yang
// sengaja dipilih di PR-019).
//
// Yang dijaga requireSelf — "pengguna hanya boleh menyentuh miliknya sendiri" —
// di sini dijamin oleh bentuk endpoint-nya: identitas datang dari sesi, dan
// TIDAK ADA saluran input untuk menyebut pengguna lain. Route ber-param untuk
// akses support/admin lahir di PR-039, berikut kewajiban menyertakan alasan.
import type { Router } from "express";
import { updateSeekerProfileSchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { ProfilesController } from "../controllers/profiles.controller.js";

export function createProfilesRouter(
  controller: ProfilesController,
  routes: RouteRegistrar,
): Router {
  routes.get("/me/profile", access.authenticated(), asyncHandler(controller.me));
  routes.put(
    "/me/profile",
    access.authenticated(),
    // Taksonomi (ragam disabilitas, akomodasi), batas panjang teks, penolakan
    // field asing, dan larangan "cabut consent sambil menyimpan" semuanya ada
    // di skema — satu tempat untuk aturan yang sama-sama dipakai klien (PR-040)
    // dan server. Nilai liar tidak pernah sampai ke enkripsi, apalagi ke DB.
    validate({ body: updateSeekerProfileSchema }),
    asyncHandler(controller.updateMe),
  );
  return routes.router;
}
