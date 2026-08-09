// Tautan lompat ke konten (PR-032a) — diuji di peramban SUNGGUHAN.
//
// KENAPA TIDAK CUKUP DI JSDOM. Seluruh guna tautan lompat ada pada satu hal yang
// tidak bisa disimulasikan tanpa peramban: menekannya benar-benar MEMINDAHKAN
// FOKUS ke konten utama. jsdom tidak menjalankan navigasi fragmen sama sekali,
// jadi test jsdom hanya bisa memeriksa bahwa tautannya ada dan sasarannya ada —
// dan tautan lompat yang tidak melompat lolos pemeriksaan itu dengan mulus.
//
// Ia juga di sini karena inilah satu-satunya kegagalan aksesibilitas di berkas
// ini yang TIDAK dilihat axe: axe memeriksa struktur, bukan ke mana fokus pergi.
import { expect, test } from "@playwright/test";
import { HALAMAN } from "./halaman.js";

/** Halaman yang memakai kerangka aplikasi (layar kesalahan menggantikannya). */
const BERKERANGKA = HALAMAN.filter((h) => h.nama !== "404" && h.siapkan === undefined);

for (const halaman of BERKERANGKA) {
  test(`lompat ke konten: ${halaman.nama}`, async ({ page }) => {
    await page.goto(halaman.jalur);

    // Satu penekanan Tab dari keadaan awal. Bila tautan ini bukan yang pertama,
    // pengguna keyboard harus menyusuri apa pun yang mendahuluinya — dan itu
    // persis keadaan yang seharusnya dihapus tautan ini.
    await page.keyboard.press("Tab");

    const terfokus = page.locator(":focus");
    await expect(terfokus).toHaveText("Lompat ke konten utama");

    // Terlihat SETELAH difokus. Tautan yang tetap 1×1 piksel saat difokus tidak
    // bisa dilihat pengguna keyboard awas — ia menekan Tab, tidak melihat apa
    // pun berubah, dan menyimpulkan halaman ini tidak bisa dinavigasi.
    await expect(terfokus).toBeVisible();
    const kotak = await terfokus.boundingBox();
    expect(kotak?.height ?? 0).toBeGreaterThan(20);

    await page.keyboard.press("Enter");

    // INILAH pemeriksaan yang tidak bisa dilakukan di jsdom: setelah menekan
    // tautannya, fokus berada di konten utama — bukan sekadar gulirannya.
    await expect(page.locator("#konten-utama")).toBeFocused();
  });
}
