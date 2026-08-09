// Konfigurasi Playwright — gerbang aksesibilitas LAPIS KETIGA (PR-031b).
//
// Lapis ini yang menutup apa yang tidak bisa diperiksa jsdom: kontras warna,
// ukuran target sentuh, dan elemen yang tertutup elemen lain. Ketiganya butuh
// tata letak dan kaskade CSS yang sungguhan — daftar `TAK_BISA_DI_JSDOM` di
// `@nawasena/a11y/pengujian` menyebutnya sejak PR-031a sebagai utang yang
// jatuh tempo di sini.
import { defineConfig, devices } from "@playwright/test";

/**
 * Peramban yang dipakai.
 *
 * `chromium` (unduhan Playwright) di CI, dan `chrome` (yang sudah terpasang)
 * bila `PW_CHANNEL=chrome` — supaya gerbang ini bisa dijalankan di mesin
 * pengembang tanpa mengunduh ± 150 MB lebih dulu. Keduanya Chromium; axe dan
 * Lighthouse berperilaku sama.
 */
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  // Gerbang tidak boleh menerima kegagalan yang "kadang hijau". Retry hanya di
  // CI, dan hanya satu kali, untuk menahan flake infrastruktur (bukan flake
  // aksesibilitas — pelanggaran axe bersifat deterministik).
  retries: process.env.CI ? 1 : 0,
  // AC PR-031 nomor 5: tambahan durasi pipeline < 5 menit.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    // Jejak hanya disimpan saat gagal — laporan CI yang berguna tanpa
    // membengkakkan artefak setiap kali hijau.
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use:
        channel === undefined
          ? devices["Desktop Chrome"]
          : { ...devices["Desktop Chrome"], channel },
    },
  ],
  // Menguji HASIL BUILD, bukan server dev.
  //
  // Server dev menyajikan CSS lewat injeksi JavaScript dan tidak menjalankan
  // pemangkasan kelas Tailwind. Kelas yang hilang di produksi karena tidak
  // ikut terpindai (`@source`) justru akan tampak baik-baik saja di sana —
  // dan itu persis jenis cacat yang gerbang ini harus tangkap.
  webServer: {
    command: "pnpm exec vite preview --port 4173 --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
