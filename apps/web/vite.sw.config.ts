// Build kedua, khusus service worker.
//
// Terpisah dari build utama karena keluarannya harus berbeda dalam tiga hal
// yang tidak bisa dicampur dalam satu konfigurasi Rollup:
//
//   1. `format: "iife"` — service worker klasik, bukan modul ES. Modul service
//      worker belum didukung merata (Safari), dan ini fondasi yang harus
//      berjalan di mana-mana, bukan hanya di browser terbaru.
//   2. Nama berkas TETAP `sw.js`, tanpa hash. Cakupan sebuah service worker
//      ditentukan JALURNYA, dan browser mencari berkas yang sama pada tiap
//      kunjungan — nama yang berubah tiap build berarti pendaftaran yang
//      berubah tiap build.
//   3. `emptyOutDir: false` — build ini berjalan SETELAH build utama dan
//      menumpang direktori `dist` yang sama. Tanpa ini, ia menghapus seluruh
//      hasil build aplikasi.
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    emptyOutDir: false,
    // Tanpa peta sumber: berkas ini kecil dan tidak pernah ditelusuri lewat
    // stack trace aplikasi; petanya hanya menambah berkas di `dist` yang harus
    // dijelaskan ke penjaga budget.
    sourcemap: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/shared/pwa/sw.ts"),
      output: {
        format: "iife",
        entryFileNames: "sw.js",
        dir: resolve(import.meta.dirname, "dist"),
      },
    },
  },
});
