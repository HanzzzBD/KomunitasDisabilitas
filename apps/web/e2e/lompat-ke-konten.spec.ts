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
import { harusTidakBerpindah, palsukanApi } from "./palsukan-api.js";

/** Halaman yang memakai kerangka aplikasi (layar kesalahan menggantikannya). */
const BERKERANGKA = HALAMAN.filter((h) => h.nama !== "404" && h.siapkan === undefined);

for (const halaman of BERKERANGKA) {
  test(`lompat ke konten: ${halaman.nama}`, async ({ page }) => {
    // Sesi dipalsukan dengan aturan yang SAMA seperti gerbang axe (PR-033a).
    // Tanpa itu, halaman terlindungi mengalihkan ke `/masuk` — yang juga punya
    // tautan lompat, sehingga test ini lulus sambil memeriksa halaman lain.
    await palsukanApi(page, halaman);
    await page.goto(halaman.jalur);

    // Menunggu halamannya terbentuk SEKALIGUS memastikan alamatnya tidak
    // berpindah. Tab yang ditekan pada dokumen SPA yang masih kosong tidak
    // mendarat di mana pun, dan fokusnya tidak menyusul sendiri sesudah isinya
    // muncul — kegagalannya lalu tampak seperti tautan lompat yang hilang
    // padahal ia ada di DOM. Halaman terlindungi paling rentan: ia menunggu
    // pemulihan sesi lebih dulu, jadi ia yang pertama gagal begitu mesinnya
    // sibuk (mis. Playwright berjalan paralel di CI).
    await harusTidakBerpindah(page, halaman);

    // Halaman ini juga harus memegang fokus sebelum Tab ditekan.
    // Beberapa halaman berjalan dalam peramban yang sama, dan halaman yang
    // tidak di depan menerima penekanan tombol tanpa punya elemen terfokus —
    // `:focus` kosong, dan kegagalannya tampak seperti tautan lompat yang
    // hilang padahal ia ada di DOM.
    await page.bringToFront();

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
