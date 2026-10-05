// Kalimat galat halaman profil (PR-040) — dua jenis, dan keduanya berbeda asal.
//
// Terpisah dari komponennya dengan alasan yang sama seperti
// `features/onboarding/pesan-galat.ts`: tidak menyentuh DOM, jadi tetap bisa
// dipakai ulang mobile (features/README.md) dan bisa diuji tanpa merender apa
// pun.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

/**
 * SATU kode saja yang perlu kalimat sendiri.
 *
 * Server sudah mengirim Bahasa Indonesia untuk sisanya (`ERROR_CATALOG`, SDD
 * §11) — termasuk `CONSENT_DIPERLUKAN`, yang kalimatnya justru lebih tepat
 * datang dari sana. `JARINGAN_GAGAL` lahir di klien: permintaannya tidak pernah
 * sampai, jadi tidak ada kalimat server untuk dipakai sama sekali.
 */
const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "profil.galat.jaringan",
};

export function pesanGalatSimpan(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}

/** Pesan galat per nama kolom, siap diberikan ke `KolomForm`. */
// Galat per kolom + `periksa`: `@nawasena/formulir` (PR-092), sama dengan mobile.
export { galatPerKolom, periksa, type GalatKolom, type HasilPeriksa } from "@nawasena/formulir";
