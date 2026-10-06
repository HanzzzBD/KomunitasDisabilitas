import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { palsukanApi } from "./palsukan-api.js";
const companyId = "01912345-2222-7000-8000-000000000001";
const jobId = "01912345-3333-7000-8000-000000000001";
const company = {
  id: companyId,
  name: "Perusahaan Demo",
  description: "Perusahaan uji",
  website: null,
  city: "Jakarta",
  inclusivityStatus: "unverified",
  accommodationsAvailable: [],
  verifiedAt: null,
  recruitmentStatus: "pending",
  memberRole: "owner",
};
const job = {
  id: jobId,
  companyId,
  title: "Analis Uji",
  description: "Menganalisis data",
  requirements: null,
  employmentType: "full_time",
  workMode: "remote",
  city: "Jakarta",
  province: null,
  salaryMin: null,
  salaryMax: null,
  salaryVisible: false,
  accommodations: ["ramah_screen_reader"],
  welcomedDisabilityTypes: [],
  source: "employer",
  status: "draft",
  createdBy: "01912345-1111-7000-8000-000000000001",
  publishedAt: null,
  expiresAt: null,
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
};
test("employer starts with company registration and pending drafts stay unpublished", async ({
  page,
}) => {
  await palsukanApi(page, { nama: "Employer", jalur: "/employer", butuhEmployer: true });
  let registered = false;
  let draft = false;
  await page.route("**/api/v1/employer/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const data = p.endsWith("/register")
      ? ((registered = true), company)
      : p.endsWith("/employer/companies")
        ? registered
          ? [company]
          : []
        : p.endsWith("/employer/jobs")
          ? ((draft = true), job)
          : draft
            ? [job]
            : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
  await page.goto("/employer");
  await page.getByLabel("Nama perusahaan").fill("Perusahaan Demo");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Menunggu persetujuan rekrutmen", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Buat lowongan", exact: true }).click();
  await page.getByLabel("Judul lowongan").fill("Analis Uji");
  await page.getByLabel("Deskripsi", { exact: true }).fill("Menganalisis data");
  await page.getByLabel("Perangkat lunak ramah pembaca layar").check();
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Analis Uji", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tayangkan lowongan" })).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("approved employer can publish and close a job", async ({ page }) => {
  await palsukanApi(page, { nama: "Employer", jalur: "/employer", butuhEmployer: true });
  let status = "draft";
  await page.route("**/api/v1/employer/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith("/publish")) status = "published";
    if (p.endsWith("/close")) status = "closed";
    const data = p.endsWith("/employer/companies")
      ? [{ ...company, recruitmentStatus: "approved" }]
      : p.endsWith("/jobs")
        ? [{ ...job, status }]
        : { ...job, status };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
  await page.goto("/employer");
  await page.getByRole("button", { name: "Tayangkan lowongan" }).click();
  await expect(page.getByText("Tayang", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tutup lowongan" }).click();
  await expect(page.getByText("Ditutup", { exact: true })).toBeVisible();
});
