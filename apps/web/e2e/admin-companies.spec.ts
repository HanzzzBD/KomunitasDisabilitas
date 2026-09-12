// Alur kurasi perusahaan sungguhan (PR-053) — AC "Buat→edit→verifikasi
// end-to-end" dan gerbang axe atas keadaan yang TIDAK bisa dijangkau registry
// `HALAMAN` generik: form terisi data nyata dan dialog verifikasi terbuka.
//
// KENAPA BERKAS TERPISAH, BUKAN ENTRI `HALAMAN` BIASA. Halaman
// `/admin/companies/:id` butuh id UUID SUNGGUHAN yang cocok dengan salah satu
// baris di daftar — dan satu-satunya cara mendapatkannya adalah mengikuti
// tautan "Ubah" yang benar-benar dirender React Router dari data, bukan
// menuliskan URL secara langsung (lihat komentar `PERUSAHAAN_UJI_ID` di
// `palsukan-api.ts` untuk kenapa navigasi langsung ke `/admin/companies/:id`
// selalu menampilkan "tidak ditemukan").
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("kurasi perusahaan — alur sungguhan", () => {
  test("klik 'Ubah' dari daftar membuka form terisi data nyata, axe pass", async ({ page }) => {
    await palsukanApi(page, {
      nama: "admin — daftar perusahaan (alur)",
      jalur: "/admin/companies",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/companies");
    await page.waitForSelector("table");

    await page.click('a[aria-label="Ubah PT Uji Fiktif"]');
    await page.waitForURL(/\/admin\/companies\/[^/]+$/);
    await expect(page).not.toHaveURL(/\/admin\/companies\/:id$/);

    // Form terisi NILAI SUNGGUHAN dari baris yang diklik — bukan kosong.
    await expect(page.locator('input[value="PT Uji Fiktif"]')).toBeVisible();
    await expect(page.getByText("Belum diverifikasi")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verifikasi perusahaan ini" }),
    ).toBeVisible();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });

  test("dialog konfirmasi verifikasi terbuka, axe pass, dan verifikasi berhasil", async ({
    page,
  }) => {
    await palsukanApi(page, {
      nama: "admin — dialog verifikasi (alur)",
      jalur: "/admin/companies",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/companies");
    await page.waitForSelector("table");
    await page.click('a[aria-label="Ubah PT Uji Fiktif"]');
    await page.waitForURL(/\/admin\/companies\/[^/]+$/);

    await page.click("button:has-text('Verifikasi perusahaan ini')");
    await page.waitForSelector('[role="dialog"]');

    await tungguGayaTenang(page);
    const hasilDialog = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasilDialog.violations).toEqual([]);

    await page.click('[role="dialog"] button:has-text("Ya, verifikasi")');
    await expect(page.getByText("PT Uji Fiktif sudah terverifikasi.")).toBeVisible();
    await expect(page.getByText("Terverifikasi", { exact: true })).toBeVisible();
    // Tombol Verifikasi hilang begitu perusahaan sudah terverifikasi — AC
    // "un-verify tidak ada di UI ini" (lihat komentar `admin-companies-
    // formulir.tsx`): tidak ada jalan menurunkan status lagi dari sini.
    await expect(
      page.getByRole("button", { name: "Verifikasi perusahaan ini" }),
    ).toHaveCount(0);
  });

  test("AC 'Buat→edit→verifikasi end-to-end': menyimpan form Tambah mendarat di halaman Ubah", async ({
    page,
  }) => {
    await palsukanApi(page, {
      nama: "admin — tambah perusahaan (alur)",
      jalur: "/admin/companies/baru",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/companies/baru");
    await page.waitForSelector("h1");

    await page.fill('input[maxlength="160"]', "PT Baru Dari Alur Uji");
    await page.click('button[type="submit"]');

    // Buat berhasil → LANGSUNG ke halaman Ubah perusahaan yang baru saja
    // dibuat, bukan kembali ke daftar — itulah seluruh isi AC ini.
    await page.waitForURL(/\/admin\/companies\/[^/]+$/);
    await expect(page).not.toHaveURL(/\/admin\/companies\/(baru|:id)$/);
    await expect(page.getByText("Belum diverifikasi")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verifikasi perusahaan ini" }),
    ).toBeVisible();
  });
});
