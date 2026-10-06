import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const SEEKER = { nama: "navigasi karier", jalur: "/home", butuhSesi: true } as const;
for (const width of [320, 768, 1024, 1440]) {
  test(`lima tujuan utama, ukuran target, reflow dan axe pada ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await palsukanApi(page, SEEKER);
    await page.goto("/home");
    await expect(page.getByRole("heading", { level: 1, name: "Beranda" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(5);
    await expect(links).toHaveText(
      ["Beranda", "Lowongan", "Lamaran", width >= 1024 ? "CV Saya" : "CV", "Profil"],
      { useInnerText: true },
    );
    await expect(links.nth(0)).toHaveAttribute("aria-current", "page");
    for (const link of await links.all()) {
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const navBox = (await nav.boundingBox())!;
    if (width < 1024) expect(navBox.y + navBox.height).toBeCloseTo(900, 0);
    else {
      expect(navBox.x).toBeLessThan(32);
      expect(navBox.width).toBeLessThan(350);
    }
    await tungguGayaTenang(page);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    if (width === 320 || width === 1440)
      await page.screenshot({ path: `../../tmp/nawasena-navigation-${width}.png`, fullPage: true });
    await page.addStyleTag({
      content: ":root { --font-scale: 2 !important; --touch-target-min: 56px !important; }",
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
    for (const link of await links.all())
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });
}

test("keyboard, fokus halaman, active detail, Back/Forward, skip dan dialog", async ({ page }) => {
  await palsukanApi(page, SEEKER);
  await page.goto("/home");
  await page.getByRole("heading", { level: 1, name: "Beranda" }).waitFor();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Langsung ke konten utama" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const nav = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
  await nav.getByRole("link", { name: "Lowongan", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page
    .getByRole("link", { name: /Lihat detail lowongan/ })
    .first()
    .click();
  await expect(nav.getByRole("link", { name: "Lowongan", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  const detailUrl = page.url();
  await page.goBack();
  await expect(page).toHaveURL(/\/lowongan$/);
  await page.goForward();
  await expect(page).toHaveURL(detailUrl);
  const quick = page.getByRole("button", { name: "Pengaturan aksesibilitas cepat" });
  await quick.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Pengaturan aksesibilitas cepat" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("slider")).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: /sentuh|tombol/i })
    .first()
    .check();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(quick).toBeFocused();
  await page.locator(".shell-account > button").focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".shell-account > button")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".shell-account > button")).toBeFocused();
});

test("alias mempertahankan pencarian dan alamat lama", async ({ page }) => {
  await palsukanApi(page, SEEKER);
  await page.goto("/jobs?query=analis&work_mode=remote");
  await expect(page).toHaveURL(/\/lowongan\?query=analis&work_mode=remote$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
