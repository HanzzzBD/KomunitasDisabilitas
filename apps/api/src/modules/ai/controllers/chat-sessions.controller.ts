// modules/ai — controller sesi AI CV Builder (PR-065).
//
// Param `:session` adalah id SESI, bukan id pengguna — ia dipakai sebagai
// penyaring bersama `userId` di repository, tidak pernah sendirian.
import type { Request, Response } from "express";
import type { AiChatSessionParams } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { AiChatSessionsService } from "../services/chat-sessions.service.js";

export function createAiChatSessionsController(service: AiChatSessionsService) {
  return {
    /** GET /api/v1/ai/cv-chat/:session → 200 sesi beserta transkripnya. */
    async get(req: Request, res: Response): Promise<void> {
      const { session } = req.params as unknown as AiChatSessionParams;
      // Transkrip adalah kata-kata pengguna tentang riwayat kerjanya; jangan
      // biarkan browser, service worker, atau proxy menyimpannya sebagai
      // respons yang bisa dipakai ulang.
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ data: await service.get({ userId: authOf(req).userId }, session) });
    },
  };
}

export type AiChatSessionsController = ReturnType<typeof createAiChatSessionsController>;
