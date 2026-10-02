// modules/applications — controller "Lamaran Saya" (PR-076).
//
// Identitas SELALU dari sesi (`authOf`); id lamaran dari path hanya bisa
// menunjuk lamaran MILIK pemanggil (service menyaring `userId`).
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { ApplicationIdParams, PaginationQuery } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { appError } from "../../../core/http/index.js";
import { KursorTidakValidError } from "../../../core/pagination/index.js";
import type { ApplicationsActor } from "../services/apply.service.js";
import type { StatusService } from "../services/status.service.js";

function aktor(req: Request): ApplicationsActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

const idDari = (req: Request) => (req.params as unknown as ApplicationIdParams).id;

export function createStatusController(service: StatusService) {
  return {
    /** GET /api/v1/me/applications → 200 satu halaman. */
    async list(req: Request, res: Response): Promise<void> {
      try {
        res
          .status(200)
          .json(await service.list(aktor(req), req.query as unknown as PaginationQuery));
      } catch (err) {
        if (err instanceof KursorTidakValidError) {
          throw appError("VALIDATION_ERROR", { hint: "Muat ulang daftar lamaran dari awal" });
        }
        throw err;
      }
    },

    /** GET /api/v1/me/applications/:id → 200 detail + riwayat. */
    async detail(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.detail(aktor(req), idDari(req)) });
    },

    /** POST /api/v1/me/applications/:id/withdraw → 200 lamaran terkini. */
    async withdraw(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.withdraw(aktor(req), idDari(req)) });
    },

    /** POST /api/v1/me/applications/:id/confirm-hired → 200 (idempoten). */
    async confirmHired(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.confirmHired(aktor(req), idDari(req)) });
    },
  };
}

export type StatusController = ReturnType<typeof createStatusController>;
