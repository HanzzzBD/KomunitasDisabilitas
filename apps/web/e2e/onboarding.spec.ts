// Wizard onboarding aksesibilitas (PR-035) di peramban SUNGGUHAN — AC PR-035
// "E2E: alur lengkap + alur skip".
//
// APA YANG BARU BISA DIBUKTIKAN DI SINI, dan tidak di jsdom:
//
//   1. PENANDA SELESAI di `localStorage` MILIK ORIGIN. jsdom memakai satu
//      penyimpanan proses yang dibersihkan test lain; di sini penandanya
//      benar-benar melewati muat ulang halaman, dan `sub`-nya benar-benar
//      berasal dari token yang dijawab `/auth/refresh` — bukan dari `masuk()`
//      yang dipanggil test sendiri.
//   2. SEMANTIK `replace`. Riwayat peramban sungguhan adalah satu-satunya
//      tempat "tombol kembali tidak mengembalikan ke wizard" bisa diperiksa.
//      `router.state.historyAction` di jsdom memeriksa niat React Router;
//      di sini yang diperiksa adalah akibatnya.
//   3. LALU LINTAS JARINGAN SESUNGGUHNYA. AC-nya menuntut `PUT` terkirim pada
//      alur selesai dan TIDAK terkirim sama sekali pada alur lewati. Yang
//      dicegat di sini permintaan HTTP nyata, bukan pemanggilan fungsi klien.
//
// Warna, kontras, dan ukuran target sentuh TIDAK diperiksa di sini — keempat
// langkah wizard sudah terdaftar di `halaman.ts` dan dijaga
// `aksesibilitas.spec.ts` satu per satu.
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi } from "./palsukan-api.js";

/**
 * Id pengguna uji. Ia muncul di DUA tempat yang harus cocok: klaim `sub` pada
 * token yang dijawab `/auth/refresh`, dan kunci penanda di `localStorage`.
 * Ditulis sekali di sini justru supaya kecocokan itu tidak bisa lolos karena
 * kebetulan.
 */
const SUB = "01912345-89ab-7def-8123-456789abcdef";

/** Bentuk kunci penanda — dijaga `onboarding-identitas.test.ts` di sisi kode. */
const KUNCI_PENANDA = `nawasena-onboarding-selesai:${SUB}`;

/** Ketujuh field `AccessibilityPreferences` (packages/schemas). */
const FIELD = [
  "highContrast",
  "largeTouchTargets",
  "prefersSignLanguage",
  "reduceMotion",
  "screenReaderHint",
  "simpleLanguage",
  "textScale",
];

/**
 * Token TIGA SEGMEN dengan `sub` yang bisa dibaca.
 *
 * `palsukanApi` menjawab `/auth/refresh` dengan `"token-uji"` — cukup untuk
 * halaman terlindungi (kliennya tidak pernah membaca isinya), tetapi TIDAK
 * cukup di sini: `idPenggunaSaatIni()` mengembalikan `null` untuk token yang
 * bukan JWT, dan penanda selesai tidak akan pernah tertulis. Yang diuji berkas
 * ini justru penanda itu, jadi tokennya harus benar-benar berbentuk JWT.
 *
 * Tanda tangannya palsu dan itu tidak menjadi soal: klien memang tidak pernah
 * memverifikasinya (lihat catatan panjang di `features/onboarding/identitas.ts`).
 */
function tokenBerSub(): string {
  const payload = Buffer.from(JSON.stringify({ sub: SUB, role: "seeker", ver: 1 }), "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `header.${payload}.tanda-tangan-palsu`;
}

interface Permintaan {
  method: string;
  body: unknown;
}

/**
 * Memasang jawaban palsu + perekam permintaan preferensi.
 *
 * Urutannya penting: `page.route` yang didaftarkan BELAKANGAN diperiksa lebih
 * dulu oleh Playwright, jadi penimpaan `/auth/refresh` harus dipasang sesudah
 * `palsukanApi` — bukan sebelumnya.
 */
async function siapkan(page: Page): Promise<Permintaan[]> {
  await palsukanApi(page, { nama: "onboarding", jalur: "/onboarding", butuhSesi: true });

  await page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { accessToken: tokenBerSub(), expiresIn: 900 } }),
    }),
  );

  // DIREKAM DARI LAPIS PERAMBAN, bukan dari handler route: permintaan yang
  // dikirim ke alamat yang TIDAK punya handler pun tetap tercatat di sini.
  // Perekam yang hidup di dalam handler hanya bisa melihat yang sudah kita
  // duga — dan yang perlu dibuktikan alur "lewati" justru ketiadaannya.
  //
  // HANYA PENULISAN (`PUT`) yang dicatat, sejak PR-036. Aplikasi kini MEMBACA
  // preferensi akun (`GET`) begitu status sesi "masuk" menyala, di halaman mana
  // pun — termasuk saat wizard terbuka. Bacaan itu bukan perbuatan wizard, dan
  // yang dijaga berkas ini adalah apa yang wizard KIRIMKAN: `GET` tidak
  // membawa badan sama sekali, sehingga ia tidak bisa membawa jawaban ragam
  // disabilitas maupun persetujuan. Menghitungnya bersama `PUT` berarti klaim
  // "tidak ada yang dikirim" berubah menjadi "tidak ada yang menyentuh
  // jaringan" — pernyataan yang berbeda, dan bukan yang dituntut AC-nya.
  const preferensi: Permintaan[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/me/accessibility") && r.method() === "PUT") {
      preferensi.push({ method: r.method(), body: r.postDataJSON() as unknown });
    }
  });
  return preferensi;
}

async function bukaWizard(page: Page): Promise<void> {
  await page.goto("/onboarding");
  await page.waitForSelector("h1");
  await expect(page.getByRole("heading", { name: "Ragam disabilitas", level: 2 })).toBeVisible();
}

/** Satu langkah maju, ditunggu sampai judul langkah berikutnya benar-benar tampil. */
async function lanjutKe(page: Page, judul: string): Promise<void> {
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByRole("heading", { name: judul, level: 2 })).toBeVisible();
}

async function penanda(page: Page): Promise<string | null> {
  return page.evaluate((k) => globalThis.localStorage.getItem(k), KUNCI_PENANDA);
}

test("alur lengkap: preferensi tersimpan, penanda ditulis, mendarat di beranda", async ({
  page,
}) => {
  const preferensi = await siapkan(page);
  await bukaWizard(page);

  // Langkah 1 — ragam disabilitas DIPILIH dengan sengaja. Alur yang melewatinya
  // tidak akan pernah membuktikan bahwa data ini tidak ikut terkirim.
  await page.getByRole("checkbox", { name: "Tuli atau kurang dengar" }).check();
  await lanjutKe(page, "Persetujuan");

  // Langkah 2 — izin DIBERIKAN. Kasus yang lebih sulit: datanya ada DAN
  // diizinkan, dan ia tetap tidak boleh ke mana-mana (PR-037 belum ada).
  await page
    .getByRole("checkbox", { name: "Saya mengizinkan Nawasena memakai data ragam disabilitas" })
    .check();
  await lanjutKe(page, "Preferensi tampilan");

  // Langkah 3 — tiga preferensi disentuh, termasuk yang BUKAN saklar.
  // Penggeser digerakkan dari PAPAN KETIK: langkah 25 dari 100 → 150, dan
  // sekaligus satu bukti kecil bahwa kendali ini bisa dipakai tanpa tetikus.
  const geser = page.getByRole("slider");
  await geser.focus();
  await geser.press("ArrowRight");
  await geser.press("ArrowRight");
  await expect(geser).toHaveValue("150");

  await page.getByRole("checkbox", { name: "Kontras tinggi" }).check();
  await page.getByRole("checkbox", { name: "Tombol lebih besar" }).check();

  // Pratinjaunya sudah berlaku SEBELUM apa pun disimpan.
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  expect(preferensi, "ada permintaan terkirim padahal belum ada yang menekan simpan").toEqual([]);

  await lanjutKe(page, "Ringkasan");
  await page.getByRole("button", { name: "Simpan dan mulai" }).click();

  await page.waitForURL((url) => url.pathname === "/");

  // (a) Sisi server.
  expect(preferensi).toHaveLength(1);
  expect(preferensi[0]?.method).toBe("PUT");

  const badan = preferensi[0]?.body as Record<string, unknown>;
  // KETUJUH field, tidak lebih dan tidak kurang — `updateAccessibilityPreferencesSchema`
  // bersifat `.strict()`, dan field asing akan ditolak server dengan 400.
  expect(Object.keys(badan).sort()).toEqual(FIELD);
  expect(badan.textScale).toBe(150);
  expect(badan.highContrast).toBe(true);
  expect(badan.largeTouchTargets).toBe(true);
  // `reduceMotion` sengaja TIDAK dipatok nilainya: ia satu-satunya field yang
  // bisa datang dari sinyal OS mesin yang menjalankan gerbang ini
  // (`prefers-reduced-motion`). Nilai persisnya dijaga di lapis jsdom, tempat
  // sinyal OS-nya kita kendalikan sepenuhnya (`onboarding.test.tsx`).

  // Tidak satu pun jawaban langkah 1/2 ikut terkirim.
  expect(JSON.stringify(badan)).not.toMatch(/tuli|netra|daksa|autisme|setuju/i);

  // (b) Penanda selesai — bagian yang membuat wizard tidak muncul lagi.
  expect(await penanda(page)).toBe("1");
});

test("alur lewati: penanda tetap ditulis, dan TIDAK ada satu pun PENYIMPANAN preferensi", async ({
  page,
}) => {
  const preferensi = await siapkan(page);
  await bukaWizard(page);

  // Ditekan di langkah PERTAMA, tanpa menyentuh apa pun. Inilah bentuk paling
  // murni dari "bisa dilewati kapan saja".
  await page.getByRole("button", { name: "Lewati pengaturan ini" }).click();

  await page.waitForURL((url) => url.pathname === "/");

  expect(preferensi, "melewati wizard tetap menyimpan preferensi ke akun").toEqual([]);
  expect(await penanda(page)).toBe("1");
});

test("sesudah keluar, tombol kembali tidak mengembalikan ke wizard", async ({ page }) => {
  // `replace`, bukan push. Tanpa itu wizard tertinggal di riwayat: menekan
  // kembali mengembalikan pengguna ke layar yang barusan ia selesaikan, yang
  // kemudian melempar ia keluar lagi — terasa seperti tombol kembali yang rusak.
  await siapkan(page);
  await bukaWizard(page);

  await page.getByRole("button", { name: "Lewati pengaturan ini" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.goBack();

  expect(new URL(page.url()).pathname).not.toBe("/onboarding");
});

test("penanda yang sudah ada membuat beranda tidak mengalihkan ke wizard lagi", async ({
  page,
}) => {
  // Sisi lain dari penanda yang sama: yang ditulis kedua alur di atas memang
  // yang dibaca pemicu di `TataLetak`. Diperiksa lewat MUAT ULANG penuh, bukan
  // perpindahan route — itulah keadaan yang dialami pengguna esok harinya.
  await siapkan(page);
  await page.addInitScript(
    ([kunci]) => {
      localStorage.setItem(kunci, "1");
    },
    [KUNCI_PENANDA] as const,
  );

  await page.goto("/");
  await page.waitForSelector("h1");

  expect(new URL(page.url()).pathname).toBe("/");
});

test("pengguna tanpa penanda DIALIHKAN dari beranda — penjaga di atas tidak lulus secara hampa", async ({
  page,
}) => {
  // Tanpa test ini, keempat test sebelumnya tetap hijau seandainya pemicu
  // onboarding di `TataLetak` tidak pernah berjalan sama sekali.
  await siapkan(page);

  await page.goto("/");

  await page.waitForURL((url) => url.pathname === "/onboarding");
  await expect(page.getByRole("heading", { name: "Ragam disabilitas", level: 2 })).toBeVisible();
});
