// Operasional lamaran admin (PR-077b) — keadaan yang TIDAK dijangkau registry
// `HALAMAN` generik: dialog alasan terbuka, data yang diungkap sesudah dibuka,
// dan alur ubah status (AC "Update status → user menerima notifikasi" sisi
// web: PUT berangkat dengan alasan, status & riwayat diperbarui di layar;
// notifikasinya sendiri dibuktikan `applications-admin-db.test.ts` di API).
//
// Seluruhnya KEYBOARD-ONLY (AC "tabel + aksi keyboard"): tidak satu klik pun.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LAMARAN_UJI_ID, palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ALAMAT = `/admin/lamaran/${LAMARAN_UJI_ID}`;

async function siapkan(page: Page, nama: string): Promise<void> {
  await palsukanApi(page, { nama, jalur: ALAMAT, butuhSesi: true, butuhAdmin: true });
  await page.goto(ALAMAT);
  await page.getByRole("heading", { name: "Lamaran Rina Pelamar" }).waitFor();
}

test.describe("lamaran admin — alur sungguhan", () => {
  test("buka data yang diungkap lewat dialog ber-alasan, keyboard saja, axe pass tiap keadaan", async ({
    page,
  }) => {
    await siapkan(page, "admin — detail lamaran (pengungkapan)");
    await expect(page.getByText("Juru bahasa isyarat")).toHaveCount(0);

    const tombol = page.getByRole("button", { name: "Tampilkan data yang diungkap" });
    await tombol.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await tungguGayaTenang(page);
    expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);

    // Alasan kosong → ditolak di klien, dialog tetap terbuka.
    await dialog.getByRole("button", { name: "Buka data" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByText("Tulis alasan membuka data ini.")).toBeVisible();

    await dialog.getByRole("textbox", { name: /Alasan membuka/ }).focus();
    await page.keyboard.type("tiket #9 — meneruskan ke perusahaan");
    const kirim = page.waitForRequest((r) => r.url().endsWith("/disclosure"));
    await dialog.getByRole("button", { name: "Buka data" }).focus();
    await page.keyboard.press("Enter");
    expect((await kirim).postDataJSON()).toEqual({ reason: "tiket #9 — meneruskan ke perusahaan" });

    await expect(dialog).toBeHidden();
    await expect(page.getByText("Juru bahasa isyarat", { exact: false })).toBeVisible();
    // Fokus pindah ke judul data yang baru tampil, bukan hilang ke <body>.
    await expect(page.getByRole("heading", { name: /Diungkap pada/ })).toBeFocused();

    await tungguGayaTenang(page);
    expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
  });

  test("ubah status dengan alasan → status & riwayat (ordered list) diperbarui, axe pass", async ({
    page,
  }) => {
    await siapkan(page, "admin — detail lamaran (ubah status)");

    const pilihan = page.getByRole("combobox", { name: /Status baru/ });
    await pilihan.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "Penawaran kerja" }).focus();
    await page.keyboard.press("Enter");

    await page.getByRole("textbox", { name: /Alasan perubahan/ }).focus();
    await page.keyboard.type("perusahaan menawarkan kontrak");
    const kirim = page.waitForRequest((r) => r.url().endsWith("/status"));
    await page.getByRole("button", { name: "Simpan status" }).focus();
    await page.keyboard.press("Enter");
    expect((await kirim).postDataJSON()).toEqual({
      status: "offered",
      reason: "perusahaan menawarkan kontrak",
    });

    await expect(page.getByRole("status").filter({ hasText: "Penawaran kerja" })).toBeVisible();
    const riwayat = page.locator("ol").filter({ hasText: "sebelumnya" });
    await expect(riwayat.getByRole("listitem")).toHaveCount(2);

    await tungguGayaTenang(page);
    expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
  });
});
