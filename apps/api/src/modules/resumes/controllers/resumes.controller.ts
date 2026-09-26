// modules/resumes — controller (PR-060).
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari body/query/params.
// Param `:id` yang dibaca di bawah adalah id CV, BUKAN id pengguna — ia dipakai
// sebagai penyaring bersama `userId` di repository, tidak pernah sendirian.
import type { Request, Response } from "express";
import type { CreateResume, ResumeIdParams, UpdateResume } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { ResumesActor, ResumesService } from "../services/resumes.service.js";
import type { ResumePdfApiService } from "../pdf/api.service.js";

/** Satu-satunya cara controller ini menyusun identitas pemanggil. */
function actorOf(req: Request): ResumesActor {
  return { userId: authOf(req).userId };
}

export function createResumesController(service: ResumesService, pdf: ResumePdfApiService) {
  return {
    /** GET /me/resumes → 200 `{ data: [...] }` (ringkasan, tanpa isi CV). */
    async list(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.list(actorOf(req)) });
    },

    /** GET /me/resumes/:id → 200 `{ data }` beserta isinya. */
    async get(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as ResumeIdParams;
      res.status(200).json({ data: await service.get(actorOf(req), id) });
    },

    /** POST /me/resumes/:id/pdf → 202; idempoten untuk versi isi yang sama. */
    async requestPdf(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as ResumeIdParams;
      res.set("Cache-Control", "private, no-store");
      res.status(202).json({ data: await pdf.request(actorOf(req), id) });
    },

    /** GET /me/resumes/:id/pdf → status dan URL pendek bila sudah siap. */
    async pdfStatus(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as ResumeIdParams;
      // Respons ready membawa bearer URL sementara; jangan izinkan browser,
      // service worker, atau proxy menyimpannya sebagai respons API reusable.
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ data: await pdf.status(actorOf(req), id) });
    },

    /**
     * POST /me/resumes → 201 `{ data }`.
     *
     * 201, bukan 200: yang membedakan "CV baru lahir" dari "CV lama diperbarui"
     * hanya status ini, dan formulir yang terkirim dua kali karena koneksi
     * lambat terlihat sama saja bagi klien tanpanya — padahal CV-nya kini ada
     * dua, dan dua dari lima jatah sudah habis.
     *
     * `createdVia` tidak dibaca dari permintaan: endpoint ini SELALU
     * menghasilkan CV `manual` (lihat `createResumeSchema`).
     */
    async create(req: Request, res: Response): Promise<void> {
      const data = await service.create(actorOf(req), req.body as CreateResume);
      res.status(201).json({ data });
    },

    /** PUT /me/resumes/:id → 200 `{ data }` setelah diperbarui. */
    async update(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as ResumeIdParams;
      const data = await service.update(actorOf(req), id, req.body as UpdateResume);
      res.status(200).json({ data });
    },

    /**
     * DELETE /me/resumes/:id → 204 tanpa badan.
     *
     * Bukan 200 dengan badan kosong: tidak ada yang bisa dikembalikan tentang
     * baris yang sudah tidak ada, dan klien yang mencoba memarse badan kosong
     * sebagai JSON akan gagal pada jawaban yang sebenarnya berhasil.
     */
    async remove(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as ResumeIdParams;
      await service.remove(actorOf(req), id);
      res.status(204).end();
    },
  };
}

export type ResumesController = ReturnType<typeof createResumesController>;
