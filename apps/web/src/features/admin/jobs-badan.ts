// Pemetaan nilai formulir ↔ badan permintaan untuk kurasi lowongan (PR-057).
// Pola sama `companies-badan.ts`: TIDAK MENYENTUH DOM, bisa dipakai ulang
// mobile dan diuji tanpa merender apa pun.
//
// `companyId` HANYA ADA di `NilaiLowongan` untuk mode BUAT. `updateJobSchema`
// sengaja tidak menerimanya (lowongan tidak berpindah pemilik, PR-055) —
// `keBadanUbah` karena itu TIDAK sama dengan `keBadanBuat` seperti di
// `companies-badan.ts` (perusahaan tidak punya field yang hilang begitu saja
// antara buat dan ubah).
//
// `status`/`source` TIDAK ADA DI SINI SAMA SEKALI, pola yang sama dengan
// "status verifikasi tidak ada di formulir" companies: satu-satunya jalan
// mengubah status lowongan adalah tombol Terbitkan/Tutup
// (`admin-jobs-formulir.tsx`), bukan field formulir biasa yang bisa
// tersentuh tanpa sengaja.
import type {
  AccommodationNeed,
  DisabilityType,
  EmploymentType,
  JobAdmin,
  WorkMode,
} from "@nawasena/schemas";
import type { BuatLowongan, UbahLowongan } from "@nawasena/api-client";

/**
 * Nilai formulir — SELALU string/array pilihan, konversinya di
 * `keBadanBuat`/`keBadanUbah`. `salaryMin`/`salaryMax` string (bukan
 * `number | null`) dengan alasan yang sama seperti seluruh kolom teks lain di
 * repo ini: `<input>` terkontrol butuh string, dan "" adalah keadaan
 * "belum diisi" yang jauh lebih jelas daripada `NaN`.
 */
export interface NilaiLowongan {
  companyId: string;
  title: string;
  description: string;
  requirements: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  city: string;
  province: string;
  salaryMin: string;
  salaryMax: string;
  salaryVisible: boolean;
  accommodations: readonly AccommodationNeed[];
  welcomedDisabilityTypes: readonly DisabilityType[];
}

export const NILAI_KOSONG: NilaiLowongan = {
  companyId: "",
  title: "",
  description: "",
  requirements: "",
  employmentType: "full_time",
  workMode: "onsite",
  city: "",
  province: "",
  salaryMin: "",
  salaryMax: "",
  salaryVisible: true,
  accommodations: [],
  welcomedDisabilityTypes: [],
};

/** Lowongan dari server → nilai formulir (mode UBAH atau isi awal duplikasi). */
export function keNilai(lowongan: JobAdmin): NilaiLowongan {
  return {
    companyId: lowongan.companyId,
    title: lowongan.title,
    description: lowongan.description,
    requirements: lowongan.requirements ?? "",
    employmentType: lowongan.employmentType,
    workMode: lowongan.workMode,
    city: lowongan.city ?? "",
    province: lowongan.province ?? "",
    salaryMin: lowongan.salaryMin === null ? "" : String(lowongan.salaryMin),
    salaryMax: lowongan.salaryMax === null ? "" : String(lowongan.salaryMax),
    salaryVisible: lowongan.salaryVisible,
    accommodations: lowongan.accommodations,
    welcomedDisabilityTypes: lowongan.welcomedDisabilityTypes,
  };
}

/** Teks "" → null; sisanya dipotong spasinya. Pola sama `companies-badan.ts`. */
function teksAtauNull(nilai: string): string | null {
  const bersih = nilai.trim();
  return bersih === "" ? null : bersih;
}

/**
 * Angka dari kolom teks. "" → null (belum diisi — BEDA dari 0, gaji Rp0 yang
 * sungguh dimaksud tetap harus bisa dikirim). Nilai bukan angka diteruskan
 * sebagai `NaN`; `gajiSchema` (server DAN validasi klien di sini memakai
 * skema yang sama, `createJobSchema`/`updateJobSchema`) menolak `NaN` seperti
 * ia menolak angka lain di luar aturan, jadi pesan galatnya tetap konsisten
 * dengan kolom lain — bukan ditangkap diam-diam di sini.
 */
function angkaAtauNull(nilai: string): number | null {
  const bersih = nilai.trim();
  return bersih === "" ? null : Number(bersih);
}

/** Nilai formulir → badan POST /admin/jobs (mode BUAT). */
export function keBadanBuat(nilai: NilaiLowongan): BuatLowongan {
  return {
    companyId: nilai.companyId,
    title: nilai.title.trim(),
    description: nilai.description.trim(),
    requirements: teksAtauNull(nilai.requirements),
    employmentType: nilai.employmentType,
    workMode: nilai.workMode,
    city: teksAtauNull(nilai.city),
    province: teksAtauNull(nilai.province),
    salaryMin: angkaAtauNull(nilai.salaryMin),
    salaryMax: angkaAtauNull(nilai.salaryMax),
    salaryVisible: nilai.salaryVisible,
    accommodations: [...nilai.accommodations],
    welcomedDisabilityTypes: [...nilai.welcomedDisabilityTypes],
  };
}

/**
 * Nilai formulir → badan PUT /admin/jobs/:id (mode UBAH). SELURUH FIELD
 * DIKIRIM (bukan hanya yang berubah) — pola sama `companies-badan.ts`, dan
 * alasannya sama: formulir ini satu editor penuh, bukan PATCH per-niat.
 * `companyId` SENGAJA TIDAK DISERTAKAN — lihat komentar berkas ini.
 */
export function keBadanUbah(nilai: NilaiLowongan): UbahLowongan {
  const { companyId: _companyId, ...tanpaCompanyId } = keBadanBuat(nilai);
  return tanpaCompanyId;
}

/**
 * Lowongan tersimpan → badan POST /admin/jobs untuk DUPLIKASI (AC PR-057
 * "Duplikasi lowongan (copy as draft) tersedia — efisiensi kurasi").
 *
 * Duplikat SELALU lahir `draft` (bawaan server, sama seperti buat biasa) dan
 * TIDAK PERNAH membawa akomodasi kosong tanpa sengaja — seluruh field disalin
 * APA ADANYA dari baris asal, termasuk akomodasi dan ragam disabilitas yang
 * disambut, supaya admin hanya perlu mengubah bagian yang benar-benar
 * berbeda (mis. lokasi cabang lain) alih-alih mengisi ulang semuanya.
 *
 * Judul TIDAK diubah (tidak ditambah embel-embel "(Salinan)") — AC tidak
 * memintanya, dan menambah teks otomatis ke judul lowongan publik berisiko
 * lolos tanpa sengaja bila admin lupa menghapusnya sebelum menerbitkan.
 * Pembedaan dari baris asal cukup terlihat dari status (keduanya `draft`
 * sampai salah satunya diterbitkan) dan waktu dibuat di tabel.
 */
export function keBadanDuplikat(lowongan: JobAdmin): BuatLowongan {
  return keBadanBuat(keNilai(lowongan));
}
