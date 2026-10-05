// Skor kecocokan → tingkat & persen (dipindah dari apps/web `kecocokan.tsx`,
// PR-074 → PR-093). Ambang SATU untuk web dan mobile: dua salinan ambang yang
// berbeda membuat lowongan yang sama "Sangat cocok" di HP tetapi "Cocok" di web.

/** Ambang tingkat — skor deterministik 0–1 dari server (bukan urutan LLM). */
export const BATAS_TINGKAT = { tinggi: 0.7, sedang: 0.55 } as const;

export type TingkatKecocokan = "tinggi" | "sedang" | "rendah";

export function tingkatKecocokan(skor: number): TingkatKecocokan {
  if (skor >= BATAS_TINGKAT.tinggi) return "tinggi";
  if (skor >= BATAS_TINGKAT.sedang) return "sedang";
  return "rendah";
}

/** 0–100, dibulatkan; nilai di luar 0–1 dijepit. */
export function persenSkor(skor: number): number {
  return Math.round(Math.min(1, Math.max(0, skor)) * 100);
}
