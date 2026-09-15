// Alur kurasi lowongan sungguhan (PR-057) — AC "Buat→publish→close
// end-to-end" dan gerbang axe atas keadaan yang TIDAK bisa dijangkau registry
// `HALAMAN` generik: form terisi data nyata, dialog Tutup terbuka, dan
// pemilih Perusahaan (Radix Select) benar-benar dibuka/dipilih — sesuatu yang
// TIDAK diuji `admin-jobs.test.tsx` (jsdom) dengan browser sungguhan.
//
// KENAPA BERKAS TERPISAH, BUKAN ENTRI `HALAMAN` BIASA. Sama alasannya dengan
// `admin-companies.spec.ts`: `/admin/jobs/:id` butuh id UUID SUNGGUHAN yang
// cocok dengan salah satu baris di daftar, dan satu-satunya cara
// mendapatkannya adalah mengikuti tautan "Ubah" yang benar-benar dirender
// React Router dari data (lihat komentar `LOWONGAN_UJI_ID` di
// `palsukan-api.ts` untuk kenapa navigasi langsung ke `/admin/jobs/:id`
// selalu menampilkan "tidak ditemukan").
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("kurasi lowongan — alur sungguhan", () => {
  test("klik 'Ubah' dari daftar membuka form terisi data nyata, axe pass", async ({ page }) => {
    await palsukanApi(page, {
      nama: "admin — daftar lowongan (alur)",
      jalur: "/admin/jobs",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/jobs");
    await page.waitForSelector("table");

    await page.click('a[aria-label="Ubah Staf Admin Uji"]');
    await page.waitForURL(/\/admin\/jobs\/[^/]+$/);
    await expect(page).not.toHaveURL(/\/admin\/jobs\/:id$/);

    // Form terisi NILAI SUNGGUHAN dari baris yang diklik — bukan kosong.
    await expect(page.locator('input[maxlength="200"]')).toHaveValue("Staf Admin Uji");
    await expect(page.getByText("Draf", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Terbitkan lowongan ini" })).toBeVisible();
    // LOWONGAN_UJI sudah punya satu akomodasi — tombolnya harus AKTIF.
    await expect(page.getByRole("button", { name: "Terbitkan lowongan ini" })).toBeEnabled();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });

  test("AC 'Validasi akomodasi wajib sebelum publish': tombol nonaktif saat akomodasi kosong", async ({
    page,
  }) => {
    await palsukanApi(page, {
      nama: "admin — tambah lowongan (validasi akomodasi)",
      jalur: "/admin/jobs/baru",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/jobs/baru");
    await page.waitForSelector("h2");

    await page.getByRole("combobox", { name: /Perusahaan/ }).click();
    await page.getByRole("option", { name: "PT Uji Fiktif" }).click();
    await page.fill('input[maxlength="200"]', "Posisi Tanpa Akomodasi");
    await page.fill("textarea[maxlength='5000']", "Deskripsi posisi uji");
    await page.click('button[type="submit"]');

    // Buat berhasil → LANGSUNG ke halaman Ubah, sama seperti companies.
    await page.waitForURL(/\/admin\/jobs\/[^/]+$/);
    await expect(page.getByRole("button", { name: "Terbitkan lowongan ini" })).toBeVisible();
    // TIDAK ADA akomodasi dicentang — tombol harus NONAKTIF dengan keterangan.
    await expect(page.getByRole("button", { name: "Terbitkan lowongan ini" })).toBeDisabled();
    await expect(
      page.getByText("Tambahkan minimal satu akomodasi sebelum bisa menerbitkan lowongan ini."),
    ).toBeVisible();
  });

  test("AC 'Buat→publish→close end-to-end': lowongan baru diterbitkan lalu ditutup, axe pass di tiap keadaan", async ({
    page,
  }) => {
    await palsukanApi(page, {
      nama: "admin — buat lowongan (alur penuh)",
      jalur: "/admin/jobs/baru",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/jobs/baru");
    await page.waitForSelector("h2");

    // BUAT — pilih perusahaan (Radix Select, browser sungguhan), isi judul +
    // deskripsi, centang satu akomodasi supaya bisa langsung diterbitkan.
    await page.getByRole("combobox", { name: /Perusahaan/ }).click();
    await page.getByRole("option", { name: "PT Uji Fiktif" }).click();
    await page.fill('input[maxlength="200"]', "Posisi Alur Penuh");
    await page.fill("textarea[maxlength='5000']", "Deskripsi posisi alur penuh");
    await page.click("text=Akses kursi roda");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin\/jobs\/[^/]+$/);
    await expect(page).not.toHaveURL(/\/admin\/jobs\/(baru|:id)$/);
    await expect(page.getByText("Draf", { exact: true })).toBeVisible();

    // PUBLISH.
    await page.click('button:has-text("Terbitkan lowongan ini")');
    await expect(page.getByText("Posisi Alur Penuh sudah diterbitkan.")).toBeVisible();
    await expect(page.getByText("Diterbitkan", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Terbitkan lowongan ini" })).toHaveCount(0);

    await tungguGayaTenang(page);
    const hasilTerbit = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasilTerbit.violations).toEqual([]);

    // CLOSE — dialog konfirmasi WAJIB (Security Considerations: "Konfirmasi
    // close, berdampak pelamar").
    await page.click('button:has-text("Tutup lowongan ini")');
    await page.waitForSelector('[role="dialog"]');

    await tungguGayaTenang(page);
    const hasilDialog = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasilDialog.violations).toEqual([]);

    await page.click('[role="dialog"] button:has-text("Ya, tutup")');
    await expect(page.getByText("Posisi Alur Penuh sudah ditutup.")).toBeVisible();
    await expect(page.getByText("Ditutup", { exact: true })).toBeVisible();
    // TIDAK ADA jalan mundur dari closed — kedua tombol status hilang.
    await expect(page.getByRole("button", { name: "Terbitkan lowongan ini" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tutup lowongan ini" })).toHaveCount(0);
  });
});
