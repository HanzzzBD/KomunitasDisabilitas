// modules/users — controller moderasi (PR-083). Route dijaga `access.role("admin")`.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { AdminUserIdParams, AdminUserListQuery, ModerateUser } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { appError } from "../../../core/http/index.js";
import { KursorTidakValidError } from "../../../core/pagination/index.js";
import type { ModerationActor, ModerationService } from "../services/moderation.service.js";

function aktor(req: Request): ModerationActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

const idDari = (req: Request) => (req.params as unknown as AdminUserIdParams).id;
const alasanDari = (req: Request) => (req.body as ModerateUser).reason;

export function createModerationController(service: ModerationService) {
  return {
    /** GET /api/v1/admin/users → 200 satu halaman. */
    async list(req: Request, res: Response): Promise<void> {
      try {
        res.status(200).json(await service.list(req.query as unknown as AdminUserListQuery));
      } catch (err) {
        if (err instanceof KursorTidakValidError) {
          throw appError("VALIDATION_ERROR", { hint: "Muat ulang daftar pengguna dari awal" });
        }
        throw err;
      }
    },

    /** POST /api/v1/admin/users/:id/suspend → 200 akun terkini. */
    async suspend(req: Request, res: Response): Promise<void> {
      res
        .status(200)
        .json({ data: await service.suspend(aktor(req), idDari(req), alasanDari(req)) });
    },

    /** POST /api/v1/admin/users/:id/unsuspend → 200 akun terkini. */
    async unsuspend(req: Request, res: Response): Promise<void> {
      res
        .status(200)
        .json({ data: await service.unsuspend(aktor(req), idDari(req), alasanDari(req)) });
    },
  };
}

export type ModerationController = ReturnType<typeof createModerationController>;
