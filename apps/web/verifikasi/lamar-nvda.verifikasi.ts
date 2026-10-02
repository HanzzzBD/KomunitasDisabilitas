// Verifikasi dialog lamar dengan NVDA (PR-078, checklist
// `docs/implementation/log/pr-078-nvda-checklist.md`). BUKAN test CI.
//
// Pola sama `feed-nvda.verifikasi.ts`: API dipalsukan dengan `palsukanApi`,
// halaman disajikan dari `dist` (`vite preview`), ucapan dari langkah yang
// jendela ujinya TIDAK di depan dibuang dari laporan (privasi pengguna).
//
// Prasyarat: Windows + NVDA terpasang; `pnpm --filter @nawasena/web build`;
// `vite preview --port 4179 --strictPort`; jalankan dengan
//   VERIFIKASI_BASE_URL=http://localhost:4179 \
//   pnpm exec playwright test -c verifikasi/playwright.verifikasi.config.ts lamar-nvda
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi } from "../e2e/palsukan-api.js";
import { judulJendelaDepan, nyalakanNvda, tekanTombolOs, type SesiNvda } from "./nvda.js";

const JUDUL = "Staf Layanan Pelanggan";
const ALAMAT = "/lowongan/01912345-89ab-7def-8123-4567890abe01";
const HALAMAN = { nama: "lamar (verifikasi NVDA)", jalur: ALAMAT, butuhSesi: true } as const;

let nvda: SesiNvda | null = null;
const langkah: Array<{ langkah: string; jendelaUjiDiDepan: boolean; ucapan: string[] }> = [];

test.beforeAll(async () => {
  nvda = await nyalakanNvda();
});

test.afterAll(() => {
  nvda?.hentikan();
  writeFileSync(
    process.env.VERIFIKASI_LAPORAN ?? "laporan-lamar-nvda.json",
    JSON.stringify(langkah, null, 2),
  );
});

function teksUcapan(mentah: string): string {
  return [...mentah.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => m[1])
    .join(" ")
    .trim();
}

async function catat(page: Page, nama: string, aksi: () => Promise<void>, jedaMs = 1_500) {
  if (!judulJendelaDepan().includes(JUDUL)) {
    await page.bringToFront();
    await page.waitForTimeout(800);
  }
  const jendelaUjiDiDepan = judulJendelaDepan().includes(JUDUL);
  const tanda = nvda!.ucapan().length;
  await aksi();
  await page.waitForTimeout(jedaMs);
  const ucapan = jendelaUjiDiDepan
    ? nvda!
        .ucapan()
        .slice(tanda)
        .map(teksUcapan)
        .filter((u) => u !== "")
    : ["[dibuang: jendela lain di depan]"];
  langkah.push({ langkah: nama, jendelaUjiDiDepan, ucapan });
  return ucapan;
}

let halamanAktif: Page | null = null;
const os = (tombol: string) => async () => {
  for (let percobaan = 0; ; percobaan += 1) {
    try {
      tekanTombolOs(tombol, JUDUL);
      return;
    } catch (err) {
      if (percobaan >= 3 || halamanAktif === null) throw err;
      await halamanAktif.bringToFront();
      await halamanAktif.waitForTimeout(800);
    }
  }
};

test("dialog lamar dengan NVDA: judul, pilihan, galat, hasil", async ({ page }) => {
  test.setTimeout(300_000);

  await palsukanApi(page, HALAMAN);
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
  await page.route("**/api/v1/jobs/*/apply", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          id: "01912345-89ab-7def-8123-4567890aff01",
          jobId: "01912345-89ab-7def-8123-4567890abe01",
          resumeId: "01912345-89ab-7def-8123-4567890abf01",
          discloseDisability: false,
          status: "submitted",
          appliedAt: "2026-10-02T03:00:00.000Z",
        },
      }),
    }),
  );
  await page.goto(ALAMAT);
  await expect(page.getByRole("heading", { level: 1, name: JUDUL })).toBeVisible();
  halamanAktif = page;
  await page.bringToFront();

  const lamar = page.getByRole("button", { name: "Lamar lowongan ini" });
  await catat(page, "fokus tombol Lamar", () => lamar.focus());
  await catat(page, "Enter → dialog terbuka (nama + deskripsi dialog)", os("{ENTER}"), 4_000);

  // Tab menelusuri dialog: CV terpilih → grup pengungkapan → … → Kirim.
  for (let i = 1; i <= 4; i += 1) {
    await catat(page, `Tab ${String(i)} di dalam dialog`, os("{TAB}"));
  }

  // Kirim tanpa memilih pengungkapan → galat diumumkan, fokus ke radio "Ya".
  const kirim = page.getByRole("button", { name: "Kirim lamaran" });
  await catat(page, "fokus Kirim lamaran", () => kirim.focus());
  await catat(page, "Enter tanpa memilih → galat + fokus ke pilihan", os("{ENTER}"), 3_000);

  // Panah bawah pindah ke "Tidak" (perilaku radio grup) dan memilihnya.
  await catat(page, "panah bawah → 'Tidak, jangan kirim' terpilih", os("{DOWN}"), 2_000);
  await catat(page, "panah atas → 'Ya' + pratinjau tampil", os("{UP}"), 2_000);
  await catat(page, "panah bawah → kembali ke 'Tidak'", os("{DOWN}"), 2_000);

  await catat(page, "fokus Kirim lamaran (kedua)", () => kirim.focus());
  await catat(page, "Enter → lamaran terkirim, fokus ke judul hasil", os("{ENTER}"), 4_000);
  await expect(page.getByRole("heading", { level: 3, name: "Lamaran terkirim" })).toBeFocused();
  await catat(page, "NVDA: panah bawah (isi hasil)", os("{DOWN}"));
  await catat(page, "NVDA: panah bawah (status pengungkapan)", os("{DOWN}"));
});
