// Verifikasi dialog moderasi akun dengan NVDA (PR-083b, checklist
// `docs/implementation/log/pr-083-nvda-checklist.md`). BUKAN test CI.
//
// Pola sama `admin-metrik-nvda.verifikasi.ts`: API dipalsukan, `dist`
// disajikan `vite preview`, ucapan dari jendela lain dibuang; toast dibisukan.
//
//   VERIFIKASI_BASE_URL=http://localhost:4179 \
//   pnpm exec playwright test -c verifikasi/playwright.verifikasi.config.ts admin-pengguna-nvda
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi } from "../e2e/palsukan-api.js";
import { judulJendelaDepan, nyalakanNvda, tekanTombolOs, type SesiNvda } from "./nvda.js";

const JUDUL = "Pengguna";
const HALAMAN = {
  nama: "admin pengguna (verifikasi NVDA)",
  jalur: "/admin/pengguna",
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
    process.env.VERIFIKASI_LAPORAN ?? "laporan-admin-pengguna-nvda.json",
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

test("dialog moderasi dua langkah dengan NVDA", async ({ page }) => {
  test.setTimeout(300_000);
  await palsukanApi(page, HALAMAN);
  await page.goto("/admin/pengguna");
  await expect(page.getByRole("heading", { level: 2, name: "Pengguna" })).toBeVisible();
  halamanAktif = page;
  await page.bringToFront();

  const pemicu = page.getByRole("button", { name: "Tangguhkan Rina Pelamar" });
  await catat(page, "fokus Tangguhkan Rina", () => pemicu.focus());
  await catat(page, "Enter → dialog langkah 1", os("{ENTER}"), 3_000);

  // Lanjut tanpa alasan → galat.
  const lanjut = page.getByRole("button", { name: "Lanjut" });
  await catat(page, "fokus Lanjut", () => lanjut.focus());
  await catat(page, "Enter tanpa alasan → galat", os("{ENTER}"), 2_000);

  const alasan = page.getByRole("textbox", { name: /Alasan/ });
  await catat(page, "fokus kotak alasan", () => alasan.focus(), 2_000);
  await alasan.fill("laporan penyalahgunaan tiket 31");
  await catat(page, "fokus Lanjut (kedua)", () => lanjut.focus());
  await catat(page, "Enter → langkah 2 (fokus judul langkah)", os("{ENTER}"), 3_000);
  await catat(page, "NVDA: panah bawah (tinjau 1)", os("{DOWN}"));
  await catat(page, "NVDA: panah bawah (tinjau 2)", os("{DOWN}"));
  await catat(page, "NVDA: panah bawah (tinjau 3)", os("{DOWN}"));

  const ya = page.getByRole("button", { name: "Ya, tangguhkan" });
  await catat(page, "fokus Ya, tangguhkan", () => ya.focus());
  await catat(page, "Enter → ditangguhkan (status + fokus kembali)", os("{ENTER}"), 4_000);
});
