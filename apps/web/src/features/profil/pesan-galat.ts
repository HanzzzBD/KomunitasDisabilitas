// Kalimat galat halaman profil (PR-040) — dua jenis, dan keduanya berbeda asal.
//
// Terpisah dari komponennya dengan alasan yang sama seperti
// `features/onboarding/pesan-galat.ts`: tidak menyentuh DOM, jadi tetap bisa
// dipakai ulang mobile (features/README.md) dan bisa diuji tanpa merender apa
// pun.
import type { z } from "zod";
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

/**
 * SATU kode saja yang perlu kalimat sendiri.
 *
 * Server sudah mengirim Bahasa Indonesia untuk sisanya (`ERROR_CATALOG`, SDD
 * §11) — termasuk `CONSENT_DIPERLUKAN`, yang kalimatnya justru lebih tepat
 * datang dari sana. `JARINGAN_GAGAL` lahir di klien: permintaannya tidak pernah
 * sampai, jadi tidak ada kalimat server untuk dipakai sama sekali.
 */
const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "profil.galat.jaringan",
};

export function pesanGalatSimpan(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}

/** Pesan galat per nama kolom, siap diberikan ke `KolomForm`. */
export type GalatKolom = Readonly<Record<string, string>>;

/**
 * Ubah kegagalan zod menjadi peta `nama kolom → kalimat`.
 *
 * KALIMATNYA DATANG DARI SKEMA, tidak ditulis ulang di katalog i18n. Skema yang
 * sama dipakai server untuk menolak permintaan yang sama (`validate({ body })`),
 * jadi menuliskannya dua kali berarti pengguna bisa membaca dua kalimat berbeda
 * untuk satu kesalahan yang sama — tergantung mana yang kebetulan menangkapnya
 * lebih dulu. Pesan di `packages/schemas` memang sudah ditulis dalam Bahasa
 * Indonesia sederhana justru untuk dibaca di sini.
 *
 * KALAU SATU KOLOM PUNYA DUA MASALAH, yang pertama yang menang. Menumpuk
 * keduanya menjadi satu paragraf membuat pengguna harus memilah kalimat mana
 * yang berlaku, dan `role="alert"` membacakan seluruhnya sekaligus.
 */
export function galatPerKolom(galat: z.ZodError): GalatKolom {
  const hasil: Record<string, string> = {};
  for (const masalah of galat.issues) {
    // Kolom bersarang (`accommodationNeeds.notes`) dirangkai dengan titik,
    // sama seperti nama yang dipakai formulirnya — sehingga pemetaannya tidak
    // perlu tabel penerjemah yang bisa ketinggalan.
    const nama = masalah.path.join(".");
    // `??=` bukan `=`: yang pertama datang adalah yang paling dekat dengan
    // sebab aslinya.
    hasil[nama] ??= masalah.message;
  }
  return hasil;
}

/**
 * Validasi nilai formulir terhadap skema, lalu kembalikan hasilnya sebagai
 * salah satu dari dua keadaan.
 *
 * Dipisahkan supaya komponen tidak perlu tahu bentuk `ZodError` sama sekali —
 * dan supaya "gagal validasi" tidak bisa tertukar dengan "gagal kirim", yang
 * ditangani jalur lain dan butuh kalimat lain.
 */
export type HasilPeriksa<T> = { ok: true; nilai: T } | { ok: false; galat: GalatKolom };

export function periksa<T>(skema: z.ZodType<T, z.ZodTypeDef, unknown>, nilai: unknown): HasilPeriksa<T> {
  const hasil = skema.safeParse(nilai);
  return hasil.success ? { ok: true, nilai: hasil.data } : { ok: false, galat: galatPerKolom(hasil.error) };
}
