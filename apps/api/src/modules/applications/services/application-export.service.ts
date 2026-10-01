// modules/applications — kontributor ekspor PDP untuk lamaran (PR-075).
//
// Ditulis BERSAMA endpoint pertama yang menulis `applications` (keputusan owner
// 2026-10-01) — bukan menyusul. Tiga utang sebelumnya (U-03, U-04, U-25) lahir
// persis dari "tabelnya sudah ada, ekspornya nanti".
//
// SNAPSHOT IKUT, TERDEKRIPSI, TANPA AUDIT. Pembacanya pemilik datanya sendiri,
// lewat endpoint yang identitasnya dari sesi — alasan yang sama dengan
// `profilesService.snapshotFor` (docs/akses-data-sensitif.md): tidak ada
// pengungkapan ketika subjek dan pembacanya orang yang sama.
import {
  disclosureSnapshotSchema,
  type DisclosureSnapshot,
  type ExportApplication,
} from "@nawasena/schemas";
import type { FieldCrypto } from "../../../core/crypto/index.js";
import type { ExportContributor } from "../../users/services/export.service.js";
import type { ApplicationsRepository } from "../repositories/applications.repository.js";

export function createApplicationsExportContributor(deps: {
  repo: Pick<ApplicationsRepository, "listForExport">;
  crypto: Pick<FieldCrypto, "decryptJson">;
}): ExportContributor {
  const bukaSnapshot = (ct: Uint8Array | null): DisclosureSnapshot | null =>
    ct === null ? null : disclosureSnapshotSchema.parse(deps.crypto.decryptJson(Buffer.from(ct)));

  return {
    bagian: "applications",
    async kumpulkan(userId): Promise<ExportApplication[]> {
      const rows = await deps.repo.listForExport(userId);
      return rows.map((row) => ({
        id: row.id,
        jobId: row.jobId,
        resumeId: row.resumeId,
        discloseDisability: row.discloseDisability,
        status: row.status,
        appliedAt: row.appliedAt.toISOString(),
        disclosureSnapshot: bukaSnapshot(row.disclosureSnapshot),
      }));
    },
  };
}
