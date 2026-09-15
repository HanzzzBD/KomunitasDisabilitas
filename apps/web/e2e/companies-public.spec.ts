// Profil publik perusahaan, keadaan TERISI (PR-054, Gap G5) — AC "Struktur
// heading benar; axe pass" atas data SUNGGUHAN, bukan atas keadaan "tidak
// ditemukan" yang diperiksa `HALAMAN` generik (`halaman.ts`).
//
// KENAPA BERKAS TERPISAH, BUKAN ENTRI `HALAMAN` BIASA. `registry-halaman.
// test.ts` menuntut jalur registry generik memakai path route LITERAL —
// untuk rute dinamis `companies/:id` itu berarti navigasi APA ADANYA ke
// literal `:id`, yang tidak pernah cocok id UUID sungguhan (lihat komentar
// `PERUSAHAAN_UJI_ID`/`PERUSAHAAN_PUBLIK_UJI_ID` di `palsukan-api.ts`).
//
// BERBEDA DARI `admin-companies.spec.ts`: di sana UUID sungguhan hanya bisa
// dijangkau lewat KLIK tautan "Ubah" (tidak ada daftar publik untuk
// diklik). Di sini navigasi LANGSUNG ke UUID sungguhan sudah cukup — halaman
// ini publik, dan `palsukanApi` sudah menyiapkan jawaban untuk
// `PERUSAHAAN_PUBLIK_UJI_ID` (lihat blok "Profil publik perusahaan" di sana).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi, PERUSAHAAN_PUBLIK_UJI_ID, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("profil publik perusahaan — keadaan terisi", () => {
  test("nama, badge verified, akomodasi berlabel, dan lowongan tertaut tampil; axe pass", async ({
    page,
  }) => {
    await palsukanApi(page, {
      nama: "companies — profil publik (terisi)",
      jalur: `/companies/${PERUSAHAAN_PUBLIK_UJI_ID}`,
    });
    await page.goto(`/companies/${PERUSAHAAN_PUBLIK_UJI_ID}`);
    await page.waitForSelector("h1");

    await expect(page.getByRole("heading", { level: 1, name: "PT Inklusif Publik" })).toBeVisible();
    await expect(page.getByText("Terverifikasi")).toBeVisible();

    // AC "Semua ikon akomodasi berlabel teks" — labelnya, bukan hanya ikon.
    await expect(page.getByText("Akses kursi roda")).toBeVisible();
    await expect(page.getByText("Perangkat lunak ramah pembaca layar")).toBeVisible();

    // AC "Daftar lowongan aktif tertaut ke detail".
    const tautan = page.getByRole("link", { name: /Lihat detail lowongan Staf Admin/ });
    await expect(tautan).toBeVisible();
    await expect(tautan).toHaveAttribute(
      "href",
      "/lowongan/01912345-89ab-7def-8123-4567890abd21",
    );

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });
});
