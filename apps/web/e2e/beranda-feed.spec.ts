// Feed matching beranda seeker (PR-074) — alur sungguhan di peramban.
//
// Registry `HALAMAN` (via `aksesibilitas.spec.ts`) memeriksa keadaan NORMAL.
// Di sini: keadaan degraded & AI-menyusun (axe), refresh habis (tombol
// `aria-disabled` + alasan), dan feed → detail → kembali (fokus & gulir pulih).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { feedUji, palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const HALAMAN = {
  nama: "beranda — feed (alur)",
  jalur: "/home/rekomendasi",
  butuhSesi: true,
} as const;

async function bukaFeed(page: Page, meta?: Record<string, unknown>) {
  await palsukanApi(page, HALAMAN);
  if (meta !== undefined) {
    // Didaftarkan SESUDAH `palsukanApi` — Playwright memakai route terakhir lebih dulu.
    // Regex, bukan glob: URL-nya membawa query (`?limit=20`), yang tidak
    // tertangkap glob `**/me/matches`.
    await page.route(/\/api\/v1\/me\/matches(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(feedUji(meta)),
      }),
    );
  }
  await page.goto("/home/rekomendasi");
  await expect(page.getByRole("heading", { level: 1, name: "Lowongan untuk Anda" })).toBeVisible();
}

async function axeLulus(page: Page) {
  await tungguGayaTenang(page);
  const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
  expect(hasil.violations).toEqual([]);
}

test.describe("beranda seeker — feed matching", () => {
  test("normal: skor tertulis, alasan AI bercatatan, axe pass", async ({ page }) => {
    await bukaFeed(page);
    await expect(page.getByText("Kecocokan 78% — sangat cocok")).toBeVisible();
    await expect(page.getByText("Alasan disusun AI")).toBeVisible();
    await expect(page.getByText(/Rekomendasi AI sedang tidak tersedia/)).toHaveCount(0);
    await axeLulus(page);
  });

  test("degraded: banner informatif, fitur tetap lengkap, axe pass", async ({ page }) => {
    await bukaFeed(page, { degraded: true });
    await expect(page.getByRole("status").filter({ hasText: /tidak tersedia/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Segarkan rekomendasi" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
    await axeLulus(page);
  });

  test("AI menyusun: tombol manual, axe pass", async ({ page }) => {
    await bukaFeed(page, { aiMenyusun: true });
    await expect(page.getByRole("button", { name: "Tampilkan urutan terbaru" })).toBeVisible();
    await axeLulus(page);
  });

  test("kuota habis: tombol aria-disabled beralasan, tetap tercapai keyboard", async ({ page }) => {
    await bukaFeed(page, { sisaRefresh: 0 });
    const tombol = page.getByRole("button", { name: "Segarkan rekomendasi" });
    await expect(tombol).toHaveAttribute("aria-disabled", "true");
    await expect(tombol).toHaveAccessibleDescription(/sudah habis/);
    await tombol.focus();
    await expect(tombol).toBeFocused();
    await axeLulus(page);
  });

  test("feed → detail → kembali: fokus & gulir pulih ke kartu yang dibuka", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await bukaFeed(page);
    const tautan = page.getByRole("link", { name: /Lihat detail lowongan Analis Data Bandung/ });
    await tautan.scrollIntoViewIfNeeded();
    const gulirSebelum = await page.evaluate(() => window.scrollY);
    expect(gulirSebelum).toBeGreaterThan(0);

    await tautan.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Analis Data Bandung" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke daftar lowongan" }).click();
    await expect(page).toHaveURL(/\/home\/rekomendasi$/);

    await expect(
      page.getByRole("link", { name: /Lihat detail lowongan Analis Data Bandung/ }),
    ).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(gulirSebelum - 2);
  });
});
