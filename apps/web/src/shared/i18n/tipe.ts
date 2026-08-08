// Kontrak katalog i18n (SDD §4.3: "setiap string UI punya dua varian —
// `id`, `id-simple`").
//
// KEPUTUSAN PENTING: kelengkapan varian ditegakkan TIPE, bukan aturan lint.
// AC PR-029 menulis "key tanpa varian simple → lint warning terdaftar", dan
// `EntriTeks` di bawah membuatnya lebih keras daripada itu: varian yang hilang
// bukan peringatan melainkan `typecheck` MERAH. Aturan ESLint kustom untuk hal
// yang bisa dijamin tipe hanya menambah kode yang harus dirawat, dan
// peringatan yang bisa diabaikan bukan penjaga.

/**
 * Dua varian bahasa.
 *
 * `id-simple` BUKAN terjemahan — ia versi yang lebih mudah dipahami dari
 * kalimat yang sama: kalimat pendek, kata sehari-hari, satu gagasan per
 * kalimat. Ditujukan bagi pengguna autisme dan disabilitas kognitif (PRD
 * persona Dimas), dan berguna bagi semua orang yang sedang lelah atau terburu.
 */
export const MODE_BAHASA = ["id", "id-simple"] as const;

export type ModeBahasa = (typeof MODE_BAHASA)[number];

/** Satu string UI dalam kedua varian. Keduanya WAJIB — dijamin tipe. */
export type EntriTeks = {
  readonly [M in ModeBahasa]: string;
};

/**
 * Katalog satu fitur. Kuncinya ditulis lengkap ber-prefiks fitur
 * (`"shell.luring.judul"`), bukan dirakit otomatis dari nama berkas: kunci
 * yang bisa dicari dengan grep apa adanya jauh lebih murah dilacak daripada
 * kunci yang hanya ada setelah program berjalan.
 */
export type KatalogFitur = Readonly<Record<string, EntriTeks>>;

/** Nilai yang boleh disisipkan ke placeholder. Sengaja sempit — lihat interpolasi. */
export type ParamTeks = Readonly<Record<string, string | number>>;
