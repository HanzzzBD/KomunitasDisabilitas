// modules/ai — kebijakan retensi `ai_chat_sessions` (PR-065, SDD §6.4).
//
// Hidup di modul pemilik tabelnya, bukan di berkas maintenance — pola registry
// PR-024a yang sama dengan `refresh_tokens` di modul auth. Mesinnya (batch,
// batas per run, dry-run, audit) tetap milik `users/services/retention.service`.
//
// DUA KATEGORI, SATU ANGKA (keputusan owner 2026-09-28):
//   finalized — 30 hari setelah `finalized_at` (bunyi SDD §6.4). Draft CV-nya
//               sudah ada di `resumes`; transkrip hanya bahan mentahnya.
//   abandoned — 30 hari setelah aktivitas terakhir untuk sesi yang TIDAK
//               PERNAH selesai. SDD diam soal ini, dan diam berarti transkrip
//               yang ditinggal di tengah akan hidup selamanya — kebalikan dari
//               minimisasi PDP yang menjadi alasan retensi ini ada.
//
// Menunjuk berkas SERVICE modul users, bukan barrel-nya — alasan lengkapnya di
// kepala `auth/services/retention.service.ts` (barrel mengekspor repository).
import type { RetentionPolicy } from "../../users/services/retention.service.js";
import type {
  ChatSessionsRepository,
  KategoriRetensiChat,
} from "../repositories/chat-sessions.repository.js";

function cutoff(now: Date, hari: number): Date {
  return new Date(now.getTime() - hari * 86_400_000);
}

export function createAiChatSessionPolicies(deps: {
  repository: Pick<ChatSessionsRepository, "countRetention" | "deleteRetentionBatch">;
  /** `env.RETENTION_AI_CHAT_SESSIONS_DAYS` — bawaan 30. */
  days: number;
}): RetentionPolicy[] {
  const { repository, days } = deps;

  // Dipisah per kategori supaya laporan menyebut mana yang bergerak: sesi
  // abandoned yang terus bertambah adalah sinyal produk (orang berhenti di
  // tengah wawancara), bukan sekadar angka kebersihan.
  const buat = (kategori: KategoriRetensiChat): RetentionPolicy => ({
    nama: `ai_chat_sessions.${kategori}`,
    hitung: (now) => repository.countRetention(kategori, cutoff(now, days)),
    hapus: (now, batas) => repository.deleteRetentionBatch(kategori, cutoff(now, days), batas),
  });

  return [buat("finalized"), buat("abandoned")];
}
