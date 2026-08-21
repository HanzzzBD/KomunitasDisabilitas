// Profil karier di peramban SUNGGUHAN (PR-040) — AC nomor 1, 2, 3, dan 4.
//
// KENAPA TIDAK CUKUP DI JSDOM. Dua hal di halaman ini tidak bisa dibuktikan di
// sana sama sekali:
//
//   1. GERBANG VALIDASI NATIF. Kolom wajib menulis atribut `required`, dan
//      peramban SUNGGUHAN memblokir submit sambil menampilkan gelembungnya
//      sendiri — dalam bahasa peramban, tidak tersambung ke kolomnya, hilang
//      setelah beberapa detik. `noValidate` yang hilang membuat SELURUH pesan
//      galat berbahasa Indonesia kita tidak pernah berjalan. jsdom menegakkan
//      sebagian aturan itu, tetapi peramban sungguhan yang menentukan.
//   2. FOKUS DAN URUTAN TAB melintasi tiga bagian panjang. Kolom yang jatuh dari
//      urutan Tab tidak akan pernah tersentuh pengguna yang tidak memakai
//      tetikus — dan tidak meninggalkan satu pun gejala di test jsdom.
//
// Alur pencabutan consent diuji SAMPAI TUNTAS di sini, bukan hanya sampai
// dialognya terbuka: yang ingin dibuktikan adalah bahwa data disabilitas
// benar-benar hilang dari layar sesudahnya.
import { expect, test } from "@playwright/test";
import { HALAMAN } from "./halaman.js";
import { harusTidakBerpindah, palsukanApi } from "./palsukan-api.js";

const PROFIL = HALAMAN.find((h) => h.nama === "profil — belum ada consent");

test.beforeEach(async ({ page }) => {
  // Entri registry dipakai apa adanya, bukan disalin: bila `butuhSesi` hilang
  // dari sana, test ini ikut jatuh alih-alih diam-diam menguji halaman masuk.
  expect(PROFIL, "entri registry /profil hilang").toBeDefined();
  await palsukanApi(page, PROFIL);
});

test("mengisi data dasar lalu menyimpan bagiannya", async ({ page }) => {
  await page.goto("/profil");
  await harusTidakBerpindah(page, PROFIL!);

  const judul = page.getByLabel("Judul profil");
  await judul.fill("Admin data ramah pembaca layar");
  await page.getByLabel("Kota").fill("Bandung");

  const [permintaan] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().includes("/me/profile") && r.method() === "PUT",
    ),
    page.getByRole("button", { name: "Simpan bagian ini" }).click(),
  ]);

  expect(permintaan.postDataJSON()).toMatchObject({
    headline: "Admin data ramah pembaca layar",
    city: "Bandung",
  });
  await expect(page.getByText("Bagian Data dasar sudah disimpan.")).toBeAttached();
});

test("kolom disabilitas TIDAK ADA sebelum izin diberikan", async ({ page }) => {
  await page.goto("/profil");
  await harusTidakBerpindah(page, PROFIL!);

  await expect(page.getByRole("checkbox", { name: "Tuli atau kurang dengar" })).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Saya mengizinkan Nawasena menyimpan data disabilitas saya" }),
  ).not.toBeChecked();
});

test("memberi izin, mengisi data sensitif, lalu MENCABUTNYA sampai tuntas", async ({ page }) => {
  await page.goto("/profil");
  await harusTidakBerpindah(page, PROFIL!);

  // --- Memberi izin ---
  await page
    .getByRole("checkbox", { name: "Saya mengizinkan Nawasena menyimpan data disabilitas saya" })
    .check();
  await page.getByRole("checkbox", { name: "Tuli atau kurang dengar" }).check();
  await page.getByRole("checkbox", { name: "Juru bahasa isyarat" }).check();
  await page.getByLabel("Kebutuhan lain yang belum ada di daftar").fill("Perlu teks saat rapat");

  const bagianSensitif = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Disabilitas dan kebutuhan akomodasi" }) })
    .last();

  const [simpan] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/me/profile") && r.method() === "PUT"),
    bagianSensitif.getByRole("button", { name: "Simpan bagian ini" }).click(),
  ]);

  expect(simpan.postDataJSON()).toMatchObject({
    consentSensitive: true,
    disabilityTypes: ["tuli"],
    accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: "Perlu teks saat rapat" },
  });

  // Server uji menjawab dengan consent yang sudah berlaku, jadi layarnya kini
  // menawarkan pencabutan.
  await expect(page.getByText(/Anda memberi izin ini pada/)).toBeVisible();

  // --- Mencabutnya ---
  await page.getByRole("button", { name: "Tarik izin dan hapus data ini" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/akan dihapus/)).toBeVisible();

  const [cabut] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/me/profile") && r.method() === "PUT"),
    dialog.getByRole("button", { name: "Ya, hapus data saya" }).click(),
  ]);

  // TANPA satu pun data sensitif di badannya: skema menolak "cabut sambil
  // menyimpan", dan permintaan seperti itu paling mungkin lahir dari state
  // formulir yang belum dibersihkan.
  expect(cabut.postDataJSON()).toEqual({ consentSensitive: false });

  // Dan datanya benar-benar hilang dari layar — bukan sekadar permintaannya
  // terkirim.
  await expect(page.getByRole("checkbox", { name: "Tuli atau kurang dengar" })).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "Saya mengizinkan Nawasena menyimpan data disabilitas saya" }),
  ).not.toBeChecked();
});

test("menambah satu baris riwayat kerja", async ({ page }) => {
  await page.goto("/profil");
  await harusTidakBerpindah(page, PROFIL!);

  await page.getByRole("button", { name: "Tambah pengalaman kerja" }).click();
  const formulir = page.getByRole("form", { name: "Tambah pengalaman kerja" });
  await formulir.getByLabel("Nama posisi").fill("Kasir");
  await formulir.getByLabel("Mulai bekerja").fill("2020-01-15");

  const [permintaan] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/me/experiences") && r.method() === "POST"),
    formulir.getByRole("button", { name: "Simpan" }).click(),
  ]);

  expect(permintaan.postDataJSON()).toMatchObject({ title: "Kasir", startDate: "2020-01-15" });
});

test("kolom wajib yang kosong memunculkan pesan KITA, bukan gelembung peramban", async ({
  page,
}) => {
  // Inilah yang hanya bisa dibuktikan di peramban sungguhan. Tanpa `noValidate`
  // pada formulirnya, peramban memblokir submit dan menampilkan gelembung
  // bawaannya — dan pesan berbahasa Indonesia yang tersambung ke kolomnya tidak
  // pernah muncul sama sekali.
  await page.goto("/profil");
  await harusTidakBerpindah(page, PROFIL!);

  await page.getByRole("button", { name: "Tambah keahlian" }).click();
  const formulir = page.getByRole("form", { name: "Tambah keahlian" });
  await formulir.getByRole("button", { name: "Simpan" }).click();

  await expect(page.getByText("Nama keahlian tidak boleh kosong")).toBeVisible();
  await expect(formulir.getByLabel("Nama keahlian")).toHaveAttribute("aria-invalid", "true");
});

test("bagian sensitif dapat diisi sepenuhnya dengan keyboard", async ({ page }) => {
  await page.goto("/profil");
  await harusTidakBerpindah(page, PROFIL!);

  const consent = page.getByRole("checkbox", {
    name: "Saya mengizinkan Nawasena menyimpan data disabilitas saya",
  });
  await consent.focus();
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();

  const tuli = page.getByRole("checkbox", { name: "Tuli atau kurang dengar" });
  await tuli.focus();
  await page.keyboard.press("Space");
  await expect(tuli).toBeChecked();

  // Kolom yang baru muncul harus ikut masuk urutan Tab — kendali yang lahir
  // sesudah render pertama adalah yang paling sering terlewat.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
