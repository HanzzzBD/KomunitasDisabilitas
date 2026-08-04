// modules/auth — controller login Google: request ↔ service. Body sudah
// tervalidasi middleware validate() (skema zod @nawasena/schemas), jadi di sini
// tidak ada pemeriksaan input ad-hoc.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { GoogleAuth } from "@nawasena/schemas";
import type { GoogleActor, GoogleService } from "../services/google.service.js";

/**
 * requestId dari pino-http (uuid v4) dipakai audit. Fallback dibuat bila
 * middleware logger tidak terpasang (mis. test unit router) — audit menolak
 * requestId non-UUID, dan kehilangan jejak audit lebih buruk daripada uuid baru.
 */
function actorOf(req: Request): GoogleActor {
  return { requestId: typeof req.id === "string" ? req.id : randomUUID() };
}

export function createGoogleController(service: GoogleService) {
  return {
    /** POST /auth/google → 200 dengan userId (JWT menyusul di PR-018). */
    async login(req: Request, res: Response): Promise<void> {
      const data = await service.login(req.body as GoogleAuth, actorOf(req));
      res.status(200).json({ data });
    },
  };
}

export type GoogleController = ReturnType<typeof createGoogleController>;
