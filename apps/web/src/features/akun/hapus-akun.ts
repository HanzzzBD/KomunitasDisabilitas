// Kegagalan pada alur hapus akun → kalimat yang dibacakan ke pengguna
// (PR-033c-1). Bagian yang TIDAK menyentuh DOM.
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

/**
 * Kode galat yang punya kalimat khas di sini.
 *
 * Sengaja PENDEK — sisanya memakai kalimat server, yang untuk alur ini memang
 * sudah tepat sasaran (`CARA_KONFIRMASI_TIDAK_COCOK` bahkan menyertakan saran
 * cara lain yang dimiliki akun itu, sesuatu yang hanya server tahu).
 *
 * Yang dipetakan hanya kode yang (a) sering ditemui pengguna DAN (b) butuh
 * varian `id-simple` — satu-satunya hal yang tidak bisa datang dari server.
 */
const PER_KODE: PetaGalat = {
  KODE_OTP_SALAH: "auth.galat.kodeSalah",
  KODE_OTP_HANGUS: "auth.galat.kodeHangus",
  // Di sini 429 berarti "terlalu sering mencoba kode" — sama seperti di alur
  // masuk, dan BERBEDA dari arti kode yang sama pada ekspor data ("jatah
  // unduhan habis"). Itulah sebabnya petanya per fitur.
  TERLALU_BANYAK_PERCOBAAN: "auth.galat.terlaluBanyak",
  TERLALU_BANYAK_PERMINTAAN: "auth.galat.terlaluBanyak",
  JARINGAN_GAGAL: "shell.galat.jaringan",

  // --- Jalur Google (PR-033c-2) ---
  // Consent-nya sah, tetapi milik akun Google lain. Hampir selalu salah pilih
  // akun di layar Google — bukan serangan — jadi kalimatnya menyebut sebabnya
  // dan apa yang harus dilakukan, bukan menolak dengan "tidak valid".
  KONFIRMASI_GOOGLE_BEDA_AKUN: "pengaturan.hapus.galat.bedaAkun",
  // `code` Google sekali pakai dan berumur pendek; yang tiba di layar
  // konfirmasi beberapa menit kemudian akan menemuinya.
  GOOGLE_EXCHANGE_GAGAL: "pengaturan.hapus.galat.kedaluwarsa",
};

export function pesanGalatHapus(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}
