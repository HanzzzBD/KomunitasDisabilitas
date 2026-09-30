// modules/matching — controller feed (PR-073).
//
// Identitas SELALU dari sesi (`authOf`), tidak pernah dari parameter: feed
// hanya milik pemanggilnya sendiri (route `access.authenticated()`), jadi
// tidak ada id pengguna di path yang bisa ditukar.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { MatchesQuery, MatchesRefreshQuery } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { appError } from "../../../core/http/index.js";
import { KursorTidakValidError } from "../../../core/pagination/index.js";
import type { MatchesService, MatchingActor } from "../services/matches.service.js";

function aktor(req: Request): MatchingActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createMatchesController(service: MatchesService) {
  return {
    /** GET /api/v1/me/matches → 200 satu halaman feed. */
    async lihat(req: Request, res: Response): Promise<void> {
      const query = req.query as unknown as MatchesQuery;
      try {
        res.status(200).json(await service.lihat(aktor(req), query));
      } catch (err) {
        // Cursor rusak ATAU milik angkatan feed yang sudah diganti — keduanya
        // kesalahan input yang dipulihkan dengan memuat ulang dari halaman 1.
        if (err instanceof KursorTidakValidError) {
          throw appError("VALIDATION_ERROR", { hint: "Muat ulang daftar lowongan dari awal" });
        }
        throw err;
      }
    },

    /** POST /api/v1/me/matches/refresh → 200 halaman 1 feed yang disegarkan. */
    async segarkan(req: Request, res: Response): Promise<void> {
      const { limit } = req.query as unknown as MatchesRefreshQuery;
      res.status(200).json(await service.segarkan(aktor(req), limit));
    },
  };
}

export type MatchesController = ReturnType<typeof createMatchesController>;
