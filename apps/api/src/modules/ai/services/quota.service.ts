// modules/ai — service kuota AI (PR-043).
//
// Aturan yang mengikat berkas ini, sama dengan `modules/accessibility`: userId
// SELALU datang dari sesi, TIDAK PERNAH dari input. Tidak ada parameter untuk
// menyebut pengguna lain — bukan pemeriksaan yang bisa lupa dipasang,
// melainkan saluran yang memang tidak ada.
//
// Lapisannya tipis dengan sengaja: seluruh aturan kuota tinggal di
// `core/ai/quota.ts` (satu pintu, ADR-012), dan menyalin sebagiannya ke sini
// hanya akan melahirkan dua sumber kebenaran yang bebas menyimpang. Yang
// dikerjakan service ini adalah hal yang memang miliknya — membentuk jawaban
// API dari keadaan mesin kuota.
import type { AiQuota, AiQuotaRingkasan } from "../../../core/ai/index.js";

/** Konteks pemanggil — bentuknya sama dengan `AccessibilityActor` (PR-034). */
export interface AiQuotaActor {
  userId: string;
}

export interface AiQuotaServiceDeps {
  quota: AiQuota;
}

export function createAiQuotaService(deps: AiQuotaServiceDeps) {
  const { quota } = deps;

  return {
    /**
     * GET /ai/quota — jatah pemilik sesi hari ini (WIB).
     *
     * TIDAK menyentuh penghitung: endpoint baca yang ikut menaikkan jatah akan
     * membuat membuka halaman terasa seperti memakai AI.
     */
    async getMe(actor: AiQuotaActor): Promise<AiQuotaRingkasan> {
      return quota.ringkasan(actor.userId);
    },
  };
}

export type AiQuotaService = ReturnType<typeof createAiQuotaService>;
