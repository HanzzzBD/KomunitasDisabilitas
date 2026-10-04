// modules/ai — controller "Sederhanakan" (PR-087).
import type { Request, Response } from "express";
import type { AiSimplifyTextRequest } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { SimplifyService } from "../services/simplify.service.js";

export function createSimplifyController(service: SimplifyService) {
  return {
    /**
     * POST /ai/simplify-text — SELALU 200 untuk permintaan yang sah. Degradasi
     * ditandai `meta.degraded: true` + `data.alasan`, bukan status error
     * (aturan 1 tabel pola degradasi PR-046).
     *
     * `no-store`: jawaban memotong jatah pemanggil, jadi tidak boleh disajikan
     * ulang oleh cache HTTP mana pun — cache yang sah hidup di server.
     */
    async sederhanakan(req: Request, res: Response): Promise<void> {
      const body = req.body as AiSimplifyTextRequest;
      const data = await service.sederhanakan({ userId: authOf(req).userId }, body);
      res.set("Cache-Control", "private, no-store");
      res.status(200).json(data.alasan === null ? { data } : { data, meta: { degraded: true } });
    },
  };
}

export type SimplifyController = ReturnType<typeof createSimplifyController>;
