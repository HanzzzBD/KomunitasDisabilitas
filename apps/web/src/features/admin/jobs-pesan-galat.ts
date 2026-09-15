// Kalimat galat kurasi lowongan (PR-057) — pola sama `companies-pesan-galat.ts`.
import type { z } from "zod";
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

/**
 * Satu kode yang perlu kalimat sendiri di sini.
 *
 * Sisanya sudah dijawab server dalam Bahasa Indonesia (`ERROR_CATALOG`, SDD
 * §11) dengan kalimat yang cukup jelas apa adanya — termasuk
 * `AKOMODASI_LOWONGAN_KOSONG` dan `TRANSISI_STATUS_TIDAK_VALID`, yang keduanya
 * jarang terlihat pengguna sama sekali karena divalidasi client-side lebih
 * dulu (lihat `admin-jobs-formulir.tsx`). `LOWONGAN_TIDAK_DITEMUKAN` perlu
 * kalimat sendiri dengan alasan yang SAMA PERSIS dengan
 * `PERUSAHAAN_TIDAK_DITEMUKAN` di `companies-pesan-galat.ts`: pesan bawaannya
 * generik, tidak menjelaskan bahwa admin sedang MENYUNTING baris yang sudah
 * hilang.
 */
const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
  LOWONGAN_TIDAK_DITEMUKAN: "admin.jobs.galat.tidakDitemukan",
};

export function pesanGalatSimpan(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}

/** Pesan galat per nama kolom, siap diberikan ke `KolomForm`. */
export type GalatKolom = Readonly<Record<string, string>>;

/**
 * Validasi nilai formulir terhadap skema BuatLowongan/UbahLowongan.
 *
 * Diduplikasi (bukan diimpor lintas fitur) dari `companies-pesan-galat.ts` —
 * alasan yang sama dengan `teksAtauNull` di `jobs-badan.ts`: fungsi ini
 * betul-betul tidak tahu apa pun tentang domainnya.
 */
export function periksa<T>(
  skema: z.ZodType<T, z.ZodTypeDef, unknown>,
  nilai: unknown,
): { ok: true; nilai: T } | { ok: false; galat: GalatKolom } {
  const hasil = skema.safeParse(nilai);
  if (hasil.success) return { ok: true, nilai: hasil.data };

  const galat: Record<string, string> = {};
  for (const masalah of hasil.error.issues) {
    const nama = masalah.path.join(".");
    galat[nama] ??= masalah.message;
  }
  return { ok: false, galat };
}
