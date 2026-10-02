// Kalimat galat alur lamar (PR-078) — pola sama `admin/lamaran-pesan-galat.ts`.
//
// Kode yang perlu kalimat sendiri adalah yang pesan bawaan servernya ditulis
// untuk konteks lain, atau yang jalan keluarnya ada DI LAYAR INI:
//   - DATA_DISABILITAS_KOSONG: server tidak tahu bahwa pilihan "Tidak" ada di
//     dialog yang sama — kalimat di sini menunjuknya;
//   - LOWONGAN_TIDAK_DITEMUKAN: dari dalam dialog artinya lowongan baru saja
//     ditutup, bukan alamat yang salah;
//   - CV_TIDAK_DITEMUKAN: CV dihapus di tab lain sejak dialog dibuka.
// `SUDAH_MELAMAR` sengaja TIDAK ada: ia bukan kegagalan (lihat `dialog-lamar`).
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
  DATA_DISABILITAS_KOSONG: "lowongan.lamar.galat.dataKosong",
  LOWONGAN_TIDAK_DITEMUKAN: "lowongan.lamar.galat.lowonganTutup",
  CV_TIDAK_DITEMUKAN: "lowongan.lamar.galat.cvHilang",
  LAMARAN_SEDANG_DIPROSES: "lowongan.lamar.galat.sedangDiproses",
};

export function pesanGalatLamar(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
