// Notification center di peramban SUNGGUHAN (PR-050) — AC-1, AC-3, AC-5.
//
// KENAPA TIDAK CUKUP DI JSDOM. Tiga hal di halaman ini hanya benar-benar ada di
// peramban:
//
//   1. TAB melewati elemen dalam urutan DOM yang sesungguhnya — jsdom
//      mensimulasikannya lewat `userEvent`, bukan menjalankannya.
//   2. Lencana di kerangka aplikasi dan daftar di `<main>` adalah dua pohon
//      React yang berbagi satu cache; kedipan atau angka yang tidak ikut turun
//      hanya terlihat saat keduanya dirender bersama pada satu dokumen nyata.
//   3. Navigasi lewat tautan lencana adalah pemuatan route LAZY — chunk-nya
//      benar-benar diunduh, dan katalog i18n-nya benar-benar dimuat. Rute yang
//      lupa menyebut katalognya lolos jsdom (setup men-seed semuanya) dan
//      hanya gagal di sini.
import { expect, test } from "@playwright/test";
import { HALAMAN } from "./halaman.js";
import { harusTidakBerpindah, palsukanApi } from "./palsukan-api.js";

const CENTER = HALAMAN.find((h) => h.jalur === "/notifikasi");

test.beforeEach(async ({ page }) => {
  // Entri registry dipakai apa adanya, bukan disalin: bila `butuhSesi` hilang
  // dari sana, test ini ikut jatuh alih-alih diam-diam menguji halaman masuk.
  expect(CENTER, "entri registry /notifikasi hilang").toBeDefined();
  await palsukanApi(page, CENTER);
});

test("terima → baca: tanda dan lencana turun bersama", async ({ page }) => {
  await page.goto("/notifikasi");
  await harusTidakBerpindah(page, CENTER!);

  // Lencananya menyebut jumlahnya sebagai kalimat utuh — itulah yang dibacakan
  // screen reader, dan itulah yang diperiksa di sini.
  await expect(page.getByRole("link", { name: "Notifikasi, 1 belum dibaca" })).toBeVisible();
  const item = page.getByRole("listitem").first();
  await expect(item.getByText("Belum dibaca")).toBeVisible();

  await page.getByRole("button", { name: /^Tandai dibaca:/ }).click();

  await expect(item.getByText("Belum dibaca")).toHaveCount(0);
  // Lencana ikut turun TANPA muat ulang (AC-1): angkanya datang dari jawaban
  // server yang ditulis langsung ke cache, bukan dari pembacaan kedua.
  await expect(page.getByRole("link", { name: "Notifikasi" })).toBeVisible();
});

test("seluruh halaman bisa ditempuh dengan keyboard saja (AC-5)", async ({ page }) => {
  await page.goto("/notifikasi");
  await harusTidakBerpindah(page, CENTER!);
  await expect(page.getByRole("button", { name: /^Tandai dibaca:/ })).toBeVisible();

  const terjangkau: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("Tab");
    terjangkau.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el === null ? "" : (el.getAttribute("aria-label") ?? (el.textContent ?? ""));
      }),
    );
  }

  expect(terjangkau).toContain("Semua");
  expect(terjangkau).toContain("Tandai semua dibaca");
  expect(terjangkau.some((n) => n.startsWith("Tandai dibaca:"))).toBe(true);
});

test("lencana mengantar ke center, dan katalognya ikut termuat", async ({ page }) => {
  // Rute lazy yang lupa menyebut katalog i18n-nya akan menampilkan KUNCI
  // mentahnya di sini — kegagalan yang tidak pernah muncul di jsdom.
  await page.goto("/pengaturan");
  await page.getByRole("link", { name: /^Notifikasi/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Notifikasi" })).toBeVisible();
  await expect(page.getByText("notifikasi.judul")).toHaveCount(0);
});

test("tandai semua: satu permintaan, lencana kosong sesudahnya", async ({ page }) => {
  const permintaan: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/me/notifications")) permintaan.push(`${r.method()} ${r.url()}`);
  });

  await page.goto("/notifikasi");
  await harusTidakBerpindah(page, CENTER!);
  await expect(page.getByRole("button", { name: "Tandai semua dibaca" })).toBeEnabled();

  await page.getByRole("button", { name: "Tandai semua dibaca" }).click();

  await expect(page.getByRole("link", { name: "Notifikasi" })).toBeVisible();
  // SATU permintaan tandai-semua, dan TIDAK ada tandai-satu di sampingnya:
  // perulangan di klien hanya akan menandai halaman yang sudah diunduh.
  expect(permintaan.filter((p) => p.includes("read-all"))).toHaveLength(1);
  expect(permintaan.filter((p) => /\/read$/.test(p))).toHaveLength(0);
});
