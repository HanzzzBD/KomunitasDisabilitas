import { expect, test } from "@playwright/test";
import { HALAMAN } from "./halaman.js";
import { CV_UJI_ID, harusTidakBerpindah, palsukanApi } from "./palsukan-api.js";

const EDITOR = HALAMAN.find((h) => h.nama === "CV - editor terisi");

test.beforeEach(async ({ page }) => {
  expect(EDITOR, "entri registry editor CV hilang").toBeDefined();
  await palsukanApi(page, EDITOR);
  await page.goto(`/cv/${CV_UJI_ID}`);
  await harusTidakBerpindah(page, EDITOR!);
});

test("CV manual dapat diisi, diurutkan dengan tombol, dan disimpan per bagian", async ({
  page,
}) => {
  await page.locator("summary").filter({ hasText: "Pengalaman kerja" }).click();
  await page.getByRole("button", { name: "Tambah pengalaman kerja" }).click();
  await page.getByRole("button", { name: "Tambah pengalaman kerja" }).click();

  const form = page.getByRole("form", { name: "Pengalaman kerja" });
  const posisi = form.getByLabel("Nama posisi");
  await posisi.nth(0).fill("Staf Admin");
  await posisi.nth(1).fill("Relawan Data");

  const tombolTurun = form.getByRole("button", { name: "Pindah ke bawah pengalaman kerja 1" });
  await tombolTurun.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Item 1 dipindahkan ke posisi 2.")).toBeAttached();

  const [permintaan] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().includes(`/me/resumes/${CV_UJI_ID}`) && r.method() === "PUT",
    ),
    form.getByRole("button", { name: "Simpan bagian" }).click(),
  ]);
  const badan = permintaan.postDataJSON() as { content: { experiences: { title: string }[] } };
  expect(badan.content.experiences.map((item) => item.title)).toEqual([
    "Relawan Data",
    "Staf Admin",
  ]);
});

test("teks panjang tidak menimbulkan gulir mendatar pada layar 320 piksel", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator("summary").filter({ hasText: "Profil singkat" }).click();
  await page.getByLabel("Ringkasan profesional").fill("Pengalaman kerja inklusif. ".repeat(70));

  const meluber = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(meluber).toBe(false);
});

test("meminta PDF, mengumumkan progres, lalu mengunduh dari URL baru", async ({ page }) => {
  await page.route("**/berkas/cv.pdf**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: { "content-disposition": 'attachment; filename="cv.pdf"' },
      body: "%PDF-1.7 hasil uji",
    });
  });

  await page.getByRole("button", { name: "Siapkan PDF" }).click();
  await expect(page.getByText("PDF masuk antrean.")).toBeAttached();
  await expect(page.getByText("PDF siap diunduh.")).toBeAttached({ timeout: 8_000 });

  const unduhan = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PDF" }).click();
  await expect(unduhan).resolves.toBeDefined();
});
