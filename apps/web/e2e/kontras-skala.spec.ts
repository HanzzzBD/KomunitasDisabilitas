// Kontras tinggi + skala teks 200% (PR-036) — AC-3: "tata letak inti tidak
// rusak pada perbesaran ekstrem".
//
// DIPISAH DARI MATRIKS 2³ dengan sengaja. Yang berbahaya pada `textScale` bukan
// kombinasinya dengan sakelar lain melainkan NILAI MAKSIMUMNYA: pada 200% tiap
// kotak teks menjadi dua kali lebih tinggi dan lebar, dan yang pecah adalah
// tata letak — bukan warna. Menjadikannya dimensi kesembilan pada matriks
// berarti enam belas pemeriksaan yang lima belas di antaranya mengulang hal
// yang sama.
//
// VIEWPORT DIKECILKAN, bukan `deviceScaleFactor` yang dinaikkan. Perbesaran
// peramban 200% pada jendela 1280px MENYISAKAN 640 CSS px — itulah yang berubah
// bagi tata letak. `deviceScaleFactor` hanya memperbesar piksel: jumlah CSS
// px-nya tidak berubah sama sekali, sehingga tata letaknya juga tidak, dan
// pemeriksaan yang memakainya tidak menguji apa pun.
//
// 640px, BUKAN 320px, dan angkanya dipilih dengan sadar. 320 adalah ambang WCAG
// 1.4.10 (Reflow) — tetapi ambang itu mengandaikan teks berukuran NORMAL pada
// perbesaran 400%. Menumpuknya dengan `textScale: 200` berarti menuntut sekitar
// 800%, lebih ketat daripada kriteria mana pun, dan yang pertama patah di sana
// adalah kata "Pengaturan" pada `<h1>` kerangka pengaturan (PR-033a) — bukan
// panel ini. Gerbang yang menuntut lebih dari spesifikasinya akan dimatikan
// orang, bukan dipenuhi.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buatAkunPalsu, tanamPreferensiLokal } from "./preferensi-akun.js";
import { tungguGayaTenang } from "./palsukan-api.js";

const TAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const EKSTREM = { textScale: 200, highContrast: true } as const;

test("panel tetap terpakai pada skala 200% + kontras tinggi", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 512 });
  await tanamPreferensiLokal(page, EKSTREM);
  await buatAkunPalsu(EKSTREM).pasang(page);

  await page.goto("/pengaturan/aksesibilitas");
  await page.waitForSelector("h1");
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");

  await tungguGayaTenang(page);

  // 1. TIDAK ADA GULIR MENDATAR (WCAG 1.4.10). Inilah kegagalan paling umum
  //    pada perbesaran ekstrem, dan ia tidak terlihat sama sekali di lebar
  //    layar pengembang.
  const meluber = await page.evaluate(() => {
    const el = document.documentElement;
    // Toleransi 1px: pembulatan sub-piksel peramban rutin menghasilkan selisih
    // satu piksel yang tidak pernah terlihat maupun bisa digulir pengguna.
    return el.scrollWidth - el.clientWidth > 1;
  });
  expect(meluber, "halaman menuntut gulir mendatar pada skala 200%").toBe(false);

  // 2. TEKSNYA MEMANG IKUT MEMBESAR. Tanpa ini, test di atas lulus paling mudah
  //    justru ketika skalanya tidak berlaku sama sekali.
  const tinggiFont = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.body).fontSize),
  );
  expect(tinggiFont).toBeGreaterThan(0);
  const skala = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim(),
  );
  expect(skala).toBe("2");

  // 3. KENDALINYA MASIH BISA DIKENAI — bukan sekadar ada di DOM. Elemen yang
  //    tertutup elemen lain akibat pembesaran gagal di sini, dan hanya di sini.
  const saklar = page.getByRole("checkbox", { name: "Kontras tinggi" });
  await expect(saklar).toBeVisible();
  await saklar.click();
  await expect(saklar).not.toBeChecked();

  const tombol = page.getByRole("button", { name: "Kembalikan ke setelan bawaan" });
  await expect(tombol).toBeVisible();
  const kotak = await tombol.boundingBox();
  // Target sentuh WCAG 2.2 §2.5.8 tetap dipenuhi setelah teksnya membesar —
  // pembesaran yang membuat tombol melebar tetapi memendek adalah regresi.
  expect(kotak?.height ?? 0).toBeGreaterThanOrEqual(44);

  // 4. Dan seluruhnya tetap lolos axe pada keadaan itu.
  const hasil = await new AxeBuilder({ page }).withTags(TAG).analyze();
  expect(
    hasil.violations.map((v) => `${v.id}: ${v.help}`),
    "pelanggaran axe pada skala 200% + kontras tinggi",
  ).toEqual([]);
});
