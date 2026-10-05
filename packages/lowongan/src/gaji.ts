// Kalimat gaji lowongan (dipindah dari apps/web `gaji.ts`, PR-059 → PR-093).
//
// "Visible" DIPUTUSKAN SERVER: `salaryMin`/`salaryMax` sudah `null` di jawaban
// publik bila perusahaan menyembunyikan gajinya (PR-055). Keduanya `null` →
// tidak ada kalimat, dan baris "Gaji" tidak dirender sama sekali — bukan "Rp0"
// dan bukan "tidak disebutkan", yang menyiratkan sesuatu yang tidak dikatakan.
import { KUNCI_GAJI, type LabelLowongan } from "./label.js";

const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(nilai: number): string {
  return RUPIAH.format(nilai);
}

export function kalimatGaji(
  label: LabelLowongan,
  min: number | null,
  max: number | null,
): string | null {
  if (min !== null && max !== null) {
    return label(KUNCI_GAJI.rentang, { min: formatRupiah(min), max: formatRupiah(max) });
  }
  if (min !== null) return label(KUNCI_GAJI.mulai, { min: formatRupiah(min) });
  if (max !== null) return label(KUNCI_GAJI.hingga, { max: formatRupiah(max) });
  return null;
}
