// Detail lowongan publik sungguhan (PR-059) — AC "Kembali ke list → posisi
// scroll & fokus pulih", "axe pass", "Konten panjang tidak merusak layout".
// Registry `HALAMAN` hanya menjangkau keadaan "tidak ditemukan" (literal
// `:id`); keadaan TERISI dan alur daftar→detail→kembali hanya bisa dijangkau
// di sini.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";
import { tanamPreferensiLokal } from "./preferensi-akun.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const HALAMAN = {
  nama: "lowongan — detail (alur)",
  jalur: "/lowongan",
};

/** Fixture pertama — deskripsi panjang, gaji, akomodasi, ragam (lihat `palsukan-api.ts`). */
const LOWONGAN_LENGKAP_ID = "01912345-89ab-7def-8123-4567890abe01";
/** Fixture kedua — gaji disembunyikan, tanpa lokasi. */
const LOWONGAN_TANPA_GAJI_ID = "01912345-89ab-7def-8123-4567890abe02";

test.describe("detail lowongan — alur sungguhan", () => {
  test("AC 'kembali ke list': posisi gulir DAN fokus pulih ke kartu yang dibuka", async ({
    page,
  }) => {
    // Layar pendek supaya kartu ketiga benar-benar di bawah lipatan — tanpa
    // itu tidak ada posisi gulir yang bisa (gagal) dipulihkan.
    await page.setViewportSize({ width: 390, height: 600 });
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await page.click('button:has-text("Muat lebih banyak")');
    const tautan = page.getByRole("link", { name: /Lihat detail lowongan Analis Data Bandung/ });
    await tautan.scrollIntoViewIfNeeded();
    const gulirSebelum = await page.evaluate(() => window.scrollY);
    expect(gulirSebelum).toBeGreaterThan(0);

    await tautan.click();
    await expect(page).toHaveURL(/\/lowongan\/01912345-89ab-7def-8123-4567890abe03$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Analis Data Bandung" }),
    ).toBeVisible();
    // Halaman baru mulai dari ATAS, bukan mewarisi gulir daftar.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.getByRole("link", { name: "Kembali ke daftar lowongan" }).click();
    await expect(page).toHaveURL(/\/lowongan$/);

    const tautanLagi = page.getByRole("link", {
      name: /Lihat detail lowongan Analis Data Bandung/,
    });
    await expect(tautanLagi).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(gulirSebelum - 2);
  });

  test("pencarian tersaring bertahan saat kembali lewat tombol Back peramban", async ({ page }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await page.fill("input[maxlength='200']", "Konten");
    await page.click('button[type="submit"]:has-text("Cari")');
    await expect(page).toHaveURL(/\/lowongan\?query=Konten$/);
    await expect(page.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toHaveCount(0);

    await page
      .getByRole("link", { name: /Lihat detail lowongan Penulis Konten Jarak Jauh/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Penulis Konten Jarak Jauh" }),
    ).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/lowongan\?query=Konten$/);
    await expect(page.locator("input[maxlength='200']")).toHaveValue("Konten");
    await expect(page.getByRole("heading", { name: "Penulis Konten Jarak Jauh" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Lihat detail lowongan Penulis Konten Jarak Jauh/ }),
    ).toBeFocused();
  });

  test("detail terisi: seluruh bagian + blok perusahaan tampil, axe pass", async ({ page }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto(`/lowongan/${LOWONGAN_LENGKAP_ID}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Staf Layanan Pelanggan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Akomodasi untuk posisi ini" }),
    ).toBeVisible();
    await expect(page.getByText(/per bulan/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Lihat profil lengkap PT Uji Fiktif" }),
    ).toBeVisible();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });

  test("gaji disembunyikan → baris Gaji tidak ada; dibuka langsung → tautan kembali ke /lowongan", async ({
    page,
  }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto(`/lowongan/${LOWONGAN_TANPA_GAJI_ID}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Penulis Konten Jarak Jauh" }),
    ).toBeVisible();
    await expect(page.getByText("Gaji", { exact: true })).toHaveCount(0);

    await page.getByRole("link", { name: "Kembali ke daftar lowongan" }).click();
    await expect(page).toHaveURL(/\/lowongan$/);
    await expect(page.getByRole("heading", { level: 1, name: "Cari Lowongan" })).toBeVisible();
  });

  test("AC 'konten panjang tidak merusak layout': 320px tanpa gulir horizontal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await palsukanApi(page, HALAMAN);
    await page.goto(`/lowongan/${LOWONGAN_LENGKAP_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Lihat profil lengkap PT Uji Fiktif" }),
    ).toBeVisible();

    const melebar = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(melebar).toBe(false);
  });

  test("mode teks sederhana + kontras tinggi: teks berganti, axe tetap pass", async ({ page }) => {
    await tanamPreferensiLokal(page, { simpleLanguage: true, highContrast: true });
    await palsukanApi(page, HALAMAN);
    await page.goto(`/lowongan/${LOWONGAN_LENGKAP_ID}`);

    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    await expect(
      page.getByRole("heading", { level: 2, name: "Tentang pekerjaan ini" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Buka profil PT Uji Fiktif" })).toBeVisible();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });
  test("PR-087 'Sederhanakan': tombol → hasil berlabel AI → kembali ke asli, keyboard saja, axe pass", async ({
    page,
  }) => {
    await palsukanApi(page, { ...HALAMAN, butuhSesi: true });
    const diminta: unknown[] = [];
    await page.route("**/api/v1/ai/simplify-text", async (route) => {
      diminta.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            teks: "Anda menjawab pertanyaan pelanggan.\n- Lewat surel dan obrolan teks.",
            alasan: null,
          },
        }),
      });
    });
    await page.goto(`/lowongan/${LOWONGAN_LENGKAP_ID}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const deskripsi = page.getByRole("region", { name: "Deskripsi pekerjaan" });
    const tombol = deskripsi.getByRole("button", { name: "Sederhanakan teks ini" });
    await expect(tombol).toHaveAccessibleDescription(/Ditulis ulang oleh AI/);
    await tombol.focus();
    await page.keyboard.press("Enter");

    await expect(deskripsi.getByText(/Disederhanakan oleh AI/)).toBeVisible();
    await expect(
      deskripsi.getByText("Anda menjawab pertanyaan pelanggan.", { exact: false }),
    ).toBeVisible();
    await expect(deskripsi.getByText(/SOPLAYANANPELANGGAN/)).toHaveCount(0);
    await expect(deskripsi.getByRole("status")).toHaveText(/versi sederhana dari AI/);
    const alih = deskripsi.getByRole("button", { name: "Tampilkan teks asli" });
    await expect(alih).toBeFocused();
    expect(diminta).toEqual([{ sumber: "lowongan", id: LOWONGAN_LENGKAP_ID, bagian: "deskripsi" }]);

    await tungguGayaTenang(page);
    expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);

    await page.keyboard.press("Enter");
    await expect(deskripsi.getByText(/SOPLAYANANPELANGGAN/)).toBeVisible();
    await expect(deskripsi.getByText(/Disederhanakan oleh AI/)).toHaveCount(0);
    await expect(deskripsi.getByRole("status")).toHaveText(/teks asli kini ditampilkan/);
    expect(diminta).toHaveLength(1);
  });

  test("PR-087 degradasi: tombol hilang, penjelasan difokus, teks asli tetap, axe pass", async ({
    page,
  }) => {
    await palsukanApi(page, { ...HALAMAN, butuhSesi: true });
    await page.route("**/api/v1/ai/simplify-text", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { teks: null, alasan: "kuota_habis" },
          meta: { degraded: true },
        }),
      }),
    );
    await page.goto(`/lowongan/${LOWONGAN_LENGKAP_ID}`);
    const persyaratan = page.getByRole("region", { name: "Persyaratan" });
    await persyaratan.getByRole("button", { name: "Sederhanakan teks ini" }).focus();
    await page.keyboard.press("Enter");

    await expect(persyaratan.getByText(/Coba lagi besok/)).toBeFocused();
    await expect(persyaratan.getByRole("button")).toHaveCount(0);
    await expect(persyaratan.getByText(/Terbiasa mengetik\./)).toBeVisible();

    await tungguGayaTenang(page);
    expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
  });
});
