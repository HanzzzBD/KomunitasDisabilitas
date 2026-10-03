// Verifikasi dasbor metrik admin dengan NVDA (PR-081, checklist
// `docs/implementation/log/pr-081-nvda-checklist.md`). BUKAN test CI.
//
// Pola sama `lamaran-nvda.verifikasi.ts`: API dipalsukan, `dist` disajikan
// `vite preview`, ucapan dari jendela lain dibuang; toast dibisukan `nvda.ts`.
//
//   VERIFIKASI_BASE_URL=http://localhost:4179 //   pnpm exec playwright test -c verifikasi/playwright.verifikasi.config.ts admin-metrik-nvda
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi } from "../e2e/palsukan-api.js";
import { judulJendelaDepan, nyalakanNvda, tekanTombolOs, type SesiNvda } from "./nvda.js";

const JUDUL = "Admin";
const HALAMAN = {
  nama: "admin metrik (verifikasi NVDA)",
  jalur: "/admin",
  butuhSesi: true,
  butuhAdmin: true,
} as const;

let nvda: SesiNvda | null = null;
const langkah: Array<{ langkah: string; jendelaUjiDiDepan: boolean; ucapan: string[] }> = [];

test.beforeAll(async () => {
  nvda = await nyalakanNvda();
});

test.afterAll(() => {
  nvda?.hentikan();
  writeFileSync(
    process.env.VERIFIKASI_LAPORAN ?? "laporan-admin-metrik-nvda.json",
    JSON.stringify(langkah, null, 2),
  );
});

function teksUcapan(mentah: string): string {
  return [...mentah.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => m[1])
    .join(" ")
    .trim();
}

async function catat(page: Page, nama: string, aksi: () => Promise<void>, jedaMs = 1_500) {
  if (!judulJendelaDepan().includes(JUDUL)) {
    await page.bringToFront();
    await page.waitForTimeout(800);
  }
  const jendelaUjiDiDepan = judulJendelaDepan().includes(JUDUL);
  const tanda = nvda!.ucapan().length;
  await aksi();
  await page.waitForTimeout(jedaMs);
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

test("dasbor metrik dengan NVDA: tile, periode, tabel AI", async ({ page }) => {
  test.setTimeout(300_000);
  await palsukanApi(page, HALAMAN);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 2, name: "Kesehatan pilot" })).toBeVisible();
  halamanAktif = page;
  await page.bringToFront();

  // 1. Grup periode: fokus radio terpilih, lalu panah.
  const radio = page.getByRole("radio", { name: "30 hari terakhir" });
  await catat(page, "fokus radio periode 30 hari", () => radio.focus());
  await catat(page, "panah kiri → 7 hari", os("{LEFT}"), 3_000);
  await catat(page, "panah kanan → 30 hari", os("{RIGHT}"), 3_000);

  // Radio membuat NVDA masuk focus mode otomatis; Escape kembali ke browse
  // mode — tanpa ini perintah jelajah di bawah malah mengganti pilihan radio.
  await catat(page, "Escape → browse mode", os("{ESC}"), 1_500);

  // 2. Tile: NVDA `3` ke judul "Perjalanan pencari kerja", lalu panah bawah.
  await catat(page, "NVDA: 3 → judul funnel", os("3"));
  for (let n = 1; n <= 8; n += 1) {
    await catat(page, `NVDA: panah bawah ${String(n)} (tile)`, os("{DOWN}"));
  }

  // 3. Tabel AI: NVDA `t` → tabel, lalu Ctrl+Alt+panah bawah (baris berikut).
  await catat(page, "NVDA: t → tabel AI", os("t"));
  await catat(page, "NVDA: panah bawah → sel pertama", os("{DOWN}"));
  await catat(page, "NVDA: panah bawah → sel berikut", os("{DOWN}"));
  await catat(page, "NVDA: baris berikut di tabel", os("^%{DOWN}"));
  await catat(page, "NVDA: sel berikut di baris", os("^%{RIGHT}"));
});
