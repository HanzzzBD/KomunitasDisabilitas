// Kegagalan API → satu kalimat yang bisa dibaca DAN dibacakan.
//
// KENAPA DI `shared/` DAN BUKAN DI SALAH SATU FITUR. Uji folder ini satu
// kalimat (lihat README): berkas yang menyebut lowongan, lamaran, CV, atau
// pengguna bukan `shared`. Berkas ini tidak menyebut satu pun — ia hanya tahu
// bentuk amplop galat API. Sampai PR-033b ia memang tinggal di `features/auth`,
// dan itu benar saat itu: pemakainya cuma satu, jadi memindahkannya lebih awal
// hanyalah tebakan tentang pemakai kedua yang belum ada.
//
// SERVER SUDAH MENGIRIM BAHASA INDONESIA. `ERROR_CATALOG` (SDD §11) memuat
// `message` + `hint` yang ditulis untuk dibacakan apa adanya. Yang TIDAK bisa
// datang dari server hanyalah varian `id-simple` — itulah satu-satunya alasan
// sebuah kode perlu entri katalog di sisi klien.
import { ApiError } from "@nawasena/api-client";
import type { FungsiTeks, KunciTeks } from "./i18n/index.js";

/** Pemetaan kode galat → kunci katalog, disediakan tiap fitur untuk dirinya. */
export type PetaGalat = Readonly<Record<string, KunciTeks>>;

/**
 * Kalimat untuk ditampilkan DAN diumumkan.
 *
 * Tidak pernah mengembalikan string kosong: kolom bermasalah yang pesannya
 * kosong menampilkan garis merah tanpa keterangan — pengguna yang melihatnya
 * tahu ada yang salah tetapi tidak tahu apa, dan pengguna screen reader tidak
 * tahu apa pun. Karena itu ada dua lapis cadangan.
 *
 * `peta` sengaja diminta per pemanggil, bukan disatukan menjadi satu daftar
 * besar di sini. Kode yang sama berarti hal yang berbeda di tempat berbeda:
 * `TERLALU_BANYAK_PERMINTAAN` saat masuk berarti "terlalu sering mencoba kode",
 * saat mengunduh data berarti "jatah unduhan hari ini habis". Satu daftar
 * bersama memaksa salah satunya memakai kalimat yang salah.
 */
export function pesanGalatApi(galat: unknown, t: FungsiTeks, peta: PetaGalat): string {
  if (galat instanceof ApiError) {
    const kunci = peta[galat.code];
    if (kunci !== undefined) return t(kunci);

    // Pesan server, lengkap dengan sarannya. `hint` ikut karena di sanalah
    // "apa yang harus saya lakukan" berada — bagian yang paling berguna dan
    // paling sering dibuang saat hanya `message` yang ditampilkan.
    return galat.hint === undefined ? galat.message : `${galat.message} ${galat.hint}`;
  }

  // Bukan ApiError sama sekali (bug klien, TypeError, apa pun). Pengguna tidak
  // bisa berbuat apa-apa dengan detail teknisnya, dan menampilkannya justru
  // berisiko membocorkan isi permintaan.
  return t("shell.galat.jaringan");
}
