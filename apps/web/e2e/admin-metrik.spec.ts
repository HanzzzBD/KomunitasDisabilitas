// Dasbor metrik admin sungguhan (PR-081) — AC "angka cocok fixture E2E",
// "auto-refresh tidak mencuri fokus", "axe pass", tren tekstual. Registry
// `HALAMAN` ("admin — ringkasan") ikut memeriksa halaman ini dengan axe; yang
// di sini adalah keadaan yang tidak dijangkaunya: periode lain dan refresh.
//
// KEYBOARD-ONLY: tidak satu klik pun.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axeBersih(page: Page): Promise<void> {
  await tungguGayaTenang(page);
  expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
}

function nilaiTile(page: Page, label: string) {
  return page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
}

test.describe("dasbor metrik admin", () => {
  test("angka & tren cocok fixture; ganti periode dengan keyboard; axe pass", async ({ page }) => {
    await palsukanApi(page, {
      nama: "admin — metrik",
      jalur: "/admin",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin");
    await page.getByRole("heading", { level: 2, name: "Kesehatan pilot" }).waitFor();

    await expect(nilaiTile(page, "Pendaftar baru, 30 hari terakhir")).toContainText("15");
    await expect(nilaiTile(page, "Pendaftar baru, 30 hari terakhir")).toContainText(
      "Naik 3 dibanding 30 hari sebelumnya (12)",
    );
    await expect(nilaiTile(page, "Sudah melamar, 30 hari terakhir")).toContainText(
      "Turun 2 dibanding 30 hari sebelumnya (8)",
    );
    await expect(nilaiTile(page, "Konfirmasi diterima bekerja, sepanjang waktu")).toContainText(
      "4",
    );
    await expect(page.getByRole("table", { name: /Pemakaian AI per fitur/ })).toContainText(
      "1.250",
    );
    await axeBersih(page);

    // Radio grup: fokus ke pilihan terpilih, panah kiri → "7 hari terakhir".
    await page.getByRole("radio", { name: "30 hari terakhir" }).focus();
    const minta = page.waitForRequest((r) => r.url().includes("/admin/metrics?periode=7d"));
    await page.keyboard.press("ArrowLeft");
    await minta;
    await expect(page.locator("dt", { hasText: "Pendaftar baru, 7 hari terakhir" })).toBeVisible();
    await axeBersih(page);
  });

  test("auto-refresh 5 menit memuat ulang tanpa memindah fokus", async ({ page }) => {
    await page.clock.install();
    await palsukanApi(page, {
      nama: "admin — metrik (refresh)",
      jalur: "/admin",
      butuhSesi: true,
      butuhAdmin: true,
    });
    let permintaan = 0;
    page.on("request", (r) => {
      if (r.url().includes("/admin/metrics?")) permintaan += 1;
    });
    await page.goto("/admin");
    await page.locator("dt", { hasText: "Pendaftar baru, 30 hari terakhir" }).waitFor();
    const awal = permintaan;

    const radio = page.getByRole("radio", { name: "30 hari terakhir" });
    await radio.focus();
    await page.clock.runFor(5 * 60 * 1000 + 1_000);
    await expect.poll(() => permintaan).toBeGreaterThan(awal);
    await expect(radio).toBeFocused();
  });
});
