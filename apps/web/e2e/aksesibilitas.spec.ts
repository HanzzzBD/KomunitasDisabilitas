// Gerbang aksesibilitas LAPIS KETIGA — axe atas halaman nyata di peramban
// nyata (PR-031b). AC PR-031 nomor 3, dan penutup `TAK_BISA_DI_JSDOM`.
//
// APA YANG BARU BISA DIPERIKSA DI SINI, dan tidak di lapis mana pun sebelumnya:
//
//   `color-contrast`  — butuh warna hasil kaskade CSS sungguhan. jsdom tidak
//                       punya kaskade, jadi teks putih di atas latar putih
//                       LOLOS lapis kedua (dibuktikan test di PR-031a).
//   `target-size`     — butuh tata letak. Inilah yang akhirnya mengukur klaim
//                       "≥ 44px" dari PR-027 dalam piksel, bukan dalam kelas.
//   `scrollable-region-focusable` — butuh tahu apa yang benar-benar menggulir.
//
// Diuji atas HASIL BUILD (lihat `webServer` di playwright.config.ts), bukan
// server dev: kelas Tailwind yang hilang dari produksi karena tidak ikut
// terpindai justru tampak baik-baik saja di server dev.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { AxeResults } from "axe-core";
import { HALAMAN } from "./halaman.js";

/**
 * Aturan yang dijalankan: seluruh WCAG 2.2 A + AA.
 *
 * Ditulis eksplisit, bukan dibiarkan memakai bawaan axe, supaya naiknya versi
 * axe tidak diam-diam MENAMBAH atau MENGURANGI cakupan gerbang tanpa ada satu
 * baris pun berubah di repo ini.
 */
const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Jaringan DIPALSUKAN, dan itu keputusan — bukan jalan pintas.
 *
 * Gerbang ini memeriksa TAMPILAN, bukan integrasi. Menggantungkannya pada API
 * yang berjalan berarti: pipeline butuh Postgres + Redis + worker hanya untuk
 * memeriksa kontras warna; kegagalan jaringan terbaca sebagai pelanggaran
 * aksesibilitas; dan keadaan halaman ikut berubah-ubah mengikuti isi basis
 * data. Gerbang yang kadang merah karena sebab lain akan diabaikan orang, dan
 * gerbang yang diabaikan tidak menjaga apa pun.
 *
 * Jawabannya sengaja MINIMAL — hanya yang membuat halaman mencapai keadaan
 * yang ingin diperiksa.
 */
async function palsukanApi(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const jalur = new URL(route.request().url()).pathname;

    // Pengunjung halaman masuk memang belum punya sesi.
    if (jalur.endsWith("/auth/refresh")) {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "SESI_TIDAK_VALID", message: "Sesi Anda sudah berakhir" }),
      });
    }
    if (jalur.endsWith("/auth/otp/request")) {
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ data: { retryAfterSeconds: 0 } }),
      });
    }
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "BELUM_SIAP", message: "Belum tersedia" }),
    });
  });
}

function laporkan(hasil: AxeResults): string {
  return hasil.violations
    .map((v) => {
      const simpul = v.nodes
        .map((n) => `      ${n.target.join(" ")}\n        ${n.failureSummary ?? ""}`.trimEnd())
        .join("\n");
      return `  [${v.id}] ${v.help}\n    dampak: ${v.impact ?? "?"}\n    rujukan: ${v.helpUrl}\n${simpul}`;
    })
    .join("\n\n");
}

async function periksa(
  page: Page,
  matikan: Readonly<Record<string, string>> = {},
): Promise<AxeResults> {
  let builder = new AxeBuilder({ page }).withTags(TAG);
  const dimatikan = Object.keys(matikan);
  if (dimatikan.length > 0) builder = builder.disableRules(dimatikan);
  return builder.analyze();
}

test.beforeEach(async ({ page }) => {
  await palsukanApi(page);
});

for (const halaman of HALAMAN) {
  test(`a11y: ${halaman.nama}`, async ({ page }) => {
    await page.goto(halaman.jalur);
    if (halaman.siapkan !== undefined) {
      await halaman.siapkan({
        fill: (sel, nilai) => page.fill(sel, nilai),
        click: (sel) => page.click(sel),
        waitForSelector: (sel) => page.waitForSelector(sel),
      });
    }

    const hasil = await periksa(page, halaman.matikan);
    expect(hasil.violations, `\n${laporkan(hasil)}\n`).toEqual([]);
  });
}

test("gerbang ini TIDAK lulus secara hampa", async ({ page }) => {
  // Seluruh nilai gerbang ini bergantung pada kemampuannya menjadi merah.
  // Cacat yang ditanam sengaja jenis yang HANYA bisa ditangkap di peramban:
  // kontras warna. Ia lolos lint DAN lolos lapis jsdom.
  await page.goto("/");
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.textContent = "Teks kontras rendah yang seharusnya tertangkap";
    p.style.color = "#eeeeee";
    p.style.backgroundColor = "#ffffff";
    document.body.append(p);
  });

  const hasil = await periksa(page);
  expect(hasil.violations.map((v) => v.id)).toContain("color-contrast");
});

test("utang TAK_BISA_DI_JSDOM benar-benar DIBAYAR, bukan dipindahkan", async ({ page }) => {
  // Penjaga terhadap gerbang yang tampak hijau karena aturannya tidak pernah
  // dijalankan. `TAK_BISA_DI_JSDOM` (PR-031a) menyebut tiga aturan sebagai
  // utang yang jatuh tempo di sini.
  //
  // Diuji LULUS, bukan sekadar "berjalan": aturan yang berakhir `incomplete`
  // (axe tidak bisa memutuskan) tidak menjaga apa pun, dan menghitungnya
  // sebagai keberhasilan persis mengulang kesalahan yang dihindari lapis
  // kedua. Inilah yang akhirnya mengukur klaim PR-027 — kontras 17,4:1 dan
  // target sentuh ≥ 44px — dalam piksel dan warna sungguhan, bukan dalam
  // nama kelas.
  await page.goto("/masuk");
  const hasil = await periksa(page);
  const lulus = new Set(hasil.passes.map((v) => v.id));

  expect(lulus, "kontras warna tidak diperiksa/tidak lulus di peramban").toContain(
    "color-contrast",
  );
  expect(lulus, "ukuran target sentuh tidak diperiksa/tidak lulus di peramban").toContain(
    "target-size",
  );
});
