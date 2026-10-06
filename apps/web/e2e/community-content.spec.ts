import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { palsukanDiskusi } from "./palsukan-diskusi.js";
import { tungguGayaTenang } from "./palsukan-api.js";
import { COMMUNITY_UJI as ROOM, COMMUNITY_POST_UJI as POST } from "./community-fixture.js";
const DETAIL = `/community/content/post/${POST.id}`;
async function axe(page: Page) {
  await tungguGayaTenang(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}
test("draft survives reload, publish stays in room and appends a chronological comment", async ({
  page,
}) => {
  await palsukanDiskusi(page);
  await page.goto(`/community/${ROOM.slug}`);
  const editor = page.getByRole("textbox", { name: "Tulis sesuatu untuk ruang ini" });
  await editor.fill("Pengalaman wawancara saya");
  await page.reload();
  await expect(editor).toHaveValue("Pengalaman wawancara saya");
  await page.getByRole("button", { name: "Kirim tulisan" }).click();
  await expect(page.getByText("Tulisan berhasil dikirim.")).toBeVisible();
  await expect(page).toHaveURL(`/community/${ROOM.slug}`);
  await expect(page.getByRole("article").first()).toContainText("Pengalaman wawancara saya");
  await expect(editor).toHaveValue("");
  await page.goto(DETAIL);
  await page.getByRole("textbox", { name: "Tulis komentar" }).fill("Saya juga berlatih wawancara.");
  await page.getByRole("button", { name: "Kirim komentar" }).click();
  await expect(page.getByText("Komentar berhasil dikirim.")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Komentar", exact: true }).getByRole("article").last(),
  ).toContainText("Saya juga berlatih wawancara.");
  await axe(page);
});
test("report dialog traps focus, validates, closes with Escape/success and returns focus", async ({
  page,
}) => {
  await palsukanDiskusi(page);
  await page.goto(DETAIL);
  const trigger = page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Laporkan tulisan" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Laporkan tulisan" });
  await dialog.getByRole("button", { name: "Kirim laporan" }).click();
  await expect(dialog.getByRole("textbox", { name: "Alasan laporan" })).toBeFocused();
  await axe(page);
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    );
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog
    .getByRole("textbox", { name: "Alasan laporan" })
    .fill("Tulisan mengandung data pribadi.");
  await dialog.getByRole("button", { name: "Kirim laporan" }).click();
  await expect(page.getByText(/Laporan Anda diterima/)).toBeVisible();
  await expect(trigger).toBeFocused();
});
test("owner edit/delete focus remains usable and removed text disappears", async ({ page }) => {
  await palsukanDiskusi(page);
  await page.goto(DETAIL);
  const post = page.getByRole("article").first();
  await post.getByRole("button", { name: "Ubah", exact: true }).click();
  const editor = post.getByRole("textbox", { name: "Ubah tulisan" });
  await expect(editor).toBeFocused();
  await editor.fill("<img src=x onerror=alert(1)>".repeat(6));
  await post.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(post.getByRole("button", { name: "Ubah", exact: true })).toBeFocused();
  await expect(post.locator("img")).toHaveCount(0);
  await post.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hapus tulisan ini" }).click();
  await expect(post).toBeFocused();
  await expect(post.getByText("Tulisan dihapus", { exact: true })).toBeVisible();
  await expect(post).not.toContainText("onerror");
  await axe(page);
});
test("manual pagination preserves focus and chronological reading order", async ({ page }) => {
  await palsukanDiskusi(page, true);
  await page.goto(`/community/${ROOM.slug}`);
  const more = page.getByRole("button", { name: "Muat tulisan lainnya" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Tulisan halaman kedua")).toBeVisible();
  await expect(page.getByRole("button", { name: "Semua tulisan sudah ditampilkan" })).toBeFocused();
  await page.goto(DETAIL);
  const comments = page.getByRole("button", { name: "Muat komentar lainnya" });
  await comments.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Semua komentar sudah ditampilkan" }),
  ).toBeFocused();
  await expect(
    page.getByRole("list", { name: "Komentar", exact: true }).getByRole("article").last(),
  ).toContainText("Komentar halaman kedua");
  await axe(page);
});
for (const width of [320, 768, 1024, 1440]) {
  test(`discussion/composer/report reflow at ${width}px and 200% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await palsukanDiskusi(page);
    for (const path of [`/community/${ROOM.slug}`, DETAIL]) {
      await page.goto(path);
      await expect(page.getByRole("textbox").first()).toBeVisible();
      await page.addStyleTag({
        content: ":root { --font-scale: 2 !important; font-size: 16px !important; }",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await axe(page);
    }
    await page
      .getByRole("article")
      .first()
      .getByRole("button", { name: "Laporkan tulisan" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await axe(page);
    if (width === 1440)
      await page.screenshot({
        path: test.info().outputPath("community-report.png"),
        fullPage: true,
      });
  });
}
