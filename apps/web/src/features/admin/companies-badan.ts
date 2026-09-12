// Pemetaan nilai formulir ↔ badan permintaan untuk kurasi perusahaan (PR-053).
//
// TIDAK MENYENTUH DOM — alasan yang sama dengan `profil/pesan-galat.ts`:
// tetap bisa dipakai ulang mobile (features/README.md) dan diuji tanpa
// merender apa pun.
//
// STATUS VERIFIKASI TIDAK ADA DI FORMULIR INI, dan itu keputusan sadar.
// `updateCompanySchema.inclusivityStatus` hanya menerima
// `unverified`/`self_claimed` (PR-051) — menaruhnya sebagai field formulir
// biasa akan membuat penyimpanan field lain (mis. memperbaiki salah ketik
// nama) BERISIKO diam-diam menurunkan status "verified" bila nilainya tidak
// sengaja tersentuh. Satu-satunya jalan mengubah status di UI ini adalah
// tombol Verifikasi (`companies-formulir.tsx`) — aksi terpisah, dengan
// konfirmasinya sendiri.
import type { AccommodationNeed, CompanyAdmin } from "@nawasena/schemas";
import type { BuatPerusahaan, UbahPerusahaan } from "@nawasena/api-client";

/** Nilai formulir — SELALU string/array pilihan, konversinya di `keBadanBuat`/`keBadanUbah`. */
export interface NilaiPerusahaan {
  name: string;
  description: string;
  website: string;
  city: string;
  accommodationsAvailable: readonly AccommodationNeed[];
}

export const NILAI_KOSONG: NilaiPerusahaan = {
  name: "",
  description: "",
  website: "",
  city: "",
  accommodationsAvailable: [],
};

/** Perusahaan dari server → nilai formulir (mode UBAH). */
export function keNilai(perusahaan: CompanyAdmin): NilaiPerusahaan {
  return {
    name: perusahaan.name,
    description: perusahaan.description ?? "",
    website: perusahaan.website ?? "",
    city: perusahaan.city ?? "",
    accommodationsAvailable: perusahaan.accommodationsAvailable,
  };
}

/** Teks "" → null; sisanya dipotong spasinya. Pola sama dengan `profil/daftar-karier.ts`. */
function teksAtauNull(nilai: string): string | null {
  const bersih = nilai.trim();
  return bersih === "" ? null : bersih;
}

/** Nilai formulir → badan POST /admin/companies (mode BUAT). */
export function keBadanBuat(nilai: NilaiPerusahaan): BuatPerusahaan {
  return {
    name: nilai.name.trim(),
    description: teksAtauNull(nilai.description),
    website: teksAtauNull(nilai.website),
    city: teksAtauNull(nilai.city),
    accommodationsAvailable: [...nilai.accommodationsAvailable],
  };
}

/**
 * Nilai formulir → badan PUT /admin/companies/:id (mode UBAH).
 *
 * SELURUH FIELD DIKIRIM, bukan hanya yang berubah — beda dengan
 * `keBadanSensitif` di `profil` yang memang PATCH per-niat (consent). Di sini
 * tidak ada niat sesempit itu: formulir ini adalah satu editor penuh, dan
 * mengirim field yang tidak berubah aman sebab nilainya sama persis dengan
 * yang sudah tersimpan.
 */
export function keBadanUbah(nilai: NilaiPerusahaan): UbahPerusahaan {
  return keBadanBuat(nilai);
}
