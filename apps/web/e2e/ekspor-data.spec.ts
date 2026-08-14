// Unduhan ekspor data di peramban SUNGGUHAN (PR-033b) — AC PR-033 nomor 1.
//
// KENAPA TIDAK CUKUP DI JSDOM. jsdom tidak mengunduh apa pun: ia tidak punya
// Blob URL, dan `HTMLAnchorElement.click()` di sana tidak memicu unduhan. Test
// jsdom karena itu terpaksa MENYADAP klik-nya, sehingga yang terbukti di sana
// hanyalah "nama dan isi yang benar diserahkan ke tautan" — bukan "sebuah
// berkas benar-benar turun".
//
// Selisih antara keduanya bukan teori. Tautan yang tidak pernah masuk dokumen,
// URL objek yang dilepas terlalu cepat, atau atribut `download` yang hilang
// semuanya lolos jsdom dengan mulus dan gagal DIAM-DIAM di peramban: tombolnya
// ditekan, tidak terjadi apa-apa, dan tidak ada satu pun pesan galat.
import { expect, test } from "@playwright/test";
import { HALAMAN } from "./halaman.js";
import { harusTidakBerpindah, palsukanApi } from "./palsukan-api.js";

const PENGATURAN = HALAMAN.find((h) => h.jalur === "/pengaturan");

test("ekspor menurunkan berkas JSON yang benar", async ({ page }) => {
  // Entri registry dipakai apa adanya, bukan disalin: bila `butuhSesi` hilang
  // dari sana, test ini ikut jatuh alih-alih diam-diam menguji halaman masuk.
  expect(PENGATURAN, "entri registry /pengaturan hilang").toBeDefined();
  await palsukanApi(page, PENGATURAN);
  await page.goto("/pengaturan");
  await harusTidakBerpindah(page, PENGATURAN!);

  const [unduhan] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Unduh data saya" }).click(),
  ]);

  // Nama berkas bertanggal WIB: `exportedAt` uji adalah 15 Januari pukul 20.00
  // UTC, yang di Indonesia sudah tanggal 16.
  expect(unduhan.suggestedFilename()).toBe("nawasena-data-saya-2026-01-16.json");

  const berkas = await unduhan.createReadStream();
  const potongan: Buffer[] = [];
  for await (const bagian of berkas) potongan.push(Buffer.from(bagian as Buffer));
  const isi: unknown = JSON.parse(Buffer.concat(potongan).toString("utf8"));

  // Yang diunduh benar-benar bisa diparse ulang — itulah seluruh guna hak
  // portabilitas: berkasnya harus bisa dibaca alat lain, bukan hanya turun.
  expect(isi).toMatchObject({ formatVersion: 1, account: { fullName: "Rina Pratiwi" } });
});

test("keberhasilan diumumkan, bukan hanya terjadi", async ({ page }) => {
  // Unduhan tidak mengubah apa pun di halaman. Tanpa pengumuman ini, pengguna
  // screen reader menekan tombol lalu tidak mendengar apa pun sama sekali.
  await palsukanApi(page, PENGATURAN);
  await page.goto("/pengaturan");

  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Unduh data saya" }).click(),
  ]);

  await expect(page.getByText(/nawasena-data-saya-2026-01-16\.json/)).toBeVisible();
});

test("tombolnya bisa ditekan sepenuhnya dengan keyboard", async ({ page }) => {
  // AC PR-033 nomor 4, diperiksa di tempat yang bisa membuktikannya: fokus
  // sungguhan pada tata letak sungguhan.
  await palsukanApi(page, PENGATURAN);
  await page.goto("/pengaturan");
  await page.bringToFront();

  const tombol = page.getByRole("button", { name: "Unduh data saya" });
  await tombol.focus();

  const [unduhan] = await Promise.all([
    page.waitForEvent("download"),
    page.keyboard.press("Enter"),
  ]);
  expect(unduhan.suggestedFilename()).toContain("nawasena-data-saya");

  // Fokus TETAP di tombolnya. `disabled` saat sibuk akan melemparnya ke awal
  // dokumen — pengguna keyboard terdampar tepat setelah aksinya berhasil.
  await expect(tombol).toBeFocused();
});
