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
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
// Tailwind v4 masuk sebagai plugin Vite (ADR-019), bukan lewat PostCSS.
// Konsekuensinya `postcss.config.cjs` dan `tailwind.config.cjs` hilang: v4
// tidak punya berkas konfigurasi JS, dan autoprefixer sudah bawaan.
import tailwindcss from "@tailwindcss/vite";
import { SKRIP_PRA_PAINT } from "./src/shared/a11y/skrip-pra-paint.js";

/**
 * Menyuntikkan skrip anti-flash ke `<head>` saat build DAN saat dev.
 *
 * Disuntik dari sini alih-alih ditulis tangan di `index.html` supaya sumbernya
 * satu: berkas TypeScript yang bisa diuji. Skrip yang hidup sebagai teks di
 * dalam HTML tidak pernah punya test, dan tidak pernah ikut berubah saat
 * aturan tokennya berubah.
 *
 * Ditempatkan sebagai skrip INLINE, bukan berkas terpisah: berkas eksternal
 * menambah satu perjalanan jaringan sebelum halaman boleh tergambar — persis
 * penundaan yang hendak kita hindari.
 */
function suntikSkripPraPaint(): Plugin {
  return {
    name: "nawasena-pra-paint",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { "data-nawasena": "pra-paint" },
          children: SKRIP_PRA_PAINT,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), suntikSkripPraPaint()],
  server: {
    // 5173 adalah default Vite dan SUDAH terdaftar sebagai Authorized redirect
    // URI di Google Cloud Console (http://localhost:5173/masuk/google).
    // Mengubahnya berarti alur login Google berhenti bekerja sampai Console
    // ikut diubah — jadi port ini dikunci, bukan dibiarkan bergeser.
    port: 5173,
    strictPort: true,

    /**
     * API dev diteruskan lewat origin yang SAMA dengan web (PR-034).
     *
     * KENAPA INI WAJIB, bukan kenyamanan. Tiga hal saling mengunci:
     *
     *   1. `apps/web/src/app/klien-api.tsx` memakai baseUrl RELATIF `/api/v1`,
     *      tanpa jalan menimpanya lewat env. Tanpa proxy, permintaan mendarat
     *      di server dev ini dan dijawab HTML fallback SPA — bukan 404 yang
     *      jelas, melainkan JSON yang gagal diparse.
     *   2. `packages/api-client` tidak pernah menyetel `credentials`, jadi
     *      bawaannya `same-origin`: cookie tidak ikut ke origin lain meski
     *      alamatnya dibuat absolut.
     *   3. Cookie refresh ber-`SameSite=Strict`, yang memang menolak
     *      dilampirkan pada permintaan lintas situs.
     *
     * Artinya alur sesi TIDAK MUNGKIN berjalan di dev dengan web dan API di
     * origin berbeda. Proxy ini menyatukan keduanya di `localhost:5173`,
     * sehingga cookie ber-`Path=/api/v1/auth` ikut terkirim apa adanya.
     * Ditemukan saat menyiapkan verifikasi manual Google OAuth — sampai saat
     * itu alur ini memang belum pernah dijalankan sungguhan.
     *
     * HANYA DEVELOPMENT. `vite build` tidak membaca `server`, jadi produksi
     * tidak tersentuh: di sana web dan API disajikan satu origin oleh reverse
     * proxy (Phase 16). Kontrak API, api-client, kebijakan cookie, dan alur
     * auth tidak diubah sama sekali oleh PR ini.
     */
    proxy: {
      // Prefix, bukan regex: Vite mencocokkan awalan dan meneruskan sisa jalur
      // apa adanya, jadi `/api/v1/auth/refresh` sampai sebagai jalur yang sama
      // persis. Tidak ada `rewrite` — API memang melayani di bawah `/api/v1`.
      "/api/v1": {
        target: "http://localhost:3000",
        // Host asli DIPERTAHANKAN (`localhost:5173`). Cookie tidak terpengaruh
        // — server tidak menyetel atribut `Domain`, dan cookie mengabaikan
        // port — sementara log API tetap menunjukkan asal permintaan yang
        // sebenarnya alih-alih dirinya sendiri.
        changeOrigin: false,
      },
    },
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
    // `e2e/` milik Playwright, bukan vitest (PR-031b). Keduanya memakai nama
    // `test`/`expect` yang mirip tetapi dari pustaka berbeda; tanpa batas ini
    // vitest ikut memungut spec Playwright dan gagal dengan pesan yang tidak
    // menyebut sebabnya. Registry-nya sendiri TETAP diuji vitest lewat
    // `__tests__/registry-halaman.test.ts` — yang murah dan tidak butuh peramban.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
