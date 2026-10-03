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
import {
  adminUserIdParamsSchema,
  adminUserListQuerySchema,
  moderateUserSchema,
  updateMeSchema,
  updateNotificationChannelPrefsSchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { UsersController } from "../controllers/users.controller.js";
import type { ModerationController } from "../controllers/moderation.controller.js";

export function createUsersRouter(controller: UsersController, routes: RouteRegistrar): Router {
  routes.get("/me", access.authenticated(), asyncHandler(controller.me));
  routes.put(
    "/me",
    access.authenticated(),
    validate({ body: updateMeSchema }),
    asyncHandler(controller.updateMe),
  );
  // Ekspor PDP (PR-022). Tanpa `validate`: tidak ada input sama sekali —
  // pemiliknya datang dari sesi, dan endpoint ini sengaja tidak menerima
  // parameter apa pun yang bisa dipakai menyebut pengguna lain.
  routes.get("/me/export", access.authenticated(), asyncHandler(controller.exportMe));
  // Preferensi kanal notifikasi (PR-049b). Bentuk yang sama dengan
  // `/me/accessibility`: baca mengembalikan `null` apa adanya, tulis bersifat
  // sebagian, dan `null` pada sebuah kanal adalah perintah kembali ke bawaan.
  routes.get(
    "/me/notification-prefs",
    access.authenticated(),
    asyncHandler(controller.notificationPrefs),
  );
  routes.put(
    "/me/notification-prefs",
    access.authenticated(),
    // Penolakan kanal asing (`.strict()`) dan "sebutkan setidaknya satu" ada di
    // skema, bukan di service: satu tempat untuk aturan yang sama-sama dipakai
    // klien dan server.
    validate({ body: updateNotificationChannelPrefsSchema }),
    asyncHandler(controller.updateNotificationPrefs),
  );
  return routes.router;
}

/**
 * Moderasi akun (PR-083) — role("admin"). Didaftarkan pada registrar yang SAMA
 * dengan rute `/me`, supaya modul ini tetap satu router.
 */
export function daftarkanRuteModerasi(
  controller: ModerationController,
  routes: RouteRegistrar,
): void {
  routes.get(
    "/admin/users",
    access.role("admin"),
    validate({ query: adminUserListQuerySchema }),
    asyncHandler(controller.list),
  );
  routes.post(
    "/admin/users/:id/suspend",
    access.role("admin"),
    validate({ params: adminUserIdParamsSchema, body: moderateUserSchema }),
    asyncHandler(controller.suspend),
  );
  routes.post(
    "/admin/users/:id/unsuspend",
    access.role("admin"),
    validate({ params: adminUserIdParamsSchema, body: moderateUserSchema }),
    asyncHandler(controller.unsuspend),
  );
}
