// Ekspor data pribadi (PR-033b) — bagian yang TIDAK menyentuh DOM.
//
// Penyerahan berkasnya sendiri ada di `shared/unduh-berkas.ts`; berkas ini
// hanya tahu nama berkas dan kalimat galatnya, sehingga tetap bisa dipakai
// ulang mobile (features/README.md).
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

/**
 * Kode galat khas ekspor.
 *
 * `TERLALU_BANYAK_PERMINTAAN` di sini berarti "jatah unduhan hari ini habis",
 * BUKAN "terlalu sering mencoba masuk" — kode yang sama, arti yang berbeda dari
 * alur auth. Server sudah mengirim kalimat yang tepat untuk keadaan ini, tetapi
 * ia tidak punya varian `id-simple`; itulah satu-satunya alasan entri ini ada.
 */
const PER_KODE: PetaGalat = {
  TERLALU_BANYAK_PERMINTAAN: "pengaturan.ekspor.galat.jatahHabis",
  JARINGAN_GAGAL: "shell.galat.jaringan",
};

export function pesanGalatEkspor(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}

/**
 * Nama berkas unduhan.
 *
 * BERTANGGAL, dan itu bukan hiasan. Ekspor boleh diambil tiga kali sehari dan
 * akan diambil lagi berbulan-bulan kemudian; tanpa tanggal, unduhan kedua
 * mendarat sebagai `data-saya (1).json` di folder Unduhan dan tidak ada cara
 * mengetahui mana yang lebih baru selain membukanya.
 *
 * Formatnya `YYYY-MM-DD` supaya berkas-berkas itu berurutan secara alfabet —
 * yaitu juga berurutan secara waktu. Tanggalnya diambil dari isi berkas
 * (`exportedAt`), bukan dari jam perangkat: keduanya bisa berbeda, dan yang
 * benar adalah yang tercatat di dalam berkasnya.
 *
 * Zonanya WIB dan ditulis eksplisit, sama seperti tanggal bergabung di panel
 * akun. `exportedAt` datang dalam UTC, jadi memotong sepuluh huruf pertamanya
 * akan memberi TANGGAL KEMARIN bagi siapa pun yang mengunduh sesudah pukul
 * tujuh malam — dan nama berkas yang tanggalnya meleset sehari persis
 * menghapus satu-satunya guna tanggal itu: mengurutkan unduhan.
 */
const TANGGAL_BERKAS = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function namaBerkasEkspor(exportedAt: string): string {
  // `en-CA` menghasilkan YYYY-MM-DD. Dipilih karena itu satu-satunya cara
  // memformat tanggal berzona tanpa merakit potongannya sendiri.
  return `nawasena-data-saya-${TANGGAL_BERKAS.format(new Date(exportedAt))}.json`;
}
