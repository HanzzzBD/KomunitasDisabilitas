import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";
import { COMMUNITY_REPORT_UJI as REPORT } from "./admin-community-fixture.js";
import { COMMUNITY_UJI as ROOM } from "./community-fixture.js";
const DETAIL = `/admin/community/laporan/${REPORT.id}`;
test.beforeEach(async ({ page }) => {
  await palsukanApi(page, { nama: "admin Community", jalur: DETAIL, butuhAdmin: true });
});
test("keyboard moderation requires a reason, traps focus, confirms and refreshes status", async ({
  page,
}) => {
  await page.goto(DETAIL);
  const trigger = page.getByRole("button", { name: "Sembunyikan", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tinjau keputusan" }).click();
  await expect(dialog.getByRole("textbox", { name: /Alasan keputusan/ })).toBeFocused();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    );
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("textbox", { name: /Alasan keputusan/ }).fill("Melanggar aturan ruang.");
  await dialog.getByRole("button", { name: "Tinjau keputusan" }).click();
  await expect(dialog.getByRole("heading", { name: "Konfirmasi keputusan" })).toBeFocused();
  await tungguGayaTenang(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: "test-results/pr118-moderation.png", fullPage: true });
  await dialog.getByRole("button", { name: "Konfirmasi keputusan" }).click();
  await expect(page.getByText("Keputusan tercatat. Data telah diperbarui.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detail laporan" })).toBeFocused();
  await expect(page.getByRole("article")).toContainText("Disembunyikan");
});
test("room create, edit, archive and reactivate work with explicit confirmations", async ({
  page,
}) => {
  await page.goto("/admin/community/ruang/baru");
  await page.getByRole("textbox", { name: /Nama ruang/ }).fill("Karier Bandung");
  await page.getByRole("textbox", { name: /Slug ruang/ }).fill("karier-bandung");
  await page.getByRole("textbox", { name: /Deskripsi ruang/ }).fill("Diskusi kerja di Bandung");
  await page.getByRole("combobox", { name: "Jenis ruang" }).selectOption("city");
  await page.getByRole("textbox", { name: /Kota/ }).fill("Bandung");
  await page.getByRole("button", { name: "Simpan ruang" }).click();
  await expect(page).toHaveURL(`/admin/community/ruang/${ROOM.id}`);
  await page.getByRole("textbox", { name: /Nama ruang/ }).fill("Karier inklusif Bandung");
  await page.getByRole("button", { name: "Simpan ruang" }).click();
  await expect(page.getByText("Perubahan berhasil disimpan.")).toBeVisible();
  await page.getByRole("button", { name: "Arsipkan ruang" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Konfirmasi keputusan" }).click();
  await page.getByRole("button", { name: "Aktifkan kembali" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Konfirmasi keputusan" }).click();
  await expect(page.getByRole("button", { name: "Arsipkan ruang" })).toBeVisible();
});
test("reject keeps the content published and queue status filter finds the decision", async ({
  page,
}) => {
  await page.goto(DETAIL);
  await page.getByRole("button", { name: "Tolak laporan" }).click();
  await page.getByRole("textbox", { name: /Alasan keputusan/ }).fill("Tidak melanggar aturan.");
  await page.getByRole("button", { name: "Tinjau keputusan" }).click();
  await page.getByRole("button", { name: "Konfirmasi keputusan" }).click();
  await expect(page.getByRole("article")).toContainText("Terbit");
  await page.getByRole("link", { name: "Kembali ke daftar" }).click();
  await expect(page.getByText("Tidak ada hasil untuk filter ini.")).toBeVisible();
  await page.getByRole("combobox", { name: "Status" }).focus();
  await page.getByRole("combobox", { name: "Status" }).selectOption("rejected");
  await expect(page.getByText(REPORT.reason)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Status" })).toBeFocused();
});
for (const width of [320, 768, 1024, 1440])
  test(`admin Community reflows at ${width}px with 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/community");
    await expect(page.getByText(ROOM.name)).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await tungguGayaTenang(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.goto(DETAIL);
    await expect(page.getByText(REPORT.reason)).toBeVisible();
    await page.getByRole("button", { name: "Sembunyikan" }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });
