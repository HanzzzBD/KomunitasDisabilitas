// modules/applications — controller jalur admin (PR-077a). Route dijaga
// `access.role("admin")`; aktornya dari sesi untuk audit.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type {
  AdminApplicationListQuery,
  ApplicationIdParams,
  RevealDisclosure,
  UpdateApplicationStatus,
} from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { appError } from "../../../core/http/index.js";
import { KursorTidakValidError } from "../../../core/pagination/index.js";
import type {
  AdminActor,
  AdminApplicationsService,
} from "../services/admin-applications.service.js";

function aktor(req: Request): AdminActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

const idDari = (req: Request) => (req.params as unknown as ApplicationIdParams).id;

export function createAdminApplicationsController(service: AdminApplicationsService) {
  return {
    /** GET /api/v1/admin/applications → 200 satu halaman. */
    async list(req: Request, res: Response): Promise<void> {
      try {
        res.status(200).json(await service.list(req.query as unknown as AdminApplicationListQuery));
      } catch (err) {
        if (err instanceof KursorTidakValidError) {
          throw appError("VALIDATION_ERROR", { hint: "Muat ulang daftar lamaran dari awal" });
        }
        throw err;
      }
    },

    /** GET /api/v1/admin/applications/:id → 200 detail (tanpa data disabilitas). */
    async detail(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.detail(idDari(req)) });
    },

    /** PUT /api/v1/admin/applications/:id/status → 200 detail terkini. */
    async ubahStatus(req: Request, res: Response): Promise<void> {
      const input = req.body as UpdateApplicationStatus;
      res.status(200).json({ data: await service.ubahStatus(aktor(req), idDari(req), input) });
    },

    /**
     * POST /api/v1/admin/applications/:id/disclosure → 200 salinan.
     * `Cache-Control: no-store`: data disabilitas tidak boleh tinggal di cache
     * peramban atau proxy mana pun.
     */
    async bukaPengungkapan(req: Request, res: Response): Promise<void> {
      const { reason } = req.body as RevealDisclosure;
      const data = await service.bukaPengungkapan(aktor(req), idDari(req), reason);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ data });
    },
  };
}

export type AdminApplicationsController = ReturnType<typeof createAdminApplicationsController>;
