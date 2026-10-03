// Analytics privacy-first sungguhan (PR-082) — Testing Checklist "E2E (event
// terkirim — mock endpoint)" dan AC "analytics gagal → aplikasi tidak
// terganggu", "opt-out di settings". Build CI tanpa website id (analytics
// no-op); spec ini menyalakannya lewat seam `window.__nawasenaAnalitik`.
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi } from "./palsukan-api.js";

const LOWONGAN_ID = "01912345-89ab-7def-8123-4567890abe01";
const ALAMAT = `/lowongan/${LOWONGAN_ID}`;
const WEBSITE = "00000000-0000-4000-8000-0000000000e2";

interface Terkirim {
  url: string;
  name?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

async function siapkan(
  page: Page,
  opsi: { status?: number; dnt?: boolean } = {},
): Promise<Terkirim[]> {
  await page.addInitScript(
    ([website, dnt]) => {
      (window as unknown as { __nawasenaAnalitik: unknown }).__nawasenaAnalitik = {
        websiteId: website,
      };
      if (dnt) Object.defineProperty(navigator, "doNotTrack", { value: "1" });
    },
    [WEBSITE, opsi.dnt === true] as const,
  );
  await palsukanApi(page, { nama: "analitik", jalur: ALAMAT, butuhSesi: true });
  const terkirim: Terkirim[] = [];
  await page.route("**/analitik/api/send", async (route) => {
    const badan = route.request().postDataJSON() as { payload: Terkirim };
    terkirim.push(badan.payload);
    await route.fulfill({ status: opsi.status ?? 200, body: "{}" });
  });
  await page.route("**/api/v1/jobs/*/apply", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "01912345-89ab-7def-8123-4567890aff01",
          jobId: LOWONGAN_ID,
          resumeId: "01912345-89ab-7def-8123-4567890abf01",
          discloseDisability: false,
          status: "submitted",
          appliedAt: "2026-10-02T03:00:00.000Z",
        },
      }),
    }),
  );
  return terkirim;
}

async function lamarDenganKeyboard(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Lamar lowongan ini" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  // Kirim ditahan sampai daftar CV tiba (temuan PR-082) — tunggu CV bawaan.
  await expect(dialog.getByRole("radio", { name: /CV Utama/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /Tidak, jangan kirim/ }).focus();
  await page.keyboard.press("Space");
  await dialog.getByRole("button", { name: "Kirim lamaran" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 3, name: "Lamaran terkirim" })).toBeVisible();
}

test.describe("analytics privacy-first", () => {
  test("pageview ternormal + event `lamar` tanpa data apa pun; tidak ada PII", async ({ page }) => {
    const terkirim = await siapkan(page);
    await page.goto(`${ALAMAT}?utm=rahasia#x`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await expect.poll(() => terkirim.length).toBeGreaterThan(0);
    expect(terkirim[0]).toMatchObject({ website: WEBSITE, url: "/lowongan/:id" });

    await lamarDenganKeyboard(page);
    await expect.poll(() => terkirim.some((t) => t.name === "lamar")).toBe(true);
    const lamar = terkirim.find((t) => t.name === "lamar");
    expect(lamar?.data).toBeUndefined();

    const semua = JSON.stringify(terkirim);
    expect(semua).not.toContain(LOWONGAN_ID);
    expect(semua).not.toContain("rahasia");
    expect(semua).not.toMatch(/disclose|disabilitas|\+62|@/i);
    for (const t of terkirim) {
      expect(t).not.toHaveProperty("title");
      expect(t).not.toHaveProperty("referrer");
    }
  });

  test("server analytics 500 → lamaran tetap berhasil (fire-and-forget)", async ({ page }) => {
    await siapkan(page, { status: 500 });
    await page.goto(ALAMAT);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await lamarDenganKeyboard(page);
  });

  test("opt-out di Pengaturan → tidak ada yang terkirim sesudahnya", async ({ page }) => {
    const terkirim = await siapkan(page);
    await page.goto("/pengaturan");
    const kotak = page.getByRole("checkbox", { name: /Kirim statistik pemakaian/ });
    await expect(kotak).toBeChecked();
    await kotak.focus();
    await page.keyboard.press("Space");
    await expect(kotak).not.toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: "dimatikan" })).toBeVisible();

    const sebelum = terkirim.length;
    await page.goto(ALAMAT);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await lamarDenganKeyboard(page);
    expect(terkirim.length).toBe(sebelum);
  });

  test("Do Not Track → tidak ada yang terkirim, dan kotaknya diganti penjelasan", async ({
    page,
  }) => {
    const terkirim = await siapkan(page, { dnt: true });
    await page.goto(ALAMAT);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await lamarDenganKeyboard(page);
    await page.goto("/pengaturan");
    await expect(page.getByText(/meminta untuk tidak dilacak/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Kirim statistik/ })).toHaveCount(0);
    expect(terkirim).toEqual([]);
  });
});
