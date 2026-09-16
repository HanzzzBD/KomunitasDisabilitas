// modules/resumes — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// `access.authenticated()`, BUKAN `access.self("id")` — alasannya sama persis
// dengan route sub-entitas karier di `modules/profiles`: `:id` di sini adalah id
// CV, bukan id pengguna, sehingga `requireSelf` akan membandingkannya dengan
// userId pemilik sesi dan MENOLAK setiap permintaan yang sah.
//
// Yang dijaga `requireSelf` — "pengguna hanya boleh menyentuh miliknya sendiri"
// — dijamin di tempat yang tidak bisa dilewati: setiap query repository menyebut
// `userId` bersama `id` (`resumes.repository.ts`), sehingga CV milik orang lain
// berperilaku seperti CV yang tidak ada. Lihat docs/rbac-route-registry.md.
//
// `params` ikut divalidasi di ketiga route ber-`:id`: id yang bukan UUID ditolak
// 400 di gerbang, bukan diteruskan ke Prisma yang akan melemparnya sebagai
// kegagalan 500 — pesan yang tidak berguna bagi pengguna dan berisik bagi yang
// memantau.
import type { Router } from "express";
import { createResumeSchema, resumeIdParamsSchema, updateResumeSchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { ResumesController } from "../controllers/resumes.controller.js";

export function createResumesRouter(
  controller: ResumesController,
  routes: RouteRegistrar,
): Router {
  routes.get("/me/resumes", access.authenticated(), asyncHandler(controller.list));
  routes.post(
    "/me/resumes",
    access.authenticated(),
    validate({ body: createResumeSchema }),
    asyncHandler(controller.create),
  );
  routes.get(
    "/me/resumes/:id",
    access.authenticated(),
    validate({ params: resumeIdParamsSchema }),
    asyncHandler(controller.get),
  );
  routes.put(
    "/me/resumes/:id",
    access.authenticated(),
    validate({ params: resumeIdParamsSchema, body: updateResumeSchema }),
    asyncHandler(controller.update),
  );
  routes.delete(
    "/me/resumes/:id",
    access.authenticated(),
    validate({ params: resumeIdParamsSchema }),
    asyncHandler(controller.remove),
  );

  return routes.router;
}
