// Agregat SELURUH katalog — untuk PENJAGA CI dan test, BUKAN untuk aplikasi.
//
// Berkas ini sengaja dipisahkan dari `index.ts`. Sebelum pemuatan malas, kedua
// isi ini tinggal serumah, dan itulah yang membuat seluruh teks aplikasi masuk
// bundel awal: satu `import` dari kode aplikasi ke berkas yang menyebut keenam
// katalog sudah cukup untuk menyeret semuanya.
//
// ATURANNYA: kode di `src/` (di luar test) TIDAK BOLEH mengimpor berkas ini.
// Dijaga `i18n-lazy.test.ts` — pelanggarannya mengembalikan bundel ke keadaan
// semula tanpa gejala yang terlihat selain angka yang perlahan naik.
import { katalogShell } from "./shell.js";
import { katalogAuth } from "./auth.js";
import { katalogBeranda } from "./beranda.js";
import { katalogPengaturan } from "./pengaturan.js";
import { katalogOnboarding } from "./onboarding.js";
import { katalogProfil } from "./profil.js";

/** Katalog gabungan lengkap. Dipakai test yang ingin merender tanpa memuat. */
export const katalog = {
  ...katalogShell,
  ...katalogAuth,
  ...katalogBeranda,
  ...katalogPengaturan,
  ...katalogOnboarding,
  ...katalogProfil,
} as const;

/**
 * Daftar fitur beserta katalognya — dipakai penjaga CI.
 *
 * Ada BERDAMPINGAN dengan `katalog` di atas, dan itu duplikasi yang disengaja:
 * `katalog` memakai spread literal supaya `KunciTeks` tetap berupa union kunci
 * yang tepat (`Object.assign` akan melunturkannya menjadi `string`). Duplikasi
 * itu sendiri dijaga — `katalog-kelengkapan.test.ts` menuntut kedua daftar
 * memuat kunci yang persis sama.
 */
export const fiturKatalog = [
  { nama: "shell", entri: katalogShell },
  { nama: "auth", entri: katalogAuth },
  { nama: "beranda", entri: katalogBeranda },
  { nama: "pengaturan", entri: katalogPengaturan },
  { nama: "onboarding", entri: katalogOnboarding },
  { nama: "profil", entri: katalogProfil },
] as const;
