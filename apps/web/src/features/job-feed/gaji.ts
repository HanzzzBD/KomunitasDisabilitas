// Kalimat gaji lowongan (PR-059) — AC "gaji bila visible".
//
// "Visible" DIPUTUSKAN SERVER, bukan di sini: `salaryMin`/`salaryMax` sudah
// `null` di jawaban publik bila perusahaan menyembunyikan gajinya (PR-055).
// Kedua `null` → tidak ada kalimat, dan baris "Gaji" tidak dirender sama
// sekali — bukan "Rp0" dan bukan "tidak disebutkan", yang sama-sama
// menyiratkan sesuatu yang tidak dikatakan perusahaan.
import type { FungsiTeks } from "../../shared/i18n/index.js";

const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function kalimatGaji(t: FungsiTeks, min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) {
    return t("lowongan.detail.gaji.rentang", { min: RUPIAH.format(min), max: RUPIAH.format(max) });
  }
  if (min !== null) return t("lowongan.detail.gaji.mulai", { min: RUPIAH.format(min) });
  if (max !== null) return t("lowongan.detail.gaji.hingga", { max: RUPIAH.format(max) });
  return null;
}
