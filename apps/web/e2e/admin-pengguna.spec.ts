// Moderasi akun sungguhan (PR-083b) — AC "konfirmasi dua langkah di FE",
// Testing Checklist "E2E (admin flow)" & "Accessibility (dialog)". Registry
// `HALAMAN` ("admin — pengguna") memeriksa daftarnya; yang di sini adalah kedua
// langkah dialog dan keadaan sesudahnya.
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

async function tekan(page: Page, nama: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: nama }).focus();
  await page.keyboard.press("Enter");
}

test.describe("moderasi akun admin", () => {
  test("tangguhkan dua langkah, keyboard saja, axe pass di tiap langkah", async ({ page }) => {
    await palsukanApi(page, {
      nama: "admin — pengguna (moderasi)",
      jalur: "/admin/pengguna",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/pengguna");
    await page.getByRole("heading", { level: 2, name: "Pengguna" }).waitFor();

    await tekan(page, "Tangguhkan Rina Pelamar");
    const dialog = page.getByRole("dialog", { name: "Tangguhkan akun Rina Pelamar?" });
    await expect(dialog).toBeVisible();
    await axeBersih(page);

    // Langkah 1 — alasan kosong ditolak.
    await tekan(page, "Lanjut");
    await expect(dialog.getByText("Tulis alasannya dulu.")).toBeVisible();
    await dialog.getByRole("textbox", { name: /Alasan/ }).focus();
    await page.keyboard.type("laporan penyalahgunaan tiket #31");
    await tekan(page, "Lanjut");

    // Langkah 2 — fokus di judul langkah, alasan ditinjau.
    await expect(dialog.getByRole("heading", { name: /Langkah 2 dari 2/ })).toBeFocused();
    await expect(dialog).toContainText("laporan penyalahgunaan tiket #31");
    await axeBersih(page);

    const kirim = page.waitForRequest((r) => r.url().endsWith("/suspend"));
    await tekan(page, "Ya, tangguhkan");
    expect((await kirim).postDataJSON()).toEqual({ reason: "laporan penyalahgunaan tiket #31" });

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "ditangguhkan" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pulihkan Rina Pelamar" })).toBeVisible();
    await axeBersih(page);
  });

  test("pulihkan akun yang ditangguhkan; baris admin tanpa aksi", async ({ page }) => {
    await palsukanApi(page, {
      nama: "admin — pengguna (pulihkan)",
      jalur: "/admin/pengguna",
      butuhSesi: true,
      butuhAdmin: true,
    });
    await page.goto("/admin/pengguna");
    const baris = page.getByRole("row", { name: /Admin Uji/ });
    await expect(baris.getByRole("button")).toHaveCount(0);

    await tekan(page, "Pulihkan Bayu Pelamar");
    const dialog = page.getByRole("dialog", { name: "Pulihkan akun Bayu Pelamar?" });
    await dialog.getByRole("textbox", { name: /Alasan/ }).focus();
    await page.keyboard.type("banding diterima tiket #12");
    await tekan(page, "Lanjut");
    const kirim = page.waitForRequest((r) => r.url().endsWith("/unsuspend"));
    await tekan(page, "Ya, pulihkan");
    await kirim;
    await expect(page.getByRole("button", { name: "Tangguhkan Bayu Pelamar" })).toBeVisible();
  });
});
