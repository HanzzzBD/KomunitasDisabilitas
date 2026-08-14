// Kegagalan API pada alur MASUK → kalimat yang dibacakan ke pengguna.
//
// Inti generiknya (pesan server + hint, cadangan jaringan) pindah ke
// `shared/galat-api.ts` di PR-033b, saat pemakai keduanya lahir — lihat
// alasannya di sana. Yang tersisa di berkas ini justru bagian yang memang milik
// fitur ini: kode mana yang punya kalimat khas auth.
//
// Pemetaannya sengaja PENDEK. Hanya kegagalan yang paling sering ditemui
// pengguna yang punya entri katalog; sisanya memakai pesan server. Memetakan
// semua kode berarti menyalin katalog server ke klien — dua daftar yang akan
// menyimpang, dan yang menyimpang di sini muncul sebagai pesan yang salah pada
// saat pengguna paling butuh pesan yang benar.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

const PER_KODE: PetaGalat = {
  KODE_OTP_SALAH: "auth.galat.kodeSalah",
  KODE_OTP_HANGUS: "auth.galat.kodeHangus",
  TERLALU_BANYAK_PERCOBAAN: "auth.galat.terlaluBanyak",
  // Di alur masuk, 429 berarti "terlalu sering mencoba". Kode yang sama pada
  // ekspor data berarti hal yang sama sekali lain (jatah unduhan habis) — dan
  // itulah sebabnya petanya per fitur, bukan satu daftar bersama.
  TERLALU_BANYAK_PERMINTAAN: "auth.galat.terlaluBanyak",
  JARINGAN_GAGAL: "shell.galat.jaringan",
};

export function pesanGalat(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}

// CATATAN — angka "tunggu berapa lama" pada kegagalan 429 TIDAK terbaca klien.
// Server menaruhnya di header `Retry-After` (lihat `AppErrorOverrides`), bukan
// di envelope, dan `ApiError` tidak membawa header. Akibatnya hint bawaan
// TERLALU_BANYAK_PERCOBAAN ("Tunggu sesuai waktu yang diberitahukan") menunjuk
// angka yang tidak pernah sampai ke layar. Yang bisa dipakai hanyalah
// `retryAfterSeconds` dari jawaban SUKSES `/auth/otp/request`, dan itulah yang
// menggerakkan hitung mundur "kirim ulang". Menutup celahnya berarti mengubah
// `@nawasena/api-client` agar meneruskan header — di luar scope PR-030b.
