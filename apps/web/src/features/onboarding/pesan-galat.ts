// Kalimat galat khas penyimpanan preferensi onboarding (PR-035).
//
// Terpisah dari komponennya dengan alasan yang sama seperti
// `features/akun/ekspor.ts`: ia tidak menyentuh DOM, jadi ia tetap bisa dipakai
// ulang mobile (features/README.md) — dan ia bisa diuji tanpa merender apa pun.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

/**
 * SATU kode saja yang perlu kalimat sendiri.
 *
 * Server sudah mengirim Bahasa Indonesia untuk sisanya (`ERROR_CATALOG`, SDD
 * §11); yang tidak bisa datang dari server hanyalah varian `id-simple`.
 * `JARINGAN_GAGAL` lahir di klien — permintaannya tidak pernah sampai — jadi
 * tidak ada kalimat server untuk dipakai sama sekali.
 */
const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "onboarding.galat.simpan",
};

export function pesanGalatSimpan(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
