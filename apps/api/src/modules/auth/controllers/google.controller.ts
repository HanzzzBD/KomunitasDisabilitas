// modules/auth — controller login Google: request ↔ service. Body sudah
// tervalidasi middleware validate() (skema zod @nawasena/schemas), jadi di sini
// tidak ada pemeriksaan input ad-hoc.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { GoogleAuth, GoogleMobileAuth } from "@nawasena/schemas";
import type {
  GoogleActor,
  GoogleMobileService,
  GoogleService,
} from "../services/google.service.js";
import type { SessionController } from "./session.controller.js";

/**
 * requestId dari pino-http (uuid v4) dipakai audit. Fallback dibuat bila
 * middleware logger tidak terpasang (mis. test unit router) — audit menolak
 * requestId non-UUID, dan kehilangan jejak audit lebih buruk daripada uuid baru.
 */
function actorOf(req: Request): GoogleActor {
  return { requestId: typeof req.id === "string" ? req.id : randomUUID() };
}

export function createGoogleController(
  service: GoogleService,
  sesi: Pick<SessionController, "serahkan">,
) {
  return {
    /** POST /auth/google → 200 dengan userId + pasangan token (PR-018b). */
    async login(req: Request, res: Response): Promise<void> {
      const input = req.body as GoogleAuth;
      const { userId, isNewUser, tokens } = await service.login(input, actorOf(req));
      res.status(200).json({
        data: { userId, isNewUser, ...sesi.serahkan(res, tokens, input.client) },
      });
    },
  };
}

export type GoogleController = ReturnType<typeof createGoogleController>;

/** Controller Sign in with Google Android (PR-090). */
export function createGoogleMobileController(
  service: GoogleMobileService,
  sesi: Pick<SessionController, "serahkan">,
) {
  return {
    /** POST /auth/google/mobile/nonce → 200 { nonce, expiresIn }. */
    async nonce(_req: Request, res: Response): Promise<void> {
      // Nonce sekali pakai tidak boleh disimpan perantara mana pun.
      res.setHeader("cache-control", "no-store");
      res.status(200).json({ data: await service.terbitkanNonce() });
    },

    /** POST /auth/google/mobile → 200 dengan userId + pasangan token (refresh di body). */
    async login(req: Request, res: Response): Promise<void> {
      const { idToken } = req.body as GoogleMobileAuth;
      const { userId, isNewUser, tokens } = await service.login(idToken, actorOf(req));
      res.status(200).json({
        data: { userId, isNewUser, ...sesi.serahkan(res, tokens, "mobile") },
      });
    },
  };
}

export type GoogleMobileController = ReturnType<typeof createGoogleMobileController>;
