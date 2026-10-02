// Kalimat galat lamaran admin (PR-077b) — pola sama `jobs-pesan-galat.ts`.
//
// Dua kode perlu kalimat sendiri: pesan bawaan server tidak menjelaskan
// bahwa admin sedang melihat baris yang sudah hilang, atau bahwa statusnya
// berubah DI ANTARA ia membuka halaman dan menekan Simpan (CAS PR-076).
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
  LAMARAN_TIDAK_DITEMUKAN: "admin.lamaran.galat.tidakDitemukan",
  STATUS_LAMARAN_TIDAK_VALID: "admin.lamaran.galat.statusBerubah",
};

export function pesanGalatLamaran(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
