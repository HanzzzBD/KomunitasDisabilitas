// Kalimat galat "Lamaran Saya" (PR-079) — pola sama `pesan-galat.ts`.
//
// `STATUS_LAMARAN_TIDAK_VALID` perlu kalimat sendiri: dari layar pelamar ia
// hampir selalu berarti status berubah di antara halaman dibuka dan tombol
// ditekan (admin memindahkannya), bukan permintaan yang salah.
// `TIDAK_BERHAK`: akun admin yang membuka `/lamaran` — jalur pelamar saja.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
  LAMARAN_TIDAK_DITEMUKAN: "pelamar.galat.tidakDitemukan",
  STATUS_LAMARAN_TIDAK_VALID: "pelamar.galat.statusBerubah",
  TIDAK_BERHAK: "pelamar.galat.bukanPelamar",
};

export function pesanGalatLamaranSaya(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
