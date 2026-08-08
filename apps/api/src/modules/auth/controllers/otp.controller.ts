// modules/auth — controller OTP: request ↔ service. Body sudah tervalidasi
// middleware validate() (skema zod @nawasena/schemas), jadi di sini tidak ada
// pemeriksaan input ad-hoc.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { RequestOtp, VerifyOtp } from "@nawasena/schemas";
import type { OtpActor, OtpService } from "../services/otp.service.js";
import type { SessionController } from "./session.controller.js";

/**
 * requestId dari pino-http (uuid v4) dipakai audit. Fallback dibuat bila
 * middleware logger tidak terpasang (mis. test unit router) — audit menolak
 * requestId non-UUID, dan kehilangan jejak audit lebih buruk daripada uuid baru.
 */
function actorOf(req: Request): OtpActor {
  return { requestId: typeof req.id === "string" ? req.id : randomUUID() };
}

export function createOtpController(service: OtpService, sesi: Pick<SessionController, "serahkan">) {
  return {
    /** POST /auth/otp/request → 202 (permintaan diterima, pengiriman selesai). */
    async request(req: Request, res: Response): Promise<void> {
      const data = await service.request(req.body as RequestOtp, actorOf(req));
      res.status(202).json({ data });
    },

    /** POST /auth/otp/verify → 200 dengan userId + pasangan token (PR-018b). */
    async verify(req: Request, res: Response): Promise<void> {
      const input = req.body as VerifyOtp;
      const { userId, isNewUser, tokens } = await service.verify(input, actorOf(req));
      res.status(200).json({
        data: { userId, isNewUser, ...sesi.serahkan(res, tokens, input.client) },
      });
    },
  };
}

export type OtpController = ReturnType<typeof createOtpController>;
