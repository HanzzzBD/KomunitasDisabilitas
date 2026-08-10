// Konfirmasi hapus akun sesudah kembali dari Google (PR-033c-2), di peramban
// SUNGGUHAN.
//
// KENAPA TIDAK CUKUP DI JSDOM. Seluruh premis layar ini bersifat peramban:
// pengguna baru saja meninggalkan aplikasi ini, singgah di situs lain, lalu
// kembali ke halaman yang dimuat DARI NOL. jsdom tidak pernah benar-benar
// melakukan pengalihan itu — test di sana merender komponen yang sama pada
// dokumen yang tidak pernah berpindah, sehingga yang terbukti adalah logikanya,
// bukan bahwa titipan selamat menyeberang dan halamannya terbentuk kembali.
//
// Ia juga satu-satunya lapis yang bisa mengukur kontras tombol perusak di sini
// (`TAK_BISA_DI_JSDOM`, PR-031a).
import { expect, test, type Page } from "@playwright/test";
import { palsukanApi, tungguGayaTenang } from "./palsukan-api.js";

const KUNCI = "nawasena-google-oauth";
const STATE = "state-uji-yang-panjang-dan-acak";

/**
 * Titipan ditulis LANGSUNG, bukan lewat `siapkanHapusAkunGoogle`.
 *
 * Fungsi itu berjalan di dalam halaman dan memakai `crypto.subtle`; memanggilnya
 * dari sini menuntut memuat halaman lebih dulu, padahal titipannya justru harus
 * sudah ada SEBELUM halaman kembalian dimuat. Bentuknya dijaga test jsdom
 * (`hapus-akun-google.test.tsx`), yang membuat titipannya lewat fungsi produksi
 * — jadi penyimpangan bentuk tetap tertangkap, hanya bukan di berkas ini.
 */
async function titipkanBekal(page: Page) {
  await page.addInitScript(
    ([kunci, state]) => {
      sessionStorage.setItem(
        kunci,
        JSON.stringify({
          verifier: "v".repeat(64),
          state,
          tujuan: "/",
          maksud: "hapus-akun",
        }),
      );
    },
    [KUNCI, STATE] as const,
  );
}

test("kembali dari Google tidak menghapus apa pun sampai dikonfirmasi", async ({ page }) => {
  await palsukanApi(page, { nama: "kembalian google", jalur: "/masuk/google", butuhSesi: true });
  await titipkanBekal(page);

  const permintaanHapus: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/auth/account")) permintaanHapus.push(r.method());
  });

  await page.goto(`/masuk/google?code=kode-dari-google&state=${STATE}`);
  await page.waitForSelector("h1");

  await expect(page.getByRole("heading", { name: /Konfirmasi terakhir/ })).toBeVisible();
  expect(permintaanHapus, "akun terhapus hanya karena halamannya dibuka").toEqual([]);

  await page.getByRole("button", { name: "Hapus akun saya sekarang" }).click();

  await expect(page.getByRole("heading", { name: "Akun Anda sudah dihapus" })).toBeVisible();
  expect(permintaanHapus).toEqual(["DELETE"]);
});

test("layar konfirmasi lolos axe, termasuk kontras tombol perusaknya", async ({ page }) => {
  // Diperiksa lewat modul axe yang sama dengan gerbang utama; halaman ini tidak
  // masuk registry karena ia menuntut titipan disemai sebelum dimuat — sesuatu
  // yang tidak bisa dinyatakan lewat `siapkan`.
  const { default: AxeBuilder } = await import("@axe-core/playwright");

  await palsukanApi(page, { nama: "kembalian google", jalur: "/masuk/google", butuhSesi: true });
  await titipkanBekal(page);
  await page.goto(`/masuk/google?code=kode-dari-google&state=${STATE}`);
  await page.waitForSelector("h1");
  await tungguGayaTenang(page);

  const hasil = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(hasil.violations.map((v) => v.id)).toEqual([]);
});
