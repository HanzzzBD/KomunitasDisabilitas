/// <reference types="vitest" />
// Konfigurasi Vite + Vitest dalam satu berkas: keduanya membaca resolver dan
// plugin yang sama, jadi memisahkannya hanya menciptakan dua sumber kebenaran
// yang bisa menyimpang.
//
// Versi Vite DIKUNCI ke 5.4.21 — versi yang sama dengan yang dibawa vitest
// 2.1.8 sebagai dependensinya. Memakai Vite 6 di sini membuat DUA salinan Vite
// hidup berdampingan, dan `defineConfig` dari `vitest/config` (bertipe Vite 5)
// menolak plugin bertipe Vite 6 dengan galat identitas tipe sepanjang halaman.
// Menaikkan vitest adalah perubahan lintas seluruh workspace — di luar scope
// PR ini, jadi yang disamakan adalah Vite-nya.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 adalah default Vite dan SUDAH terdaftar sebagai Authorized redirect
    // URI di Google Cloud Console (http://localhost:5173/masuk/google).
    // Mengubahnya berarti alur login Google berhenti bekerja sampai Console
    // ikut diubah — jadi port ini dikunci, bukan dibiarkan bergeser.
    port: 5173,
    strictPort: true,
  },
  build: {
    // Peta sumber tetap dibuat: menelusuri kegagalan produksi tanpa peta sumber
    // berarti membaca jejak yang sudah diminifikasi. Ia tidak ikut terhitung
    // dalam budget bundle (hanya .js awal yang dihitung — lihat cek-budget.mjs).
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./__tests__/setup.ts"],
    // Sejajar dengan apps/api: berkas test berjalan berurutan supaya kegagalan
    // bisa dibaca tanpa menebak test mana yang berbenturan.
    fileParallelism: false,
  },
});
