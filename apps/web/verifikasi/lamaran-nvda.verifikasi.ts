// Verifikasi "Lamaran Saya" dengan NVDA (PR-079, checklist
// `docs/implementation/log/pr-079-nvda-checklist.md`). BUKAN test CI.
//
// Pola sama `lamar-nvda.verifikasi.ts` (PR-078): API dipalsukan, `dist`
// disajikan `vite preview`, ucapan dari jendela lain dibuang.
//
//   VERIFIKASI_BASE_URL=http://localhost:4179 //   pnpm exec playwright test -c verifikasi/playwright.verifikasi.config.ts lamaran-nvda
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { LAMARAN_SAYA_UJI_ID, palsukanApi } from "../e2e/palsukan-api.js";
import { judulJendelaDepan, nyalakanNvda, tekanTombolOs, type SesiNvda } from "./nvda.js";

const JUDUL = "Staf Admin Uji";
const ALAMAT = `/lamaran/${LAMARAN_SAYA_UJI_ID}`;
const HALAMAN = { nama: "lamaran saya (verifikasi NVDA)", jalur: ALAMAT, butuhSesi: true } as const;

let nvda: SesiNvda | null = null;
const langkah: Array<{ langkah: string; jendelaUjiDiDepan: boolean; ucapan: string[] }> = [];

test.beforeAll(async () => {
  nvda = await nyalakanNvda();
});

test.afterAll(() => {
  nvda?.hentikan();
  writeFileSync(
    process.env.VERIFIKASI_LAPORAN ?? "laporan-lamaran-nvda.json",
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

test("detail lamaran dengan NVDA: status diumumkan, lini masa, tarik, perayaan", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await palsukanApi(page, HALAMAN);
  await page.goto(ALAMAT);
  await expect(page.getByRole("heading", { level: 1, name: JUDUL })).toBeVisible();
  halamanAktif = page;
  await page.bringToFront();

  // 1. Halaman dibuka: status terbaru harus diumumkan (AC).
  await catat(
    page,
    "halaman dimuat (pengumuman status)",
    () => page.reload().then(() => undefined),
    10_000,
  );

  // 2. Lini masa: NVDA `l` = daftar berikutnya, lalu panah bawah per titik.
  await catat(page, "NVDA: l → daftar riwayat", os("l"));
  for (let i = 1; i <= 5; i += 1) {
    await catat(page, `NVDA: panah bawah ${String(i)} (riwayat)`, os("{DOWN}"));
  }

  // 3. Tarik lamaran: dialog dibuka lalu dibatalkan (Escape).
  const tarik = page.getByRole("button", { name: "Tarik lamaran" });
  await catat(page, "fokus Tarik lamaran", () => tarik.focus());
  await catat(page, "Enter → dialog konfirmasi", os("{ENTER}"), 3_000);
  await catat(page, "Tab di dialog", os("{TAB}"));
  await catat(page, "Tab di dialog (2)", os("{TAB}"));
  await catat(page, "Escape → kembali ke Tarik lamaran", os("{ESC}"), 2_000);

  // 4. Saya diterima: satu ketuk → perayaan teks berfokus.
  const diterima = page.getByRole("button", { name: "Saya diterima" });
  await catat(page, "fokus Saya diterima", () => diterima.focus());
  await catat(page, "Enter → perayaan", os("{ENTER}"), 3_000);
  await expect(
    page.getByRole("heading", { level: 2, name: "Selamat, Anda diterima bekerja!" }),
  ).toBeFocused();
  await catat(page, "NVDA: panah bawah (isi perayaan)", os("{DOWN}"));
});
