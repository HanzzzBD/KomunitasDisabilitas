import { expect, test } from "@playwright/test";
import { HALAMAN } from "./halaman.js";
import { harusTidakBerpindah, palsukanApi } from "./palsukan-api.js";

// Reflow diperiksa pada isi setiap halaman, termasuk form dan daftar admin.
// Gulir tabel di dalam wadahnya tetap boleh; dokumen tidak boleh melebar.
for (const halaman of HALAMAN) {
  test(`tata letak 320px: ${halaman.nama}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await palsukanApi(page, halaman);
    await page.goto(halaman.jalur);
    await harusTidakBerpindah(page, halaman);
    if (halaman.siapkan !== undefined) await halaman.siapkan(page);
    if (halaman.jalur.split("?")[0] === "/lowongan") {
      if ((await page.locator("main details").getAttribute("open")) === null) {
        await page.locator("main summary").click();
      }
    }
    await page.waitForLoadState("networkidle");
    // Saat dialog terbuka, main sengaja inert dan keluar dari pohon a11y.
    await expect(page.locator("main")).toHaveCount(1);

    let ukuranJudul = 0;
    for (const scale of [1, 2]) {
      const gaya = await page.addStyleTag({
        content: `:root { --font-scale: ${scale} !important; }`,
      });
      const kelebihan = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      const ukuran = await page
        .locator("h1")
        .first()
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      if (scale === 1) ukuranJudul = ukuran;
      else expect(ukuran).toBeCloseTo(ukuranJudul * 2, 1);
      expect(kelebihan, `${halaman.nama}, teks ${scale * 100}%`).toBeLessThanOrEqual(1);
      await gaya.evaluate((el) => el.remove());
    }
  });
}

for (const width of [320, 768, 1024, 1440]) {
  test(`filter dan hasil lowongan pada ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await palsukanApi(page);
    await page.goto("/lowongan");
    if (width < 1024) {
      await expect(page.locator("main details")).not.toHaveAttribute("open");
      await page.locator("main summary").click();
    }
    const filter = page.locator("main details");
    const hasil = page.locator("main section[aria-labelledby]");
    await expect(filter).toBeVisible();
    await expect(hasil).toBeVisible();
    const f = (await filter.boundingBox())!;
    const h = (await hasil.boundingBox())!;
    if (width >= 1024) {
      expect(h.x).toBeGreaterThanOrEqual(f.x + f.width);
      expect(Math.abs(h.y - f.y)).toBeLessThanOrEqual(1);
    } else {
      expect(h.y).toBeGreaterThanOrEqual(f.y + f.height);
    }
  });
}

test("form masuk tetap ringkas pada desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await palsukanApi(page);
  await page.goto("/masuk");
  const form = page.locator("main form");
  await expect(form).toBeVisible();
  const kotak = (await form.boundingBox())!;
  expect(kotak.width).toBeLessThanOrEqual(512);
  expect(Math.abs(kotak.x + kotak.width / 2 - 720)).toBeLessThanOrEqual(1);
});

test("filter HP bisa dibuka dengan keyboard dan menyimpan isian saat ditutup", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await palsukanApi(page);
  await page.goto("/lowongan");
  const ringkasan = page.locator("main summary");
  await ringkasan.focus();
  await ringkasan.press("Enter");
  const kata = page.getByRole("textbox", { name: "Kata kunci" });
  await kata.fill("kasir");
  await ringkasan.press("Enter");
  await expect(kata).not.toBeVisible();
  await ringkasan.press("Enter");
  await expect(kata).toHaveValue("kasir");
});
