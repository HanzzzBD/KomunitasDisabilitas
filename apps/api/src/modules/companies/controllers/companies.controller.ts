// modules/companies — controller (PR-051).
//
// `getPublic` TIDAK memanggil `authOf(req)` — route-nya `access.public` (kandidat
// belum tentu punya sesi saat menilai perusahaan, US-09). Ketiga endpoint admin
// memanggilnya karena route-nya `access.role("admin")`, dan `authOf` melempar
// bila dipanggil pada route tanpa `requireAuth` — jaring pengaman yang sama
// dengan modul lain (lihat `profiles.controller.ts`).
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { CompanyIdParams, CreateCompany, UpdateCompany } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { CompaniesActor, CompaniesService } from "../services/companies.service.js";

function aktorAdmin(req: Request): CompaniesActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createCompaniesController(service: CompaniesService) {
  return {
    /** GET /api/v1/companies/:id → 200 profil publik. */
    async getPublic(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as CompanyIdParams;
      res.status(200).json({ data: await service.getPublic(id) });
    },

    /** GET /api/v1/companies/:id/jobs → 200 lowongan aktif perusahaan ini. */
    async getActiveJobs(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as CompanyIdParams;
      res.status(200).json({ data: await service.getActiveJobs(id) });
    },

    /** GET /api/v1/admin/companies → 200 seluruh perusahaan. */
    async listAdmin(_req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.listAdmin() });
    },

    /** POST /api/v1/admin/companies → 201 perusahaan baru. */
    async createAdmin(req: Request, res: Response): Promise<void> {
      const body = req.body as CreateCompany;
      res.status(201).json({ data: await service.create(aktorAdmin(req), body) });
    },

    /** PUT /api/v1/admin/companies/:id → 200 setelah diperbarui. */
    async updateAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as CompanyIdParams;
      const body = req.body as UpdateCompany;
      res.status(200).json({ data: await service.update(aktorAdmin(req), id, body) });
    },

    /** POST /api/v1/admin/companies/:id/verify → 200 setelah terverifikasi. */
    async verifyAdmin(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as CompanyIdParams;
      res.status(200).json({ data: await service.verify(aktorAdmin(req), id) });
    },
  };
}

export type CompaniesController = ReturnType<typeof createCompaniesController>;
