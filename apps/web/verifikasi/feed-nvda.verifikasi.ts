// Verifikasi feed matching beranda seeker dengan NVDA (utang U-30, checklist
// `docs/implementation/log/pr-074-nvda-checklist.md`). BUKAN test CI.
//
// BERBEDA dari verifikasi chat/editor: yang diuji di sini TAMPILAN (urutan
// pembacaan kartu, pengumuman banner, tombol refresh), bukan integrasi. Jadi
// API dipalsukan dengan pemalsu yang SAMA dengan gerbang e2e (`palsukanApi`),
// dan halaman disajikan dari `dist` (`vite preview`) — tanpa PostgreSQL, Redis,
// maupun kunci AI.
//
// Prasyarat: Windows + NVDA terpasang; `pnpm --filter @nawasena/web build`;
// `vite preview --port 4179 --strictPort`; jalankan dengan
//   VERIFIKASI_BASE_URL=http://localhost:4179 \
//   pnpm exec playwright test -c verifikasi/playwright.verifikasi.config.ts feed-nvda
// Perintah mode jelajah NVDA (h/3/panah) dikirim di tingkat OS lewat
// `tekanTombolOs`, yang menolak mengirim bila jendela uji tidak di depan.
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { feedUji, palsukanApi } from "../e2e/palsukan-api.js";
import { judulJendelaDepan, nyalakanNvda, tekanTombolOs, type SesiNvda } from "./nvda.js";

const JUDUL = "Lowongan untuk Anda";
const HALAMAN = { nama: "feed (verifikasi NVDA)", jalur: "/", butuhSesi: true } as const;

let nvda: SesiNvda | null = null;
const langkah: Array<{ langkah: string; jendelaUjiDiDepan: boolean; ucapan: string[] }> = [];

test.beforeAll(async () => {
  nvda = await nyalakanNvda();
});

test.afterAll(() => {
  nvda?.hentikan();
  writeFileSync(
    process.env.VERIFIKASI_LAPORAN ?? "laporan-feed-nvda.json",
    JSON.stringify(langkah, null, 2),
  );
});

function teksUcapan(mentah: string): string {
  return [...mentah.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => m[1])
    .join(" ")
    .trim();
}

async function catat(page: Page, nama: string, aksi: () => Promise<void>, jedaMs = 1_200) {
  if (!judulJendelaDepan().includes(JUDUL)) {
    await page.bringToFront();
    await page.waitForTimeout(800);
  }
  const jendelaUjiDiDepan = judulJendelaDepan().includes(JUDUL);
  const tanda = nvda!.ucapan().length;
  await aksi();
  await page.waitForTimeout(jedaMs);
  // PRIVASI: bila jendela uji tidak di depan, ucapan berasal dari aplikasi lain
  // milik pengguna (terbukti 2026-10-01: notifikasi WhatsApp ikut terekam) —
  // DIBUANG, tidak pernah masuk laporan.
  const ucapan = jendelaUjiDiDepan
    ? nvda!
        .ucapan()
        .slice(tanda)
        .map(teksUcapan)
        .filter((u) => u !== "")
    : ["[dibuang: jendela lain di depan]"];
  langkah.push({ langkah: nama, jendelaUjiDiDepan, ucapan });
  return ucapan;
}

/** Tombol tingkat OS; jendela uji dibawa ke depan dan dicoba ulang bila direbut. */
let halamanAktif: Page | null = null;
const os = (tombol: string) => async () => {
  for (let percobaan = 0; ; percobaan += 1) {
    try {
      tekanTombolOs(tombol, JUDUL);
      return;
    } catch (err) {
      if (percobaan >= 3 || halamanAktif === null) throw err;
      await halamanAktif.bringToFront();
      await halamanAktif.waitForTimeout(800);
    }
  }
};

async function bukaFeed(page: Page, meta?: Record<string, unknown>) {
  await palsukanApi(page, HALAMAN);
  if (meta !== undefined) {
    await page.route(/\/api\/v1\/me\/matches(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(feedUji(meta)),
      }),
    );
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: JUDUL })).toBeVisible();
  halamanAktif = page;
  await page.bringToFront();
}

test("feed matching dengan NVDA: kartu, banner, refresh", async ({ page }) => {
  test.setTimeout(300_000);

  // 1. Normal — say all saat dimuat, lalu kartu pertama baris demi baris.
  await bukaFeed(page);
  await catat(page, "halaman dimuat (say all)", () => page.reload().then(() => undefined), 12_000);
  await catat(page, "NVDA: 3 → judul kartu pertama", os("3"));
  for (let i = 1; i <= 7; i += 1) {
    await catat(page, `NVDA: panah bawah ${String(i)} (isi kartu pertama)`, os("{DOWN}"));
  }
  await catat(page, "NVDA: 3 → kartu kedua", os("3"));

  // 2. Tombol refresh: deskripsi sisa jatah; Enter → pengumuman berhasil.
  const refresh = page.getByRole("button", { name: "Segarkan rekomendasi" });
  await catat(page, "fokus Segarkan rekomendasi (deskripsi sisa)", () => refresh.focus());
  await catat(page, "Enter → refresh", () => page.keyboard.press("Enter"), 2_500);

  // 3. AI menyusun — banner + tombol manual; Enter → fokus ke judul daftar.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await bukaFeed(page, { aiMenyusun: true });
  await catat(
    page,
    "AI menyusun: dimuat (say all)",
    () => page.reload().then(() => undefined),
    12_000,
  );
  const terbaru = page.getByRole("button", { name: "Tampilkan urutan terbaru" });
  await catat(page, "fokus Tampilkan urutan terbaru", () => terbaru.focus());
  await page.unroute(/\/api\/v1\/me\/matches(\?.*)?$/);
  await catat(
    page,
    "Enter → urutan terbaru (fokus pindah ke daftar)",
    () => page.keyboard.press("Enter"),
    2_500,
  );

  // 4. Degraded — banner dibacakan dalam say all, tanpa memindah fokus.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await bukaFeed(page, { degraded: true });
  await catat(
    page,
    "degraded: dimuat (say all)",
    () => page.reload().then(() => undefined),
    12_000,
  );

  // 5. Jatah habis — tombol aria-disabled beserta alasannya, tetap terfokus.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await bukaFeed(page, { sisaRefresh: 0 });
  const habis = page.getByRole("button", { name: "Segarkan rekomendasi" });
  await catat(page, "jatah habis: fokus tombol refresh", () => habis.focus());
  await catat(page, "jatah habis: Enter (tidak terjadi apa-apa, fokus tetap)", () =>
    page.keyboard.press("Enter"),
  );
  await expect(habis).toBeFocused();
});
