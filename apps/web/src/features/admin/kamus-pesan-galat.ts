// Kalimat galat kamus BISINDO (PR-085b) — pola sama `jobs-pesan-galat.ts`.
//
// Kode yang butuh kalimat sendiri: yang menyebut TINDAKAN berbeda dari pesan
// server. `VIDEO_ISYARAT_BELUM_LENGKAP` tidak ada di sini — `hint` server sudah
// menyebut persis apa yang kurang, dan `pesanGalatApi` menampilkannya.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
  VIDEO_ISYARAT_TIDAK_DITEMUKAN: "admin.kamus.galat.tidakDitemukan",
  BELUM_SIAP: "admin.kamus.galat.storageBelumSiap",
};

export function pesanGalatKamus(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
