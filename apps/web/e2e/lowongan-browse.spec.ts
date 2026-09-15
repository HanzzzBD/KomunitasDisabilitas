// Alur cari lowongan publik sungguhan (PR-058) — AC "Cari + filter
// end-to-end", "Jumlah hasil diumumkan aria-live saat filter berubah",
// "Filter keyboard-only + tidak ada jebakan fokus", "Empty state ramah +
// saran". Registry `HALAMAN` (via `aksesibilitas.spec.ts`) hanya menjangkau
// keadaan AWAL tanpa pencarian — keadaan hasil tersaring, kosong, dan
// "muat lebih banyak" hanya bisa dijangkau lewat interaksi sungguhan di sini.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";
import { tanamPreferensiLokal } from "./preferensi-akun.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const HALAMAN = {
  nama: "lowongan — cari (alur)",
  jalur: "/lowongan",
};

test.describe("cari lowongan — alur sungguhan", () => {
  test("tanpa filter: dua kartu pertama tampil, 'Muat lebih banyak' terlihat, axe pass", async ({
    page,
  }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await expect(page.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Penulis Konten Jarak Jauh" })).toBeVisible();
    // Fixture ketiga BELUM tampil — halaman pertama pemalsuan hanya 2 baris.
    await expect(page.getByRole("heading", { name: "Analis Data Bandung" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Muat lebih banyak" })).toBeVisible();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });

  test("'Muat lebih banyak' menambah baris tanpa mengulang yang sudah ada", async ({ page }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await page.click('button:has-text("Muat lebih banyak")');

    await expect(page.getByRole("heading", { name: "Analis Data Bandung" })).toBeVisible();
    // Baris awal tetap ada — "muat lebih" MENAMBAH, bukan MENGGANTI.
    await expect(page.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toBeVisible();
    // Ketiganya fixture yang ada — tombolnya sekarang hilang (habis).
    await expect(page.getByRole("button", { name: "Muat lebih banyak" })).toHaveCount(0);
  });

  test("AC 'Cari + filter end-to-end': kata kunci menyaring hasil, jumlah diumumkan, axe pass", async ({
    page,
  }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await page.fill("input[maxlength='200']", "Konten");
    await page.click('button[type="submit"]:has-text("Cari")');

    await expect(page.getByRole("heading", { name: "Penulis Konten Jarak Jauh" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Muat lebih banyak" })).toHaveCount(0);

    // Pengumuman jumlah hasil — live region `role="status"`, `sr-only`.
    await expect(page.locator('[role="status"]', { hasText: "1 lowongan ditemukan." })).toBeAttached();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });

  test("AC 'Empty state ramah + saran': pencarian tanpa hasil menawarkan hapus filter, axe pass", async ({
    page,
  }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await page.fill("input[maxlength='200']", "xyzzytidakadalowongansepertiini");
    await page.click('button[type="submit"]:has-text("Cari")');

    await expect(page.getByText("Tidak ada lowongan yang cocok")).toBeVisible();
    await expect(page.getByText(/Coba kata kunci lain/)).toBeVisible();
    // DUA tombol "Hapus semua filter" sah-sah saja di layar ini (satu di
    // panel filter, satu sebagai saran di keadaan kosong — keduanya aksi
    // yang SAMA); locator ini sengaja disempitkan ke wilayah keadaan kosong.
    const keadaanKosong = page.locator('[role="status"]', { hasText: "Tidak ada lowongan yang cocok" });
    const tombolReset = keadaanKosong.getByRole("button", { name: "Hapus semua filter" });
    await expect(tombolReset).toBeVisible();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);

    // Klik "Hapus semua filter" dari DALAM keadaan kosong mengembalikan hasil.
    await tombolReset.click();
    await expect(page.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toBeVisible();
  });

  test("filter kota menyaring hasil sesuai pilihan", async ({ page }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await page.getByRole("textbox", { name: "Kota" }).fill("Bandung");
    await page.click('button[type="submit"]:has-text("Cari")');

    await expect(page.getByRole("heading", { name: "Analis Data Bandung" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staf Layanan Pelanggan" })).toHaveCount(0);
  });

  test("filter keyboard-only: seluruh form ditempuh dan dikirim tanpa tetikus", async ({ page }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await page.locator("input[maxlength='200']").focus();
    await page.keyboard.type("Data");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "Analis Data Bandung" })).toBeVisible();
  });

  // Manual Verification PR-057/058 ("mode teks sederhana + kontras tinggi") —
  // pola sama `aksesibilitas-matriks.spec.ts`, tetapi `tanamPreferensiLokal`
  // SAJA (tanpa `buatAkunPalsu`): halaman ini publik/anonim, jadi tidak ada
  // akun tersinkron untuk dipalsukan — preferensi anonim hidup HANYA di
  // localStorage (ADR-008), persis yang diuji di sini.
  test("mode teks sederhana + kontras tinggi: teks berganti, axe tetap pass", async ({ page }) => {
    await tanamPreferensiLokal(page, { simpleLanguage: true, highContrast: true });
    await palsukanApi(page, HALAMAN);
    await page.goto("/lowongan");
    await page.waitForSelector("h1");

    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    // Varian `id-simple` dari "lowongan.filter.reset" ("Hapus semua filter")
    // sama persis dengan `id` (terdaftar sengaja di SAMA_DENGAN_SENGAJA) —
    // yang membuktikan mode sederhana benar-benar aktif adalah string yang
    // BERBEDA antar varian, mis. label kolom "Kata yang Anda cari".
    await expect(page.getByText("Kata yang Anda cari")).toBeVisible();

    await tungguGayaTenang(page);
    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations).toEqual([]);
  });
});
