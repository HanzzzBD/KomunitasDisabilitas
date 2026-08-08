// Definisi route sebagai DATA, terpisah dari perakitan router.
//
// Alasannya bisa diuji: test memakai `createMemoryRouter` atas daftar yang sama
// persis dengan yang dipakai produksi. Kalau daftar ini menyatu dengan
// `createBrowserRouter`, test terpaksa merakit daftarnya sendiri — dan daftar
// kedua itu bebas menyimpang tanpa ada yang tahu.
import type { RouteObject } from "react-router";

/**
 * Tiap route memakai `lazy`, dan itu yang menghasilkan chunk terpisah — AC
 * PR-025 "Route ter-code-split". `import()` dinamis di dalamnya harus berupa
 * literal statis: bundler tidak bisa memecah apa yang jalurnya baru diketahui
 * saat runtime, dan mengubahnya menjadi variabel akan diam-diam mengembalikan
 * semuanya ke satu bundel.
 *
 * Dijaga `cek-budget.ts`: nol chunk lazy membuat CI merah.
 */
export const ruteApp: RouteObject[] = [
  {
    path: "/",
    lazy: async () => {
      const { Beranda } = await import("../routes/beranda.js");
      return { Component: Beranda };
    },
  },
  {
    // Halaman login diisi PR-030. Ada di sini sejak sekarang karena
    // `http://localhost:5173/masuk/google` SUDAH terdaftar sebagai redirect URI
    // di Google Cloud Console — jalur URL-nya bagian dari kontrak yang sudah
    // disepakati pihak luar, bukan sesuatu yang bebas dipilih belakangan.
    path: "/masuk",
    lazy: async () => {
      const { Masuk } = await import("../routes/masuk.js");
      return { Component: Masuk };
    },
  },
];
