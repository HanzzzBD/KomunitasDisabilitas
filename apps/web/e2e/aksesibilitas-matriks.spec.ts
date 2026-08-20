// Matriks kombinasi preferensi (PR-036) — AC-2: "8 kombinasi utama lolos axe".
//
// KENAPA DELAPAN, DAN DELAPAN YANG MANA. Tujuh preferensi menghasilkan jauh
// lebih dari delapan kombinasi; yang dipilih adalah 2³ atas tiga preferensi
// yang benar-benar MENGUBAH YANG DIRENDER:
//
//   highContrast   → menukar warna (`data-contrast="high"`) — satu-satunya
//                    yang bisa melanggar kontras minimum.
//   reduceMotion   → mematikan transisi (`data-motion="reduced"`) — mengubah
//                    nilai warna yang terbaca axe saat transisi masih berjalan.
//   simpleLanguage → MENGGANTI SELURUH TEKS (`id-simple`). Kalimat yang lebih
//                    panjang membungkus berbeda, dan nama aksesibel setiap
//                    kendali ikut berubah.
//
// Tiga sisanya sengaja DI LUAR matriks, dan itu keputusan yang perlu ditulis:
// `largeTouchTargets` hanya membesarkan target (tidak bisa melanggar ambang
// yang sudah dipenuhi ukuran normal), sementara `prefersSignLanguage` dan
// `screenReaderHint` tidak punya token sama sekali (`TANPA_TOKEN`, PR-026b) —
// memasukkannya berarti menjalankan axe delapan kali atas halaman yang identik
// dan menyebut hasilnya cakupan. `textScale` diuji terpisah di titik ekstremnya
// (`kontras-skala.spec.ts`), sebab yang berbahaya adalah nilai maksimumnya,
// bukan kombinasinya.
//
// DIBATASI PADA HALAMAN PANEL, bukan seluruh registry `halaman.ts`. Delapan kali
// seluruh registry berarti melipatgandakan durasi gerbang untuk memeriksa
// halaman yang tidak punya satu pun kendali preferensi.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { AxeResults } from "axe-core";
import { buatAkunPalsu, tanamPreferensiLokal } from "./preferensi-akun.js";
import { tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const PANEL = "/pengaturan/aksesibilitas";

interface Kombinasi {
  highContrast: boolean;
  reduceMotion: boolean;
  simpleLanguage: boolean;
}

/** 2³ ditulis sebagai perkalian, bukan delapan baris tangan yang bisa keliru. */
const MATRIKS: Kombinasi[] = [false, true].flatMap((highContrast) =>
  [false, true].flatMap((reduceMotion) =>
    [false, true].map((simpleLanguage) => ({ highContrast, reduceMotion, simpleLanguage })),
  ),
);

function nama(k: Kombinasi): string {
  const nyala = Object.entries(k)
    .filter(([, v]) => v)
    .map(([n]) => n);
  return nyala.length === 0 ? "semua mati" : nyala.join(" + ");
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

async function siapkan(page: Page, k: Kombinasi): Promise<void> {
  // DUA SUMBER DISETEL SEKALIGUS, dan itu bukan berlebihan: penyimpanan lokal
  // membuat skrip pra-paint menggambar kombinasinya sebelum React ada, dan
  // jawaban akun menahan `SambungkanServer` dari menimpanya beberapa milidetik
  // kemudian. Menyetel salah satu saja berarti halaman berpindah keadaan di
  // tengah pemeriksaan.
  await tanamPreferensiLokal(page, k);
  await buatAkunPalsu(k).pasang(page);

  await page.goto(PANEL);
  await page.waitForSelector("h1");
}

for (const kombinasi of MATRIKS) {
  test(`a11y matriks: ${nama(kombinasi)}`, async ({ page }) => {
    await siapkan(page, kombinasi);

    // PENJAGA TERHADAP MATRIKS YANG HAMPA. Bila bentuk penyimpanan berubah,
    // kedelapan kombinasi menjadi halaman yang sama persis — dan gerbangnya
    // tetap hijau sambil memeriksa satu keadaan delapan kali.
    const html = page.locator("html");
    if (kombinasi.highContrast) await expect(html).toHaveAttribute("data-contrast", "high");
    else await expect(html).not.toHaveAttribute("data-contrast", "high");
    if (kombinasi.reduceMotion) await expect(html).toHaveAttribute("data-motion", "reduced");
    else await expect(html).not.toHaveAttribute("data-motion", "reduced");
    if (kombinasi.simpleLanguage) await expect(html).toHaveAttribute("data-lang-mode", "simple");
    else await expect(html).not.toHaveAttribute("data-lang-mode", "simple");

    await tungguGayaTenang(page);

    const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
    expect(hasil.violations, `\n${laporkan(hasil)}\n`).toEqual([]);
  });
}

test("matriks ini benar-benar delapan kombinasi berbeda", async () => {
  // Penjaga atas daftarnya sendiri. Perkalian yang salah tulis menghasilkan
  // delapan entri kembar tanpa satu pun test merah.
  expect(MATRIKS).toHaveLength(8);
  expect(new Set(MATRIKS.map((k) => JSON.stringify(k))).size).toBe(8);
});
