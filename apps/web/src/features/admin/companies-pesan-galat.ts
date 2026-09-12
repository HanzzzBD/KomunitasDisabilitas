// Kalimat galat kurasi perusahaan (PR-053) — pola sama dengan `profil/pesan-galat.ts`.
import type { z } from "zod";
import { pesanGalatApi, type PetaGalat } from "../../shared/galat-api.js";
import type { FungsiTeks } from "../../shared/i18n/index.js";

/**
 * Dua kode yang perlu kalimat sendiri di sini.
 *
 * Sisanya sudah dijawab server dalam Bahasa Indonesia (`ERROR_CATALOG`, SDD
 * §11). `PERUSAHAAN_TIDAK_DITEMUKAN` perlu kalimat sendiri sebab pesan
 * bawaannya generik ("Periksa kembali tautan atau ID perusahaan") — tidak
 * menjelaskan bahwa admin sedang MENYUNTING baris yang sudah hilang, mungkin
 * dihapus dari tab/perangkat lain.
 */
const PER_KODE: PetaGalat = {
  JARINGAN_GAGAL: "shell.galat.jaringan",
  PERUSAHAAN_TIDAK_DITEMUKAN: "admin.companies.galat.tidakDitemukan",
};

export function pesanGalatSimpan(galat: unknown, t: FungsiTeks): string {
  return pesanGalatApi(galat, t, PER_KODE);
}

/** Pesan galat per nama kolom, siap diberikan ke `KolomForm`. */
export type GalatKolom = Readonly<Record<string, string>>;

/**
 * Validasi nilai formulir terhadap skema BuatPerusahaan/UbahPerusahaan.
 *
 * Fungsi generik yang sama dengan `profil/pesan-galat.ts` — diduplikasi
 * (bukan diimpor lintas fitur) karena ia betul-betul tidak tahu apa pun
 * tentang domainnya, persis alasan `teksAtauNull` di `companies-badan.ts`
 * tidak diimpor dari `profil/daftar-karier.ts`.
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
