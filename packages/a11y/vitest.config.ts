// Test paket ini berjalan di DUA lingkungan:
//   - inti (store, rekonsiliasi) murni Node — tidak butuh DOM sama sekali;
//   - adapter web (token, matchMedia) butuh jsdom.
//
// Dipakai `environment: "jsdom"` untuk semuanya, bukan per-berkas: memisahkan
// keduanya lewat komentar `@vitest-environment` membuat berkas inti bisa
// diam-diam mulai memakai DOM tanpa ada yang menyadari. Penjagaan "inti bebas
// DOM" ditegakkan penjaga tersendiri (`web-terpisah.test.ts`), bukan oleh
// ketiadaan DOM saat test.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    fileParallelism: false,
  },
});
