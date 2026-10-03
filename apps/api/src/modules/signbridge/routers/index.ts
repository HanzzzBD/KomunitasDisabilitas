// modules/signbridge — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// `/sign-videos` PUBLIK dengan sengaja: kamus BISINDO adalah nilai bagi
// pengguna Tuli sejak sebelum mendaftar (ADR-010 v1). Mutasi hanya admin.
import type { Router } from "express";
import {
  createSignVideoSchema,
  signVideoIdParamsSchema,
  signVideoPresignSchema,
  signVideoSearchQuerySchema,
  updateSignVideoSchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { SignVideosController } from "../controllers/sign-videos.controller.js";

export function createSignbridgeRouter(
  controller: SignVideosController,
  routes: RouteRegistrar,
): Router {
  routes.get(
    "/sign-videos",
    access.public("Kamus BISINDO terbuka bagi siapa pun, termasuk sebelum mendaftar"),
    validate({ query: signVideoSearchQuerySchema }),
    asyncHandler(controller.search),
  );

  routes.get("/admin/sign-videos", access.role("admin"), asyncHandler(controller.listAdmin));
  // Didaftarkan SEBELUM `/admin/sign-videos/:id` — tidak bentrok (metode beda),
  // tetapi urutan ini menjaga pembaca dari kebingungan "presign" sebagai `:id`.
  routes.post(
    "/admin/sign-videos/presign",
    access.role("admin"),
    validate({ body: signVideoPresignSchema }),
    asyncHandler(controller.presignAdmin),
  );
  routes.post(
    "/admin/sign-videos",
    access.role("admin"),
    validate({ body: createSignVideoSchema }),
    asyncHandler(controller.createAdmin),
  );
  routes.put(
    "/admin/sign-videos/:id",
    access.role("admin"),
    validate({ params: signVideoIdParamsSchema, body: updateSignVideoSchema }),
    asyncHandler(controller.updateAdmin),
  );
  routes.post(
    "/admin/sign-videos/:id/publish",
    access.role("admin"),
    validate({ params: signVideoIdParamsSchema }),
    asyncHandler(controller.publishAdmin),
  );
  routes.post(
    "/admin/sign-videos/:id/unpublish",
    access.role("admin"),
    validate({ params: signVideoIdParamsSchema }),
    asyncHandler(controller.unpublishAdmin),
  );

  return routes.router;
}
