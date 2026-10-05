// Navigasi langkah wizard onboarding mobile (PR-091) — paritas
// `apps/web/src/features/onboarding/mesin-langkah.ts` (PR-035): empat langkah
// yang sama, urutan yang sama, batas yang ditegakkan di reducer.
//
// Salinan, bukan impor: `features/` web tidak bisa diimpor dari app lain, dan
// reducer sekecil ini tidak sepadan dengan paket baru. `LEWATI`/`SELESAI`
// sengaja bukan aksi — keduanya jalan keluar (koordinator.selesaikan), sama
// seperti di web.

export const LANGKAH = ["ragam", "persetujuan", "preferensi", "ringkasan"] as const;

export type Langkah = (typeof LANGKAH)[number];

export const JUDUL_LANGKAH: Readonly<Record<Langkah, string>> = {
  // Varian sederhana katalog web (`onboarding.langkah.*`, id-simple).
  ragam: "Kondisi Anda",
  persetujuan: "Izin Anda",
  preferensi: "Tampilan aplikasi",
  ringkasan: "Ringkasan",
};

export interface StateWizard {
  indeks: number;
}

export type AksiWizard = { type: "MAJU" } | { type: "MUNDUR" };

export const STATE_AWAL: StateWizard = { indeks: 0 };

export function reduksiWizard(state: StateWizard, aksi: AksiWizard): StateWizard {
  if (aksi.type === "MAJU") {
    return state.indeks >= LANGKAH.length - 1 ? state : { indeks: state.indeks + 1 };
  }
  return state.indeks <= 0 ? state : { indeks: state.indeks - 1 };
}

export function langkahSaatIni(state: StateWizard): Langkah {
  return LANGKAH[state.indeks] ?? LANGKAH[0];
}

/** Skala teks yang ditawarkan — sama dengan slider web (100–200, langkah 25). */
export const SKALA_TEKS = { min: 100, maks: 200, langkah: 25 } as const;

export function geserSkala(nilai: number, arah: 1 | -1): number {
  const baru = nilai + arah * SKALA_TEKS.langkah;
  return Math.min(SKALA_TEKS.maks, Math.max(SKALA_TEKS.min, baru));
}
