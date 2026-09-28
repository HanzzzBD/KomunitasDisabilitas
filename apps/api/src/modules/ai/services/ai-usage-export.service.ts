// modules/ai — kontributor ekspor PDP untuk jejak pemakaian AI (utang U-05).
//
// Pemicu U-05 menyala di PR-066: `POST /ai/cv-chat` adalah endpoint pertama yang
// menulis baris `ai_usage` milik seseorang. Dibayar di PR yang sama (keputusan
// owner 2026-09-28), bukan menunggu rekonsiliasi berikutnya menemukannya —
// pelajaran U-03/U-04.
//
// Yang diekspor hanya METADATA biaya; isi prompt dan jawaban memang tidak
// pernah disimpan di tabel ini (kontrak `AiUsagePeristiwa`).
import type { ExportAiUsage } from "@nawasena/schemas";
import type { ExportContributor } from "../../users/services/export.service.js";
import type { AiUsageRepository } from "../repositories/ai-usage.repository.js";

export function createAiUsageExportContributor(deps: {
  repository: Pick<AiUsageRepository, "listForExport">;
}): ExportContributor {
  return {
    bagian: "aiUsage",
    async kumpulkan(userId): Promise<ExportAiUsage[]> {
      const baris = await deps.repository.listForExport(userId);
      // Pemetaan eksplisit: kolom baru di `ai_usage` tidak punya jalan keluar
      // sendiri ke berkas yang diunduh pengguna.
      return baris.map((b) => ({
        feature: b.feature,
        provider: b.provider,
        tokensIn: b.tokensIn,
        tokensOut: b.tokensOut,
        promptVersion: b.promptVersion,
        createdAt: b.createdAt.toISOString(),
      }));
    },
  };
}
