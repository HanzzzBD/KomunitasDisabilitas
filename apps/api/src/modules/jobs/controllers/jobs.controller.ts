// modules/jobs — controller (PR-055).
//
// `getPublic` TIDAK memanggil `authOf(req)` — route-nya `access.public`
// (kandidat belum tentu punya sesi saat melihat lowongan). Lima endpoint admin
// memanggilnya karena route-nya `access.role("admin")`, dan `authOf` melempar
// bila dipanggil pada route tanpa `requireAuth` — jaring pengaman yang sama
// dengan `companies.controller.ts`.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { CreateJob, JobIdParams, UpdateJob } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { JobsActor, JobsService } from "../services/jobs.service.js";

function aktorAdmin(req: Request): JobsActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createJobsController(service: JobsService) {
  return {
    /** GET /api/v1/jobs/:id → 200 profil publik. */
    async getPublic(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as JobIdParams;
      res.status(200).json({ data: await service.getPublic(id) });
    },

    /** GET /api/v1/admin/jobs → 200 seluruh lowongan. */
    async listAdmin(_req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.listAdmin() });
    },

    /** POST /api/v1/admin/jobs → 201 lowongan baru (lahir `draft`). */
    async createAdmin(req: Request, res: Response): Promise<void> {
      const body = req.body as CreateJob;
      res.status(201).json({ data: await service.create(aktorAdmin(req), body) });
    },

    /** PUT /api/v1/admin/jobs/:id → 200 setelah diperbarui. */
    async updateAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as JobIdParams;
      const body = req.body as UpdateJob;
      res.status(200).json({ data: await service.update(aktorAdmin(req), id, body) });
    },

    /** POST /api/v1/admin/jobs/:id/publish → 200 setelah diterbitkan. */
    async publishAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as JobIdParams;
      res.status(200).json({ data: await service.publish(aktorAdmin(req), id) });
    },

    /** POST /api/v1/admin/jobs/:id/close → 200 setelah ditutup. */
    async closeAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as JobIdParams;
      res.status(200).json({ data: await service.close(aktorAdmin(req), id) });
    },

    /** DELETE /api/v1/admin/jobs/:id → 204 tanpa badan setelah dihapus. */
    async deleteAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as JobIdParams;
      await service.remove(aktorAdmin(req), id);
      res.status(204).end();
    },
  };
}

export type JobsController = ReturnType<typeof createJobsController>;
