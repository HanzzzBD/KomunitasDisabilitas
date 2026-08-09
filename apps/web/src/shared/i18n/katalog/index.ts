// Perakitan katalog dari potongan per fitur.
//
// Satu berkas per fitur, bukan satu berkas raksasa: katalog terpusat adalah
// tempat setiap PR fitur bertabrakan saat merge, dan tempat kunci yang sudah
// tidak dipakai menumpuk tanpa ada yang berani menghapusnya.
import { katalogShell } from "./shell.js";
import { katalogAuth } from "./auth.js";

/**
 * Katalog gabungan. Tiap fitur menyumbang kuncinya sendiri di sini.
 *
 * Berikutnya: `pengaturan` (PR-033), `lowongan` (Phase 08).
 */
export const katalog = {
  ...katalogShell,
  ...katalogAuth,
} as const;

/**
 * Daftar fitur beserta katalognya — dipakai penjaga CI, bukan kode aplikasi.
 *
 * Ada BERDAMPINGAN dengan `katalog` di atas, dan itu duplikasi yang disengaja:
 * `katalog` memakai spread literal supaya `KunciTeks` di bawah tetap berupa
 * union kunci yang tepat (`Object.assign` akan melunturkannya menjadi
 * `string`). Duplikasi itu sendiri dijaga — `katalog-kelengkapan.test.ts`
 * menuntut kedua daftar memuat kunci yang persis sama, jadi fitur yang
 * ditambahkan ke salah satunya saja membuat CI merah.
 */
export const fiturKatalog = [
  { nama: "shell", entri: katalogShell },
  { nama: "auth", entri: katalogAuth },
] as const;

/**
 * Seluruh kunci yang sah, diturunkan dari katalog — bukan ditulis ulang.
 *
 * Inilah yang membuat kunci salah ketik menjadi galat `typecheck`, bukan teks
 * aneh yang baru ketahuan di layar pengguna. Menuliskan daftar kunci secara
 * manual akan menghadirkan sumber kebenaran kedua yang bebas menyimpang.
 */
export type KunciTeks = keyof typeof katalog;
