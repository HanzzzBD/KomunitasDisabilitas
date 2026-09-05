// modules/notifications — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// `access.authenticated()`, BUKAN `access.self()` — alasannya sama persis dengan
// `modules/users`, `modules/accessibility`, dan `modules/profiles`: tidak ada
// param `:userId` untuk dibandingkan, dan `requireSelf` membaca
// `req.params[param]` sehingga akan menolak SEMUA permintaan pada route tanpa
// param (perilaku yang sengaja dipilih di PR-019).
//
// ROUTE TANDAI-DIBACA PUNYA `:id`, DAN ITU TIDAK MENGUBAH APA PUN DI ATAS. `:id`
// adalah id NOTIFIKASI, bukan id pengguna — `access.self("id")` akan
// membandingkannya dengan userId pemilik sesi dan menolak setiap permintaan yang
// sah. Kepemilikannya dijaga di tempat yang tidak bisa dilewati: setiap query
// repository menyebut `userId` bersama `id`, sehingga baris milik orang lain
// berperilaku seperti baris yang tidak ada (404, bukan 403 yang justru
// membenarkan keberadaannya).
import type { Router } from "express";
import { notificationIdParamsSchema, notificationListQuerySchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { NotificationsController } from "../controllers/notifications.controller.js";

export function createNotificationsRouter(
  controller: NotificationsController,
  routes: RouteRegistrar,
): Router {
  routes.get(
    "/me/notifications",
    access.authenticated(),
    // `limit` dibatasi 1–100 di skema fondasi (common.ts), bukan di service:
    // satu tempat untuk aturan yang sama-sama dipakai klien dan server, dan
    // `limit=100000` ditolak 400 di gerbang alih-alih menjadi satu query yang
    // menarik seluruh riwayat seorang pengguna ke memori.
    validate({ query: notificationListQuerySchema }),
    asyncHandler(controller.list),
  );
  routes.post(
    "/me/notifications/:id/read",
    access.authenticated(),
    // `params` ikut divalidasi: id yang bukan UUID ditolak 400 di gerbang, bukan
    // diteruskan ke Prisma yang akan melemparnya sebagai kegagalan 500 — pesan
    // yang tidak berguna bagi pengguna dan berisik bagi yang memantau.
    validate({ params: notificationIdParamsSchema }),
    asyncHandler(controller.markRead),
  );
  return routes.router;
}
