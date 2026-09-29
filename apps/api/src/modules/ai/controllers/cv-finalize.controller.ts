// modules/ai — controller finalize AI CV Builder (PR-067).
import type { Request, Response } from "express";
import type { AiChatSessionParams } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { CvFinalizeService } from "../services/cv-finalize.service.js";

export function createCvFinalizeController(service: CvFinalizeService) {
  return {
    /**
     * POST /ai/cv-chat/:session/finalize.
     *
     * 202 selama ekstraksi berjalan (termasuk finalize GANDA — idempoten), 200
     * bila draft sudah jadi. Kodenya yang membedakan "sedang dikerjakan" dari
     * "sudah ada hasilnya", sama seperti `POST /me/resumes/:id/pdf`.
     */
    async finalisasi(req: Request, res: Response): Promise<void> {
      const { session } = req.params as unknown as AiChatSessionParams;
      const data = await service.finalisasi({ userId: authOf(req).userId }, session);
      res.set("Cache-Control", "private, no-store");
      res.status(data.status === "finalized" ? 200 : 202).json({ data });
    },
  };
}

export type CvFinalizeController = ReturnType<typeof createCvFinalizeController>;
