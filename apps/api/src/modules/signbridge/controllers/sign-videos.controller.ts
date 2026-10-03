// modules/signbridge — controller (PR-084).
//
// `search` TIDAK memanggil `authOf(req)` — route-nya `access.public`. Endpoint
// admin memanggilnya karena route-nya `access.role("admin")`.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type {
  CreateSignVideo,
  SignVideoIdParams,
  SignVideoPresign,
  SignVideoSearchQuery,
  UpdateSignVideo,
} from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { SignVideosActor, SignVideosService } from "../services/sign-videos.service.js";

function aktorAdmin(req: Request): SignVideosActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createSignVideosController(service: SignVideosService) {
  return {
    /** GET /api/v1/sign-videos → 200 entri published (URL media presigned). */
    async search(req: Request, res: Response): Promise<void> {
      const query = req.query as unknown as SignVideoSearchQuery;
      res.status(200).json({ data: await service.search(query) });
    },

    /** GET /api/v1/sign-videos/:id → 200 satu entri terbit. */
    async getPublic(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as SignVideoIdParams;
      res.status(200).json({ data: await service.getPublic(id) });
    },

    /** GET /api/v1/admin/sign-videos → 200 seluruh entri. */
    async listAdmin(_req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.listAdmin() });
    },

    /** POST /api/v1/admin/sign-videos → 201 draft baru. */
    async createAdmin(req: Request, res: Response): Promise<void> {
      const body = req.body as CreateSignVideo;
      res.status(201).json({ data: await service.create(aktorAdmin(req), body) });
    },

    /** PUT /api/v1/admin/sign-videos/:id → 200 setelah diperbarui. */
    async updateAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as SignVideoIdParams;
      const body = req.body as UpdateSignVideo;
      res.status(200).json({ data: await service.update(aktorAdmin(req), id, body) });
    },

    /** POST /api/v1/admin/sign-videos/:id/publish → 200 setelah terbit. */
    async publishAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as SignVideoIdParams;
      res.status(200).json({ data: await service.publish(aktorAdmin(req), id) });
    },

    /** POST /api/v1/admin/sign-videos/:id/unpublish → 200 setelah kembali draft. */
    async unpublishAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as SignVideoIdParams;
      res.status(200).json({ data: await service.unpublish(aktorAdmin(req), id) });
    },

    /** POST /api/v1/admin/sign-videos/presign → 200 izin unggah satu berkas. */
    async presignAdmin(req: Request, res: Response): Promise<void> {
      // Admin wajib bersesi — `authOf` sekaligus jaring pengaman route tanpa guard.
      authOf(req);
      const body = req.body as SignVideoPresign;
      res.status(200).json({ data: await service.presign(body) });
    },
  };
}

export type SignVideosController = ReturnType<typeof createSignVideosController>;
