// modules/ai — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// KENAPA `access.authenticated()` DAN BUKAN `access.self()`. Alasannya sama
// persis dengan `/me/accessibility` (PR-034): route ini tidak punya param
// `:userId` untuk dibandingkan, dan `requireSelf` membaca `req.params[param]`
// sehingga akan menolak SEMUA permintaan pada route tanpa param.
//
// Yang dijaga `requireSelf` — "pengguna hanya boleh melihat miliknya sendiri" —
// di sini dijamin oleh BENTUK endpoint-nya: identitasnya datang dari sesi, dan
// tidak ada param maupun query yang bisa menyebut pengguna lain. Menambahkan
// `/ai/quota/:userId` kelak berarti pindah ke `access.self("userId")`, bukan
// menambah pemeriksaan di controller.
import type { Router } from "express";
import { aiChatSessionParamsSchema, aiCvChatRequestSchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { AiController } from "../controllers/ai.controller.js";
import type { AiChatSessionsController } from "../controllers/chat-sessions.controller.js";
import type { CvChatController } from "../controllers/cv-chat.controller.js";
import type { CvFinalizeController } from "../controllers/cv-finalize.controller.js";

/**
 * Bernama `createAiQuotaRouter`, bukan `createAiRouter` seperti pola modul lain:
 * nama itu sudah dipakai `core/ai/router.ts` untuk router PROVIDER (Gemini →
 * Groq). Dua hal yang sangat berbeda dengan satu nama akan tertukar di impor,
 * dan yang tertukar di sini adalah jalur pemanggilan LLM.
 */
export function createAiQuotaRouter(controller: AiController, routes: RouteRegistrar): Router {
  routes.get("/ai/quota", access.authenticated(), asyncHandler(controller.quotaMe));
  return routes.router;
}

/**
 * Sesi AI CV Builder (PR-065). `access.authenticated()`, BUKAN `access.self()`:
 * `:session` adalah id sesi, jadi `requireSelf` akan membandingkannya dengan id
 * pengguna dan menolak setiap permintaan yang sah — alasan yang sama dengan
 * `/me/resumes/:id`. Kepemilikannya dijamin repository (setiap query menyebut
 * `userId`), sehingga sesi milik orang lain menjawab 404 seperti yang tidak ada.
 *
 * Hanya BACA. Sesi lahir dan bertambah lewat `POST /ai/cv-chat` (PR-066) —
 * satu-satunya jalur yang juga memotong kuota dan mencatat `ai_usage`.
 */
export function createAiChatSessionsRouter(
  controller: AiChatSessionsController,
  routes: RouteRegistrar,
): Router {
  routes.get(
    "/ai/cv-chat/:session",
    access.authenticated(),
    validate({ params: aiChatSessionParamsSchema }),
    asyncHandler(controller.get),
  );
  return routes.router;
}

/**
 * Percakapan AI CV Builder (PR-066). Ketiganya `authenticated`, alasan yang sama
 * dengan `/ai/cv-chat/:session`: identitas dari token, kepemilikan sesi dijamin
 * repository dan registry aliran.
 *
 * `POST /ai/cv-chat/sessions` adalah satu-satunya tulis TANPA AI: ia hanya
 * membuat (atau mengembalikan) satu sesi aktif beserta salam statis — tidak bisa
 * dipakai menumbuhkan transkrip, sebab paling banyak ada satu sesi aktif dan
 * salam hanya ditulis saat sesi lahir.
 */
export function createAiCvChatRouter(controller: CvChatController, routes: RouteRegistrar): Router {
  routes.post("/ai/cv-chat/sessions", access.authenticated(), asyncHandler(controller.mulai));
  routes.post(
    "/ai/cv-chat",
    access.authenticated(),
    validate({ body: aiCvChatRequestSchema }),
    asyncHandler(controller.kirim),
  );
  routes.get(
    "/ai/cv-chat/:session/stream",
    access.authenticated(),
    validate({ params: aiChatSessionParamsSchema }),
    asyncHandler(controller.sambung),
  );
  return routes.router;
}

/**
 * Finalize AI CV Builder (PR-067). `authenticated` — kepemilikan sesi dijamin
 * repository, alasan yang sama dengan route cv-chat lainnya.
 */
export function createAiCvFinalizeRouter(
  controller: CvFinalizeController,
  routes: RouteRegistrar,
): Router {
  routes.post(
    "/ai/cv-chat/:session/finalize",
    access.authenticated(),
    validate({ params: aiChatSessionParamsSchema }),
    asyncHandler(controller.finalisasi),
  );
  return routes.router;
}
