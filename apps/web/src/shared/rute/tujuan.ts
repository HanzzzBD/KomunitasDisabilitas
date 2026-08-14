// Tujuan awal yang dibawa melewati halaman masuk — AC PR-030 nomor 5:
// "redirect ke login dengan kembali ke tujuan awal".
//
// Berkas ini kecil dan seluruhnya soal SATU hal: nilai `tujuan` datang dari
// URL, dan URL datang dari siapa saja. Alamat yang dikirim orang lain
// (`/masuk?tujuan=https://jahat.example`) akan mengirim pengguna ke situs asing
// TEPAT SETELAH ia berhasil masuk — yaitu pada saat ia paling percaya bahwa
// yang dilihatnya adalah aplikasi ini. Halaman tiruan di seberang sana tinggal
// meminta apa pun.
//
// Karena itu tujuan tidak pernah dipakai apa adanya; ia selalu melewati
// `bersihkanTujuan()`.

export const NAMA_PARAM = "tujuan";
const BAWAAN = "/";

/**
 * Loloskan HANYA jalur internal.
 *
 * Diterima: "/lamaran", "/lamaran?halaman=2#bagian".
 * Ditolak (jatuh ke "/"):
 *   - "https://jahat.example"  — punya skema;
 *   - "//jahat.example"        — protocol-relative; browser membacanya sebagai
 *                                host lain meski tidak ada skemanya. Ini bentuk
 *                                yang paling sering lolos dari pemeriksaan yang
 *                                hanya menuntut "diawali /";
 *   - "/\\jahat.example"       — sebagian browser memperlakukan "\" seperti "/";
 *   - "lamaran"                — relatif, maknanya bergantung halaman saat ini.
 */
export function bersihkanTujuan(mentah: string | null | undefined): string {
  if (mentah == null || mentah === "") return BAWAAN;
  if (!mentah.startsWith("/")) return BAWAAN;
  // Karakter kedua menentukan: "//" dan "/\" keduanya keluar dari situs ini.
  if (mentah.startsWith("//") || mentah.startsWith("/\\")) return BAWAAN;
  return mentah;
}

/** Rangkai jalur+query+hash yang sedang dibuka menjadi satu nilai `tujuan`. */
export function rangkaiTujuan(lokasi: {
  pathname: string;
  search?: string;
  hash?: string;
}): string {
  return `${lokasi.pathname}${lokasi.search ?? ""}${lokasi.hash ?? ""}`;
}

/**
 * Alamat halaman masuk yang mengingat tujuan awal.
 *
 * Tujuan yang sudah "/" tidak ikut ditulis: parameter yang tidak menambah
 * apa pun hanya membuat alamatnya panjang dan lebih sulit dibaca — termasuk
 * oleh pengguna screen reader yang mendengarkan URL-nya.
 */
export function tautanMasuk(lokasi: { pathname: string; search?: string; hash?: string }): string {
  const tujuan = rangkaiTujuan(lokasi);
  if (bersihkanTujuan(tujuan) === BAWAAN) return "/masuk";
  return `/masuk?${NAMA_PARAM}=${encodeURIComponent(tujuan)}`;
}

/** Baca tujuan dari query halaman masuk, sudah dibersihkan. */
export function bacaTujuan(search: string): string {
  return bersihkanTujuan(new URLSearchParams(search).get(NAMA_PARAM));
}
