// Kamus BISINDO admin sungguhan (PR-085b) — AC "upload video+vtt+thumbnail →
// publish end-to-end", "progress diumumkan aria-live", "form keyboard-only +
// axe pass", "gagal upload → pesan jelas + retry". Registry `HALAMAN` sudah
// memeriksa ketiga halamannya diam; yang di sini adalah alurnya.
//
// Bucket = `STORAGE_UJI` yang dicegat `palsukanApi` (PUT lintas asal + CORS).
// PUT presigned NYATA ke MinIO dibuktikan di `apps/api/__tests__/storage-minio.test.ts`.
//
// KEYBOARD-ONLY untuk setiap tombol. Memilih berkas memakai `setInputFiles` —
// dialog berkas OS di luar jangkauan Playwright, bukan bagian halaman kita.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { KAMUS_UJI_ID, STORAGE_UJI, palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axeBersih(page: Page): Promise<void> {
  await tungguGayaTenang(page);
  expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
}

async function tekan(page: Page, nama: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: nama }).focus();
  await page.keyboard.press("Enter");
}

const HALAMAN = {
  nama: "admin — kamus (alur unggah)",
  jalur: `/admin/kamus/${KAMUS_UJI_ID}`,
  butuhSesi: true,
  butuhAdmin: true,
} as const;

test.describe("kamus BISINDO admin", () => {
  test("unggah caption + thumbnail, isi transkrip, terbitkan, lalu tarik — axe pass", async ({
    page,
  }) => {
    await palsukanApi(page, HALAMAN);
    await page.goto(HALAMAN.jalur);
    await page.getByRole("heading", { level: 2, name: "Ubah entri: Terima kasih" }).waitFor();
    await expect(page.getByRole("button", { name: "Terbitkan" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await axeBersih(page);

    const unggahan: string[] = [];
    page.on("request", (r) => {
      if (r.url().startsWith(STORAGE_UJI) && r.method() === "PUT") unggahan.push(r.url());
    });

    await page.getByLabel("Caption (.vtt)").setInputFiles({
      name: "terima-kasih.vtt",
      mimeType: "text/vtt",
      buffer: Buffer.from("WEBVTT\n\n00:00.000 --> 00:02.000\nTerima kasih\n"),
    });
    await expect(page.getByText("Caption (.vtt) tersimpan.")).toBeVisible();
    await page.getByLabel("Gambar sampul").setInputFiles({
      name: "sampul.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    await expect(page.getByText("Gambar sampul tersimpan.")).toBeVisible();
    expect(unggahan).toHaveLength(2);
    await axeBersih(page);

    await page.getByRole("textbox", { name: /Transkrip/ }).focus();
    await page.keyboard.type("Tangan kanan di dagu, lalu bergerak maju.");
    await tekan(page, "Simpan");
    await expect(page.getByText("Entri Terima kasih tersimpan.")).toBeVisible();

    await tekan(page, "Terbitkan");
    await expect(page.getByText("Terima kasih sudah terbit di kamus publik.")).toBeVisible();

    await tekan(page, "Tarik ke draf");
    const dialog = page.getByRole("dialog", { name: "Tarik Terima kasih ke draf?" });
    await expect(dialog).toBeVisible();
    await axeBersih(page);
    await tekan(page, "Ya, tarik ke draf");
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/ditarik ke draf/)).toBeVisible();
    await axeBersih(page);
  });

  test("bucket menolak → pesan jelas + Coba lagi berhasil", async ({ page }) => {
    await palsukanApi(page, HALAMAN);
    // Penolakan pertama saja (izin kedaluwarsa), percobaan ulang lolos.
    let tolak = true;
    await page.route(`${STORAGE_UJI}/**`, async (route) => {
      const cors = { "access-control-allow-origin": "*" };
      if (route.request().method() === "PUT" && tolak) {
        tolak = false;
        return route.fulfill({ status: 403, headers: cors, body: "" });
      }
      return route.fallback();
    });
    await page.goto(HALAMAN.jalur);
    await page.getByLabel("Caption (.vtt)").setInputFiles({
      name: "c.vtt",
      mimeType: "text/vtt",
      buffer: Buffer.from("WEBVTT\n"),
    });
    await expect(page.getByRole("alert")).toContainText("Penyimpanan menolak Caption (.vtt)");
    await axeBersih(page);
    await tekan(page, "Coba unggah Caption (.vtt) lagi");
    await expect(page.getByText("Caption (.vtt) tersimpan.")).toBeVisible();
  });
});
