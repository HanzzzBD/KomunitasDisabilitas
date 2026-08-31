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
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler } from "../../../core/http/index.js";
import type { AiController } from "../controllers/ai.controller.js";

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
