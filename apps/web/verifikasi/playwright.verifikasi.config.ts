// Konfigurasi verifikasi stack nyata + NVDA (PR-068c). BUKAN bagian CI.
// Jalankan: lihat kepala `chat-nyata.verifikasi.ts` untuk prasyarat.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /\.verifikasi\.ts$/,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.VERIFIKASI_BASE_URL ?? "http://localhost:5173",
    headless: false,
    // Chromium hanya membangun pohon aksesibilitas penuh bila tahu ada pembaca
    // layar; memaksanya menghapus satu sumber hasil yang tidak menentu.
    launchOptions: { args: ["--force-renderer-accessibility"] },
    trace: "retain-on-failure",
  },
});
