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
//
// ROUTE SUB-ENTITAS PUNYA `:id` (PR-038), DAN ITU TIDAK MENGUBAH APA PUN DI
// ATAS. `:id` adalah id ITEM, bukan id pengguna — `access.self("id")` akan
// membandingkannya dengan userId pemilik sesi dan menolak setiap permintaan yang
// sah. Kepemilikannya dijaga di tempat yang tidak bisa dilewati: setiap query
// repository menyebut `userId` bersama `id` (career.repository.ts), sehingga
// baris milik orang lain berperilaku seperti baris yang tidak ada.
import type { Router } from "express";
import {
  careerItemParamsSchema,
  createEducationSchema,
  createExperienceSchema,
  createSkillSchema,
  updateEducationSchema,
  updateExperienceSchema,
  updateSeekerProfileSchema,
  updateSkillSchema,
} from "@nawasena/schemas";
import type { z } from "zod";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { ProfilesController } from "../controllers/profiles.controller.js";
import type { KarierController } from "../controllers/career.controller.js";

/** Keempat route satu sub-entitas — didaftarkan seragam untuk ketiganya. */
function daftarkanKarier(
  routes: RouteRegistrar,
  basis: string,
  controller: KarierController,
  skema: { buat: z.ZodTypeAny; ubah: z.ZodTypeAny },
): void {
  routes.get(basis, access.authenticated(), asyncHandler(controller.list));
  routes.post(
    basis,
    access.authenticated(),
    validate({ body: skema.buat }),
    asyncHandler(controller.create),
  );
  // `params` ikut divalidasi: id yang bukan UUID ditolak 400 di gerbang, bukan
  // diteruskan ke Prisma yang akan melemparnya sebagai kegagalan 500 — pesan
  // yang tidak berguna bagi pengguna dan berisik bagi yang memantau.
  routes.put(
    `${basis}/:id`,
    access.authenticated(),
    validate({ params: careerItemParamsSchema, body: skema.ubah }),
    asyncHandler(controller.update),
  );
  routes.delete(
    `${basis}/:id`,
    access.authenticated(),
    validate({ params: careerItemParamsSchema }),
    asyncHandler(controller.remove),
  );
}

export interface KarierControllers {
  experiences: KarierController;
  educations: KarierController;
  skills: KarierController;
}

export function createProfilesRouter(
  controller: ProfilesController,
  karier: KarierControllers,
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

  daftarkanKarier(routes, "/me/experiences", karier.experiences, {
    buat: createExperienceSchema,
    ubah: updateExperienceSchema,
  });
  daftarkanKarier(routes, "/me/educations", karier.educations, {
    buat: createEducationSchema,
    ubah: updateEducationSchema,
  });
  daftarkanKarier(routes, "/me/skills", karier.skills, {
    buat: createSkillSchema,
    ubah: updateSkillSchema,
  });

  return routes.router;
}
