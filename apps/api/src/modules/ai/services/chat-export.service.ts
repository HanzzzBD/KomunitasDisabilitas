// modules/ai — kontributor ekspor PDP untuk transkrip AI CV Builder (PR-065).
//
// Ditulis BERSAMA tabelnya, bukan menyusul — pelajaran U-03/U-04, tempat dua
// bagian data pengguna tidak ikut terekspor selama lima phase tanpa satu pun
// penjaga menyalak. Membaca lewat service yang SAMA dengan yang melayani
// `GET /ai/cv-chat/:session`, jadi yang diunduh pengguna identik dengan yang
// ia lihat di layar.
import type { AiChatSession } from "@nawasena/schemas";
import type { ExportContributor } from "../../users/services/export.service.js";
import type { AiChatSessionsService } from "./chat-sessions.service.js";

export function createAiChatExportContributor(deps: {
  chatSessions: Pick<AiChatSessionsService, "semuaUntukEkspor">;
}): ExportContributor {
  return {
    bagian: "aiChatSessions",
    kumpulkan(userId): Promise<AiChatSession[]> {
      return deps.chatSessions.semuaUntukEkspor(userId);
    },
  };
}
