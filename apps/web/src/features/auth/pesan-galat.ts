// Kegagalan API → kalimat yang dibacakan ke pengguna.
//
// SERVER SUDAH MENGIRIM BAHASA INDONESIA. `ERROR_CATALOG` (SDD §11) memuat
// `message` + `hint` yang memang ditulis untuk dibacakan apa adanya, jadi
// berkas ini BUKAN penerjemah — ia hanya menambah apa yang tidak bisa datang
// dari server: varian `id-simple`.
//
// Karena itu pemetaannya sengaja PENDEK. Hanya kegagalan yang paling sering
// ditemui pengguna yang punya entri katalog; sisanya memakai pesan server.
// Memetakan semua kode berarti menyalin katalog server ke klien — dua daftar
// yang akan menyimpang, dan yang menyimpang di sini muncul sebagai pesan yang
// salah pada saat pengguna paling butuh pesan yang benar.
import { ApiError } from "@nawasena/api-client";
import type { FungsiTeks, KunciTeks } from "../../shared/i18n/index.js";

const PER_KODE: Readonly<Record<string, KunciTeks>> = {
  KODE_OTP_SALAH: "auth.galat.kodeSalah",
  KODE_OTP_HANGUS: "auth.galat.kodeHangus",
  TERLALU_BANYAK_PERCOBAAN: "auth.galat.terlaluBanyak",
  TERLALU_BANYAK_PERMINTAAN: "auth.galat.terlaluBanyak",
  JARINGAN_GAGAL: "auth.galat.jaringan",
};

/**
 * Kalimat untuk ditampilkan DAN diumumkan.
 *
 * Tidak pernah mengembalikan string kosong: kolom bermasalah yang pesannya
 * kosong menampilkan garis merah tanpa keterangan — pengguna yang melihatnya
 * tahu ada yang salah tetapi tidak tahu apa, dan pengguna screen reader tidak
 * tahu apa pun. Karena itu ada dua lapis cadangan.
 */
export function pesanGalat(galat: unknown, t: FungsiTeks): string {
  if (galat instanceof ApiError) {
    const kunci = PER_KODE[galat.code];
    if (kunci !== undefined) return t(kunci);

    // Pesan server, lengkap dengan sarannya. `hint` ikut karena di sanalah
    // "apa yang harus saya lakukan" berada — bagian yang paling berguna dan
    // paling sering dibuang saat hanya `message` yang ditampilkan.
    return galat.hint === undefined ? galat.message : `${galat.message} ${galat.hint}`;
  }

  // Bukan ApiError sama sekali (bug klien, TypeError, apa pun). Pengguna tidak
  // bisa berbuat apa-apa dengan detail teknisnya, dan menampilkannya justru
  // berisiko membocorkan isi permintaan.
  return t("auth.galat.jaringan");
}

// CATATAN — angka "tunggu berapa lama" pada kegagalan 429 TIDAK terbaca klien.
// Server menaruhnya di header `Retry-After` (lihat `AppErrorOverrides`), bukan
// di envelope, dan `ApiError` tidak membawa header. Akibatnya hint bawaan
// TERLALU_BANYAK_PERCOBAAN ("Tunggu sesuai waktu yang diberitahukan") menunjuk
// angka yang tidak pernah sampai ke layar. Yang bisa dipakai hanyalah
// `retryAfterSeconds` dari jawaban SUKSES `/auth/otp/request`, dan itulah yang
// menggerakkan hitung mundur "kirim ulang". Menutup celahnya berarti mengubah
// `@nawasena/api-client` agar meneruskan header — di luar scope PR-030b.
