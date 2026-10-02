// "Lamaran Saya" sungguhan (PR-079) — keadaan yang TIDAK dijangkau registry
// `HALAMAN` generik: dialog tarik terbuka, sesudah ditarik, sesudah dikonfirmasi
// diterima, navigasi dari notifikasi, dan mode kurangi gerak.
//
// Seluruhnya KEYBOARD-ONLY (AC "Keyboard-only penuh"): tidak satu klik pun.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { LAMARAN_SAYA_UJI_ID, palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ALAMAT = `/lamaran/${LAMARAN_SAYA_UJI_ID}`;

async function axeBersih(page: Page): Promise<void> {
  await tungguGayaTenang(page);
  expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
}

async function tekan(page: Page, nama: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: nama }).focus();
  await page.keyboard.press("Enter");
}

test.describe("lamaran saya — alur sungguhan", () => {
  test("daftar → detail dengan keyboard; lini masa ordered list; status diumumkan", async ({
    page,
  }) => {
    await palsukanApi(page, { nama: "lamaran saya (alur)", jalur: "/lamaran", butuhSesi: true });
    await page.goto("/lamaran");
    const tautan = page.getByRole("link", { name: "Lihat lamaran Staf Admin Uji" });
    await tautan.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`${ALAMAT}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Staf Admin Uji" })).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Status terbaru lamaran Staf Admin Uji" }),
    ).toHaveText("Status terbaru lamaran Staf Admin Uji: Penawaran kerja.");

    const riwayat = page.locator("ol").filter({ hasText: "Lamaran dikirim" });
    await expect(riwayat.getByRole("listitem")).toHaveCount(4);
    await expect(riwayat.locator('li[aria-current="step"]')).toContainText("Penawaran kerja");
  });

  test("tarik lamaran: dialog konfirmasi, keyboard saja, axe pass tiap keadaan", async ({
    page,
  }) => {
    await palsukanApi(page, { nama: "lamaran saya (tarik)", jalur: ALAMAT, butuhSesi: true });
    await page.goto(ALAMAT);
    await page.getByRole("heading", { level: 1 }).waitFor();

    await tekan(page, "Tarik lamaran");
    const dialog = page.getByRole("dialog", { name: "Tarik lamaran ini?" });
    await expect(dialog).toBeVisible();
    await axeBersih(page);

    // Batal = tidak ada yang berangkat; fokus kembali ke pemicu.
    await tekan(page, "Jangan tarik");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Tarik lamaran" })).toBeFocused();

    await tekan(page, "Tarik lamaran");
    const kirim = page.waitForRequest((r) => r.url().endsWith("/withdraw"));
    await tekan(page, "Ya, tarik lamaran");
    await kirim;

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Status sekarang" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Tarik lamaran" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Saya diterima/ })).toHaveCount(0);
    await axeBersih(page);
  });

  test("'Saya diterima' satu ketuk → perayaan teks berfokus, tanpa animasi (kurangi gerak)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await palsukanApi(page, { nama: "lamaran saya (diterima)", jalur: ALAMAT, butuhSesi: true });
    await page.goto(ALAMAT);
    await page.getByRole("heading", { level: 1 }).waitFor();

    const kirim = page.waitForRequest((r) => r.url().endsWith("/confirm-hired"));
    await tekan(page, "Saya diterima");
    await kirim;

    const selamat = page.getByRole("heading", {
      level: 2,
      name: "Selamat, Anda diterima bekerja!",
    });
    await expect(selamat).toBeFocused();
    // Perayaan aksesibel = teks, bukan gerak: tidak ada animasi CSS/Web Animation
    // yang berjalan di halaman (AC "bukan animasi-saja", Manual Verification
    // "reduce-motion mode").
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await axeBersih(page);
  });

  test("notifikasi status lamaran → mendarat di lamaran yang tepat", async ({ page }) => {
    await palsukanApi(page, {
      nama: "lamaran saya (notifikasi)",
      jalur: "/notifikasi",
      butuhSesi: true,
    });
    await page.route(/\/api\/v1\/me\/notifications(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "01912345-89ab-7def-8123-4567890abd09",
              type: "lamaran.status_berubah",
              title: { id: "Status lamaran berubah", "id-simple": "Lamaran Anda berubah" },
              body: {
                id: "Lamaran Staf Admin Uji kini: Penawaran kerja.",
                "id-simple": "Lamaran Staf Admin Uji: ditawari kerja.",
              },
              params: {
                applicationId: LAMARAN_SAYA_UJI_ID,
                jobId: "01912345-89ab-7def-8123-4567890abd30",
                status: "offered",
              },
              readAt: null,
              createdAt: "2026-10-01T03:00:00.000Z",
            },
          ],
          meta: { nextCursor: null, unreadCount: 1 },
        }),
      }),
    );
    await page.goto("/notifikasi");
    const tautan = page.getByRole("link", { name: "Status lamaran berubah" });
    await tautan.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`${ALAMAT}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Staf Admin Uji" })).toBeVisible();
  });
});
