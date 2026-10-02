// modules/applications — controller apply (PR-075).
//
// Identitas SELALU dari sesi (`authOf`); lowongan dari path; Idempotency-Key
// dari header. Tidak ada id pengguna di input yang bisa ditukar.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { idempotencyKeySchema, type ApplyJob, type JobIdParams } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { appError } from "../../../core/http/index.js";
import type { ApplicationsActor, ApplyService } from "../services/apply.service.js";

function aktor(req: Request): ApplicationsActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createApplyController(service: ApplyService) {
  return {
    /**
     * POST /api/v1/jobs/:id/apply → 201 lamaran.
     *
     * Putar ulang (Idempotency-Key sama) menjawab 201 yang SAMA ditambah header
     * `Idempotent-Replayed: true` — klien yang mengulang karena koneksi putus
     * harus menerima jawaban yang seharusnya ia terima pertama kali, bukan
     * jawaban baru yang memaksanya bercabang.
     */
    async apply(req: Request, res: Response): Promise<void> {
      const kunci = idempotencyKeySchema.safeParse(req.get("Idempotency-Key"));
      if (!kunci.success) throw appError("IDEMPOTENCY_KEY_DIPERLUKAN");

      const { id } = req.params as unknown as JobIdParams;
      const hasil = await service.apply(aktor(req), id, req.body as ApplyJob, kunci.data);
      if (hasil.replay) res.setHeader("Idempotent-Replayed", "true");
      res.status(201).json({ data: hasil.application });
    },
  };
}

export type ApplyController = ReturnType<typeof createApplyController>;
