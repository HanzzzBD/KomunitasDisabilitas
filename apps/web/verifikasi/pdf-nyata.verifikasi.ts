// Verifikasi jalur PDF CV di STACK NYATA + NVDA (PR-068c, utang U-24).
//
// Prasyarat tambahan dari `chat-nyata.verifikasi.ts`: MinIO dev hidup, worker
// (`pnpm --filter @nawasena/worker dev`) dengan `PDF_CHROMIUM_EXECUTABLE_PATH`.
//
//   1. PR-064 — jalur utuh LEWAT UI: minta PDF di editor, tunggu worker,
//      notifikasi `resume.pdf_siap` terlihat, unduh berkasnya.
//   2. PR-063 — berkas yang diunduh disimpan untuk diperiksa pohon struktur
//      tag-nya (skrip Python terpisah, `struktur-pdf.py`), lalu DIBUKA di
//      penampil PDF Chrome dengan NVDA: NVDA membaca dokumen baru secara
//      otomatis (say all), dan ucapannya menjadi bukti urutan baca.
//      Pengganti Adobe Reader (tidak terpasang; keputusan owner 2026-09-29).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { nyalakanNvda, tekanTombolOs, type SesiNvda } from "./nvda.js";

const TOKEN = (
  JSON.parse(readFileSync(process.env.VERIFIKASI_TOKEN_FILE ?? "", "utf8")) as { token: string }
).token;
const PAKAI_NVDA = process.env.VERIFIKASI_TANPA_NVDA !== "1";
const BERKAS_PDF = resolve(process.env.VERIFIKASI_PDF ?? "cv-verifikasi.pdf");

/** CV lengkap — seluruh bagian, tautan, aksara non-Latin, emoji (fixture PR-063). */
const ISI_CV = {
  headline: "Kasir dan staf administrasi 🤟",
  summary:
    "Saya kasir berpengalaman dua tahun yang teliti menghitung uang. Saya juga belajar aksara 漢字 untuk melayani pembeli.",
  contact: {
    email: "uji.verifikasi@contoh.id",
    phone: "+6281234500001",
    city: "Bandung",
    province: "Jawa Barat",
    links: [{ label: "Portofolio", url: "https://contoh.id/portofolio" }],
  },
  experiences: [
    {
      title: "Kasir",
      company: "Toko Roti Maju",
      startDate: "2022-01-01",
      endDate: "2024-01-01",
      description: "Melayani pembeli, menghitung uang di akhir hari, dan menata etalase.",
    },
    {
      title: "Staf Administrasi",
      company: "Koperasi Sejahtera",
      startDate: "2024-02-01",
      endDate: null,
      description: "Mencatat transaksi harian dan menyusun laporan bulanan.",
    },
  ],
  educations: [
    { institution: "SMK Negeri 4 Bandung", degree: "SMK", field: "Akuntansi", year: 2021 },
  ],
  skills: [
    { name: "Melayani pembeli", level: "Mahir" },
    { name: "Microsoft Excel", level: null },
  ],
  certifications: [{ name: "Pelatihan Kasir Digital", issuer: "BLK Bandung", year: 2022 }],
  organizations: [
    {
      name: "Komunitas Tuli Bandung",
      role: "Relawan",
      startDate: "2023-01-01",
      endDate: null,
      description: "Membantu acara bulanan komunitas.",
    },
  ],
};

let nvda: SesiNvda | null = null;
const laporan: Record<string, unknown> = {};

test.beforeAll(async () => {
  if (PAKAI_NVDA) nvda = await nyalakanNvda();
});

test.afterAll(() => {
  nvda?.hentikan();
  writeFileSync(
    process.env.VERIFIKASI_LAPORAN ?? "laporan-pdf.json",
    JSON.stringify(laporan, null, 2),
  );
});

function teksUcapan(mentah: string): string {
  return [...mentah.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => m[1])
    .join(" ")
    .trim();
}

test("jalur PDF penuh lewat UI + urutan baca NVDA", async ({ page, context }) => {
  test.setTimeout(300_000);
  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { accessToken: TOKEN, expiresIn: 900 } }),
    }),
  );

  // CV lengkap dibuat lewat API yang SAMA dengan yang dipakai editor.
  const buat = await page.request.post("/api/v1/me/resumes", {
    headers: { authorization: `Bearer ${TOKEN}` },
    data: { title: "CV Verifikasi PDF", content: ISI_CV },
  });
  expect(buat.status()).toBe(201);
  const { data: cv } = (await buat.json()) as { data: { id: string } };
  laporan["cvId"] = cv.id;

  // --- 1. Jalur utuh lewat UI (PR-064) ---------------------------------------
  await page.goto(`/cv/${cv.id}`);
  const lewati = page.getByRole("button", { name: /^Lewati/ });
  if (
    await lewati
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await lewati.first().click();
    await page.goto(`/cv/${cv.id}`);
  }
  await page.getByRole("button", { name: "Siapkan PDF" }).click();
  const t0 = Date.now();
  await expect(page.getByText("PDF siap diunduh.")).toBeVisible({ timeout: 180_000 });
  laporan["1.detikSampaiPdfSiap"] = (Date.now() - t0) / 1000;

  const [unduhan] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.getByRole("button", { name: "Unduh PDF" }).click(),
  ]);
  await unduhan.saveAs(BERKAS_PDF);
  const bait = readFileSync(BERKAS_PDF);
  laporan["1.ukuranPdf"] = bait.length;
  laporan["1.tandaPdf"] = bait.subarray(0, 5).toString("latin1");
  expect(laporan["1.tandaPdf"]).toBe("%PDF-");

  await page.goto("/notifikasi");
  await expect(page.getByText("PDF CV Anda siap").first()).toBeVisible({ timeout: 30_000 });
  laporan["1.notifikasiTerlihat"] = true;

  // --- 2. NVDA membaca PDF di penampil Chrome (PR-063, pengganti Adobe) -------
  if (nvda !== null) {
    const sesi = nvda;
    const penampil = await context.newPage();
    await penampil.goto(pathToFileURL(BERKAS_PDF).href);
    await penampil.bringToFront();
    await penampil.waitForTimeout(4_000);
    // Klik ke badan dokumen supaya fokus OS berada di konten PDF, bukan toolbar.
    const ukuran = penampil.viewportSize() ?? { width: 1280, height: 720 };
    await penampil.mouse.click(ukuran.width / 2, ukuran.height / 2);
    await penampil.waitForTimeout(1_500);

    /** Perintah NVDA tingkat OS; catat ucapan sesudahnya. */
    const perintah = async (nama: string, tombol: string, kali: number) => {
      const hasil: string[] = [];
      for (let i = 0; i < kali; i += 1) {
        const tanda = sesi.ucapan().length;
        // Hanya ke jendela Chrome uji yang membuka PDF ini — lihat penjaga di nvda.ts.
        tekanTombolOs(tombol, "CV Verifikasi PDF - Google Chrome for Testing");
        await penampil.waitForTimeout(900);
        hasil.push(
          sesi
            .ucapan()
            .slice(tanda)
            .map(teksUcapan)
            .filter((u) => u !== "")
            .join(" | "),
        );
      }
      laporan[nama] = hasil;
    };
    await perintah("2.keAwal(Ctrl+Home)", "^{HOME}", 1);
    await perintah("2.barisDemiBaris(panahBawah)", "{DOWN}", 35);
    await perintah("2.keAwalLagi", "^{HOME}", 1);
    await perintah("2.headingDemiHeading(h)", "h", 12);
    await perintah("2.keAwalLagi2", "^{HOME}", 1);
    await perintah("2.tautan(k)", "k", 4);
  }
});
