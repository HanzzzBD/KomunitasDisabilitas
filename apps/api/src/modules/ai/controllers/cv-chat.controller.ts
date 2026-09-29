// modules/ai — controller percakapan AI CV Builder (PR-066).
//
// AUTH DI HANDSHAKE, LEWAT HEADER. Ketiga route ber-guard `authenticated` biasa:
// token datang di `Authorization`, tidak pernah di query string (URL berakhir di
// log akses dan proxy). Akibatnya klien tidak bisa memakai `EventSource` bawaan
// browser — ia tidak bisa mengirim header — dan PR-068 memakai fetch-SSE. Itu
// harga yang dibayar sadar (log PR-045).
import type { Request, Response } from "express";
import type { AiChatSessionParams, AiCvChatRequest } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { appError } from "../../../core/http/index.js";
import type { CvChatService } from "../services/cv-chat.service.js";

/**
 * Header `Last-Event-Id` → nomor event. Absen = sambungan tanpa riwayat.
 * Nilai yang bukan bilangan bulat tak-negatif DITOLAK 400, bukan dianggap 0:
 * menganggapnya 0 akan memutar ulang seluruh aliran dan menggandakan teks di
 * layar klien yang sebenarnya hanya salah kirim header.
 */
function lastEventIdDari(req: Request): number | undefined {
  const nilai = req.header("last-event-id");
  if (nilai === undefined || nilai === "") return undefined;
  if (!/^\d{1,9}$/.test(nilai)) {
    throw appError("VALIDATION_ERROR", { hint: "Header Last-Event-Id harus berupa angka" });
  }
  return Number(nilai);
}

export function createCvChatController(service: CvChatService) {
  return {
    /** POST /ai/cv-chat/sessions → 201 sesi baru (dengan salam) / 200 sesi aktif. */
    async mulai(req: Request, res: Response): Promise<void> {
      const { session, baru } = await service.mulai({ userId: authOf(req).userId });
      res.set("Cache-Control", "private, no-store");
      res.status(baru ? 201 : 200).json({ data: session });
    },

    /**
     * POST /ai/cv-chat → text/event-stream.
     *
     * `siapkan` SEBELUM `lampirkan`: sampai baris itu, kegagalan masih bisa
     * dijawab JSON oleh errorHandler global. Sesudahnya header SSE sudah
     * terkirim, dan `jalankan` tidak pernah melempar.
     */
    async kirim(req: Request, res: Response): Promise<void> {
      const aliran = await service.siapkan(
        { userId: authOf(req).userId },
        req.body as AiCvChatRequest,
      );
      await aliran.sesi.lampirkan(res);
      await aliran.jalankan();
    },

    /** GET /ai/cv-chat/:session/stream → sambung ulang dengan `Last-Event-Id`. */
    async sambung(req: Request, res: Response): Promise<void> {
      const { session } = req.params as unknown as AiChatSessionParams;
      const lastEventId = lastEventIdDari(req);
      const sesi = service.sambungUlang({ userId: authOf(req).userId }, session);
      await sesi.lampirkan(res, lastEventId);
    },
  };
}

export type CvChatController = ReturnType<typeof createCvChatController>;
