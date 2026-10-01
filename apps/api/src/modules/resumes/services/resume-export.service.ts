// modules/resumes — kontributor ekspor PDP untuk CV (utang U-25, dibayar 2026-10-01).
//
// Membaca lewat service YANG SAMA dengan `GET /me/resumes` + `GET /me/resumes/:id`,
// jadi yang diunduh pengguna identik dengan yang ia lihat di editor CV. Paling
// banyak `RESUME_MAX_PER_USER` (bawaan 5) CV per orang — satu bacaan per CV
// tidak perlu jalur repository sendiri.
import type { Resume } from "@nawasena/schemas";
import type { ExportContributor } from "../../users/services/export.service.js";
import type { ResumesService } from "./resumes.service.js";

export function createResumesExportContributor(deps: {
  resumes: Pick<ResumesService, "list" | "get">;
}): ExportContributor {
  return {
    bagian: "resumes",
    async kumpulkan(userId): Promise<Resume[]> {
      const actor = { userId };
      const ringkasan = await deps.resumes.list(actor);
      return Promise.all(ringkasan.map((cv) => deps.resumes.get(actor, cv.id)));
    },
  };
}
