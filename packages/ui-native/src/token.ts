// Token aksesibilitas native — pasangan `tokenDari` web (@nawasena/a11y/web).
//
// Web menulis token ke `<html>` dan CSS membacanya; RN tidak punya kaskade, jadi
// token di sini berupa DATA yang dibaca komponen lewat konteks (konteks.tsx).
// Sumber preferensinya sama (ADR-008), angkanya dari tempat yang sama
// (`TARGET_SENTUH` di inti a11y): pengguna yang memilih target besar di web
// mendapat 56 di Android juga.
import {
  ACCESSIBILITY_DEFAULTS,
  TARGET_SENTUH,
  type AccessibilityPreferences,
} from "@nawasena/a11y";

export interface PaletNative {
  latar: string;
  teks: string;
  teksLemah: string;
  garis: string;
  utama: string;
  diAtasUtama: string;
  bahaya: string;
  diAtasBahaya: string;
  tirai: string;
}

// Selaras dengan varian Tombol web (gray-900 / putih / red-700).
// Rasio kontras yang dicantumkan diuji di __tests__/token.test.ts.
const PALET_NORMAL: PaletNative = {
  latar: "#FFFFFF",
  teks: "#111827", // 17,7:1 di atas putih
  teksLemah: "#374151", // 10,3:1
  garis: "#6B7280", // 4,8:1 — batas kolom (WCAG 1.4.11 butuh ≥ 3:1)
  utama: "#111827",
  diAtasUtama: "#FFFFFF",
  bahaya: "#B91C1C", // putih di atasnya 6,5:1
  diAtasBahaya: "#FFFFFF",
  tirai: "rgba(0, 0, 0, 0.6)",
};

// Kontras tinggi: hitam-putih murni, garis sepekat teks.
const PALET_KONTRAS_TINGGI: PaletNative = {
  latar: "#FFFFFF",
  teks: "#000000",
  teksLemah: "#000000",
  garis: "#000000",
  utama: "#000000",
  diAtasUtama: "#FFFFFF",
  bahaya: "#7F1D1D",
  diAtasBahaya: "#FFFFFF",
  tirai: "rgba(0, 0, 0, 0.85)",
};

export interface TokenNative {
  /** Pengali ukuran huruf (150% → 1.5). Ditumpuk di atas skala huruf OS. */
  skalaTeks: number;
  /** Tinggi/lebar minimum elemen interaktif, dalam dp. */
  targetSentuh: number;
  kurangiGerak: boolean;
  kontrasTinggi: boolean;
  warna: PaletNative;
}

export function tokenNativeDari(preferensi: AccessibilityPreferences): TokenNative {
  return {
    skalaTeks: preferensi.textScale / 100,
    targetSentuh: preferensi.largeTouchTargets ? TARGET_SENTUH.besar : TARGET_SENTUH.normal,
    kurangiGerak: preferensi.reduceMotion,
    kontrasTinggi: preferensi.highContrast,
    warna: preferensi.highContrast ? PALET_KONTRAS_TINGGI : PALET_NORMAL,
  };
}

export const TOKEN_BAWAAN: TokenNative = tokenNativeDari(ACCESSIBILITY_DEFAULTS);

/** Ukuran huruf dasar (dp) per peran, sebelum dikali `skalaTeks`. */
export const UKURAN_HURUF = { isi: 16, label: 16, judul: 22 } as const;
