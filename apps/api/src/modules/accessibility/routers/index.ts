// modules/accessibility — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// KENAPA `access.authenticated()` DAN BUKAN `access.self()`. Alasannya sama
// persis dengan `modules/users`: `/me/accessibility` tidak punya param
// `:userId` untuk dibandingkan, dan `requireSelf` membaca `req.params[param]`
// sehingga akan menolak SEMUA permintaan pada route tanpa param (perilaku yang
// sengaja dipilih di PR-019).
//
// Yang dijaga requireSelf — "pengguna hanya boleh menyentuh miliknya sendiri" —
// di sini dijamin oleh bentuk endpoint-nya: identitas datang dari sesi, dan
// TIDAK ADA saluran input untuk menyebut pengguna lain.
import type { Router } from "express";
import { updateAccessibilityPreferencesSchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { AccessibilityController } from "../controllers/accessibility.controller.js";

export function createAccessibilityRouter(
  controller: AccessibilityController,
  routes: RouteRegistrar,
): Router {
  routes.get("/me/accessibility", access.authenticated(), asyncHandler(controller.me));
  routes.put(
    "/me/accessibility",
    access.authenticated(),
    // Batas nilai (`textScale` 100–200) dan penolakan field asing (`.strict()`)
    // ada di skema, bukan di service: satu tempat untuk aturan yang sama-sama
    // dipakai klien (PR-026) dan server.
    validate({ body: updateAccessibilityPreferencesSchema }),
    asyncHandler(controller.updateMe),
  );
  return routes.router;
}
