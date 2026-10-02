// Alur lamar sungguhan (PR-078) — AC "apply kedua mode disclose", "tanpa CV →
// diarahkan membuat CV lalu kembali", "dialog lolos keyboard-only", axe di
// setiap keadaan dialog. Kirim ganda dan aturan isian dijaga `lamar.test.tsx`.
//
// Seluruhnya KEYBOARD-ONLY: tidak satu klik pun (AC "Dialog lolos NVDA
// checklist + keyboard-only"; checklist NVDA manual ada di
// docs/implementation/log/pr-078-nvda-checklist.md).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import { CV_UJI_ID, palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** Fixture `detailLowonganUji` pertama — "Staf Layanan Pelanggan" lengkap. */
const LOWONGAN_ID = "01912345-89ab-7def-8123-4567890abe01";
const ALAMAT = `/lowongan/${LOWONGAN_ID}`;

async function siapkan(page: Page, nama: string): Promise<Request[]> {
  await palsukanApi(page, { nama, jalur: ALAMAT, butuhSesi: true });
  const lamaran: Request[] = [];
  await page.route("**/api/v1/jobs/*/apply", async (route) => {
    lamaran.push(route.request());
    const body = route.request().postDataJSON() as {
      resumeId: string;
      discloseDisability: boolean;
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "01912345-89ab-7def-8123-4567890aff01",
          jobId: LOWONGAN_ID,
          resumeId: body.resumeId,
          discloseDisability: body.discloseDisability,
          status: "submitted",
          appliedAt: "2026-10-02T03:00:00.000Z",
        },
      }),
    });
  });
  return lamaran;
}

async function axeBersih(page: Page): Promise<void> {
  await tungguGayaTenang(page);
  expect((await new AxeBuilder({ page }).withTags(TAG).analyze()).violations).toEqual([]);
}

async function tekan(page: Page, nama: string | RegExp, tombol = "Enter"): Promise<void> {
  await page.getByRole("button", { name: nama }).focus();
  await page.keyboard.press(tombol);
}

test.describe("lamar — alur sungguhan", () => {
  test("mode TIDAK diungkap: pilihan kosong ditolak, 'Ya' nonaktif beralasan, keyboard saja", async ({
    page,
  }) => {
    const lamaran = await siapkan(page, "lowongan — lamar (tidak diungkap)");
    await page.goto(ALAMAT);
    await page.getByRole("heading", { level: 1 }).waitFor();

    await tekan(page, "Lamar lowongan ini");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const tidak = dialog.getByRole("radio", { name: /Tidak, jangan kirim/ });
    const ya = dialog.getByRole("radio", { name: /Ya, kirim/ });
    // Fixture profil = tanpa consent: "Ya" nonaktif, DENGAN alasan terbaca.
    await expect(ya).toBeDisabled();
    await expect(ya).toHaveAccessibleDescription(/belum berisi data disabilitas/);
    await expect(tidak).not.toBeChecked();
    await axeBersih(page);

    // Kirim tanpa memilih → ditolak di klien; fokus ke pilihan yang bisa diambil.
    await tekan(page, "Kirim lamaran");
    await expect(dialog.getByRole("alert")).toHaveText(/Pilih salah satu/);
    await expect(tidak).toBeFocused();
    expect(lamaran).toHaveLength(0);
    await axeBersih(page);

    await page.keyboard.press("Space");
    await expect(tidak).toBeChecked();
    await tekan(page, "Kirim lamaran");

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 3, name: "Lamaran terkirim" })).toBeFocused();
    expect(lamaran).toHaveLength(1);
    expect(lamaran[0]?.postDataJSON()).toMatchObject({ discloseDisability: false });
    expect(await lamaran[0]?.headerValue("idempotency-key")).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    await axeBersih(page);
  });

  test("mode DIUNGKAP lewat ?lamar=1: pratinjau isi salinan, lalu berangkat disclose=true", async ({
    page,
  }) => {
    const lamaran = await siapkan(page, "lowongan — lamar (diungkap)");
    await page.route("**/api/v1/me/profile", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            headline: null,
            summary: null,
            city: null,
            province: null,
            openToRemote: false,
            disclosureDefault: "ask_each_time",
            consentSensitiveAt: "2026-02-01T03:00:00.000Z",
            sensitive: {
              disabilityTypes: ["netra"],
              accommodationNeeds: { tags: ["ramah_screen_reader"], notes: null },
            },
          },
        }),
      }),
    );

    // `?lamar=1` = cara halaman masuk/editor CV meminta dialog terbuka.
    await page.goto(`${ALAMAT}?lamar=1`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ALAMAT}$`));

    const ya = dialog.getByRole("radio", { name: /Ya, kirim/ });
    await expect(ya).toBeEnabled();
    await ya.focus();
    await page.keyboard.press("Space");
    const pratinjau = dialog.getByRole("region", { name: "Yang akan dikirim ke perusahaan" });
    await expect(pratinjau).toContainText("Perangkat lunak ramah pembaca layar");
    await axeBersih(page);

    await tekan(page, "Kirim lamaran");
    await expect(page.getByRole("heading", { level: 3, name: "Lamaran terkirim" })).toBeFocused();
    await expect(page.getByText("Data disabilitas Anda ikut dikirim")).toBeVisible();
    expect(lamaran[0]?.postDataJSON()).toMatchObject({ discloseDisability: true });
  });

  test("tanpa CV → buat CV dari profil → 'Kembali melamar' membuka dialog lagi dengan CV baru", async ({
    page,
  }) => {
    await siapkan(page, "lowongan — lamar (tanpa CV)");
    // Daftar CV dipalsukan SENDIRI: kosong sebelum dibuat, lalu tepat satu CV
    // sesudahnya. Pemalsu bawaan menyimpan CV baru dengan id yang sama dengan
    // fixture-nya, jadi daftarnya akan memuat id kembar.
    let dibuat = false;
    await page.route("**/api/v1/me/resumes", async (route) => {
      if (route.request().method() === "POST") {
        dibuat = true;
        return route.fallback();
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: dibuat
            ? [
                {
                  id: CV_UJI_ID,
                  title: "CV saya",
                  pdfUrl: null,
                  createdVia: "manual",
                  createdAt: "2026-10-02T03:00:00.000Z",
                  updatedAt: "2026-10-02T03:00:00.000Z",
                },
              ]
            : [],
        }),
      });
    });

    await page.goto(ALAMAT);
    await tekan(page, "Lamar lowongan ini");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Anda belum punya CV" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Buat CV dengan bantuan AI" })).toHaveAttribute(
      "href",
      `/cv/chat?tujuan=${encodeURIComponent(`${ALAMAT}?lamar=1`)}`,
    );
    await axeBersih(page);

    await tekan(page, "Buat CV dari profil saya");
    await expect(page).toHaveURL(/\/cv\/[^/?]+\?tujuan=/);
    const kembali = page.getByRole("link", { name: "Kembali melamar lowongan" });
    await kembali.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`${ALAMAT}$`));
    const dialogLagi = page.getByRole("dialog");
    await expect(dialogLagi.getByRole("radio", { name: /CV saya/ })).toBeChecked();
  });
});
