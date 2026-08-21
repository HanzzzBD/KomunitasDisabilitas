// Domain: profiles — profil pencari kerja (PR-037, SDD §6.2, ADR-007).
//
// DUA KELAS DATA HIDUP DI SATU TABEL, dan file ini adalah tempat perbedaannya
// dinyatakan sebagai TIPE, bukan sebagai kehati-hatian:
//
//   AMAN     — headline, ringkasan, kota, provinsi, kesediaan remote. Data
//              karier biasa; kelak boleh tampil di hasil pencarian employer.
//   SENSITIF — ragam disabilitas & kebutuhan akomodasi. Data pribadi spesifik
//              UU PDP 27/2022: disimpan sebagai ciphertext (core/crypto), hanya
//              boleh keluar lewat endpoint pemiliknya, dan hanya bila pemilik
//              memberi consent EKSPLISIT yang terpisah dari consent pemakaian
//              platform.
//
// Karena itu `seekerProfileSchema` MENYARANGKAN yang sensitif di bawah satu key
// (`sensitive`) alih-alih menaburkannya sejajar dengan yang aman. Bentuk itu
// yang membuat kebocoran lewat serialisasi tak sengaja menjadi sulit: response
// publik memakai `safeProfileSchema` — objek yang secara TIPE tidak punya tempat
// bagi field sensitif, jadi menambahkannya adalah typecheck merah, bukan
// keputusan yang bisa terlewat saat review. PR-039 melanjutkannya sampai ke
// lapisan repository (`findProfileSafe` vs `findProfileSensitive`).
import "zod-openapi/extend";
import { z } from "zod";
import { timestampSchema } from "./common.js";

/**
 * Ragam disabilitas — FR-2.1 PRD (multi-select: Tuli, Netra, Daksa, Autisme,
 * lainnya).
 *
 * Nilainya sengaja SAMA dengan `jobs.welcomed_disability_types` di seed
 * (prisma/seed-data.ts): matching PR-069 mempertemukan keduanya, dan dua
 * taksonomi yang berbeda tipis adalah cara paling tenang untuk membuat
 * pencocokan gagal tanpa satu pun error.
 *
 * `lainnya` ada karena daftar tertutup atas ragam disabilitas akan selalu
 * meleset bagi seseorang; teks bebasnya ditulis di `accommodationNeeds.notes`,
 * yang ikut terenkripsi.
 */
export const disabilityTypeSchema = z
  .enum(["tuli", "netra", "daksa", "autisme", "lainnya"])
  .openapi({ description: "Ragam disabilitas (FR-2.1)" });

export type DisabilityType = z.infer<typeof disabilityTypeSchema>;

/** Seluruh ragam sebagai data — dipakai editor profil (PR-040). */
export const DISABILITY_TYPES = disabilityTypeSchema.options;

/**
 * Taksonomi akomodasi — SATU daftar untuk tiga sisi.
 *
 * Nilai yang sama dipakai `companies.accommodations_available` dan
 * `jobs.accommodations` (lihat `AKOM` di prisma/seed-data.ts). Itulah yang
 * membuat "kebutuhan pencari kerja" dan "fasilitas yang tersedia" bisa
 * dibandingkan sama sekali. Menambah nilai baru berarti menambahnya di sini
 * DAN memakainya di kedua sisi — bukan menuliskannya bebas di salah satunya.
 */
export const accommodationNeedSchema = z
  .enum([
    "akses_kursi_roda",
    "ramah_screen_reader",
    "wawancara_via_teks",
    "jam_kerja_fleksibel",
    "ruang_kerja_tenang",
    "juru_bahasa_isyarat",
  ])
  .openapi({ description: "Taksonomi akomodasi (selaras jobs.accommodations)" });

export type AccommodationNeed = z.infer<typeof accommodationNeedSchema>;

/** Seluruh akomodasi sebagai data — dipakai editor akomodasi (PR-040). */
export const ACCOMMODATION_NEEDS = accommodationNeedSchema.options;

/**
 * Buang duplikat sambil mempertahankan urutan pertama kali muncul.
 *
 * Daftar ini datang dari sekumpulan kotak centang. Dua nilai sama berarti klien
 * salah merakit badan permintaan — dan menolaknya dengan 400 hanya menyisakan
 * pengguna di depan formulir yang tidak bisa ia perbaiki. Yang bisa ia perbaiki
 * adalah nilai LIAR (di luar taksonomi), dan itu memang ditolak enum di atas.
 */
function unik<T>(nilai: T[]): T[] {
  return [...new Set(nilai)];
}

/**
 * Kebutuhan akomodasi: pilihan taksonomi + catatan bebas.
 *
 * `notes` ADA karena taksonomi enam nilai tidak akan pernah cukup: kebutuhan
 * yang tidak terwakili tetap harus bisa disampaikan pemiliknya kepada calon
 * pemberi kerja. Ia ikut terenkripsi bersama `tags` — satu kolom `bytea`, satu
 * dokumen JSON — sebab catatan kebutuhan akomodasi seringkali JUSTRU bagian
 * yang paling mengungkapkan kondisi seseorang.
 */
export const accommodationNeedsSchema = z
  .object({
    tags: z
      .array(accommodationNeedSchema)
      .max(ACCOMMODATION_NEEDS.length, { message: "Terlalu banyak pilihan akomodasi" })
      .transform(unik),
    notes: z
      .string()
      .trim()
      .max(500, { message: "Catatan akomodasi maksimal 500 karakter" })
      .transform((v) => (v === "" ? null : v))
      .nullable(),
  })
  .openapi({ ref: "AccommodationNeeds", description: "Kebutuhan akomodasi (TERENKRIPSI)" });

export type AccommodationNeeds = z.infer<typeof accommodationNeedsSchema>;

/** Kebutuhan akomodasi kosong — bentuk baku saat pemilik belum mengisi apa pun. */
export const ACCOMMODATION_NEEDS_KOSONG: AccommodationNeeds = { tags: [], notes: null };

/**
 * Bawaan disclosure data disabilitas per lamaran (enum `DisclosureDefault` di
 * schema.prisma). BUKAN data sensitif: ia setelan perilaku, bukan kondisi
 * seseorang — jadi ia tinggal di bagian yang aman.
 */
export const disclosureDefaultSchema = z
  .enum(["never", "ask_each_time", "always"])
  .openapi({ description: "Bawaan pengungkapan disabilitas saat melamar" });

export type DisclosureDefaultPref = z.infer<typeof disclosureDefaultSchema>;

/** Teks profil opsional: kosongkan dengan `null` ATAU string kosong. */
function teksOpsional(maks: number, pesan: string) {
  return z
    .string()
    .trim()
    .max(maks, { message: pesan })
    .transform((v) => (v === "" ? null : v))
    .nullable();
}

/**
 * Bagian AMAN profil — tidak satu pun field di sini butuh consent.
 *
 * Inilah bentuk yang boleh dipakai response mana pun, termasuk yang kelak
 * dilihat employer (Phase 12). Ia sengaja objek TERSENDIRI, bukan hasil
 * `.omit()` dari profil penuh: `omit` menghapus apa yang kebetulan ada hari
 * ini, sedangkan objek tersendiri tidak punya tempat bagi field sensitif yang
 * ditambahkan besok.
 */
export const safeProfileSchema = z
  .object({
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    openToRemote: z.boolean(),
    disclosureDefault: disclosureDefaultSchema,
  })
  .openapi({ ref: "SafeProfile", description: "Profil tanpa data sensitif" });

export type SafeProfile = z.infer<typeof safeProfileSchema>;

/**
 * Bagian SENSITIF — hanya keluar lewat endpoint pemiliknya, hanya bila consent
 * masih berlaku.
 */
export const sensitiveProfileSchema = z
  .object({
    disabilityTypes: z.array(disabilityTypeSchema),
    accommodationNeeds: accommodationNeedsSchema,
  })
  .openapi({ ref: "SensitiveProfile", description: "Data disabilitas (TERENKRIPSI di DB)" });

export type SensitiveProfile = z.infer<typeof sensitiveProfileSchema>;

/**
 * Profil sebagaimana dilihat PEMILIKNYA — GET/PUT /me/profile.
 *
 * `sensitive` bernilai `null` bila consent belum diberikan atau sudah dicabut.
 * Itu BUKAN sekadar "datanya kosong": ia menyatakan bahwa platform tidak sedang
 * memegang data disabilitas orang ini sama sekali. Membedakan keduanya penting
 * bagi UI (PR-040), yang harus menampilkan langkah consent alih-alih formulir
 * kosong yang seolah-olah siap diisi.
 *
 * `consentSensitiveAt` ikut dikirim supaya pemilik bisa melihat KAPAN ia
 * menyetujui — bukti yang dituntut UU PDP dan yang selama ini hanya ada di DB.
 */
export const seekerProfileSchema = safeProfileSchema
  .extend({
    consentSensitiveAt: timestampSchema.nullable(),
    sensitive: sensitiveProfileSchema.nullable(),
  })
  .openapi({ ref: "SeekerProfile", description: "Profil lengkap milik pemiliknya" });

export type SeekerProfile = z.infer<typeof seekerProfileSchema>;

/**
 * Profil kosong — jawaban bagi akun yang belum pernah menyentuh /me/profile.
 *
 * Nilainya HARUS sama dengan `@default` kolom di schema.prisma: baris yang lahir
 * lewat PUT pertama akan berisi persis ini, jadi bawaan yang berbeda berarti
 * pengguna melihat dua tampilan tanpa pernah mengubah apa pun.
 */
export const SEEKER_PROFILE_KOSONG: SeekerProfile = {
  headline: null,
  summary: null,
  city: null,
  province: null,
  openToRemote: false,
  disclosureDefault: "ask_each_time",
  consentSensitiveAt: null,
  sensitive: null,
};

/**
 * PUT /me/profile — perubahan SEBAGIAN.
 *
 * Tiga keadaan per field, sama seperti preferensi aksesibilitas (PR-034):
 * tidak disebut = jangan sentuh; bernilai = simpan; `null` = kosongkan.
 *
 * `consentSensitive` adalah SAKELAR, bukan timestamp: klien tidak pernah
 * menentukan kapan consent terjadi — server yang mencatatnya. `true` memberi
 * consent (dan boleh dikirim BERSAMA data sensitif dalam satu permintaan,
 * sebab itulah bentuk formulirnya: centang lalu simpan); `false` MENCABUTNYA,
 * dan pencabutan selalu menghapus data sensitif yang tersimpan.
 *
 * `.strict()`: field asing ditolak, bukan diabaikan. Data yang salah tulis lalu
 * dibuang diam-diam akan tampak "tersimpan" bagi pengguna — dan pada data
 * disabilitas, kegagalan senyap itu berarti seseorang mengira ia sudah
 * memberitahu kebutuhannya padahal tidak.
 */
export const updateSeekerProfileSchema = z
  .object({
    headline: teksOpsional(120, "Judul profil maksimal 120 karakter"),
    summary: teksOpsional(2000, "Ringkasan maksimal 2000 karakter"),
    city: teksOpsional(80, "Nama kota maksimal 80 karakter"),
    province: teksOpsional(80, "Nama provinsi maksimal 80 karakter"),
    openToRemote: z.boolean(),
    disclosureDefault: disclosureDefaultSchema,
    /** true = beri consent; false = cabut consent DAN hapus data sensitif. */
    consentSensitive: z.boolean(),
    disabilityTypes: z
      .array(disabilityTypeSchema)
      .max(DISABILITY_TYPES.length, { message: "Terlalu banyak ragam disabilitas dipilih" })
      .transform(unik)
      .nullable(),
    accommodationNeeds: accommodationNeedsSchema.nullable(),
  })
  .partial()
  .strict()
  .superRefine((nilai, ctx) => {
    // Mencabut consent sambil menyimpan data sensitif adalah permintaan yang
    // saling meniadakan. Menjalankan salah satunya diam-diam — mana pun yang
    // dipilih — berarti hasil akhirnya bukan yang diminta siapa pun.
    const menulisSensitif =
      (nilai.disabilityTypes ?? null) !== null || (nilai.accommodationNeeds ?? null) !== null;
    if (nilai.consentSensitive === false && menulisSensitif) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consentSensitive"],
        message:
          "Tidak bisa mencabut persetujuan sambil menyimpan data disabilitas — pilih salah satu",
      });
    }
  })
  .openapi({ ref: "UpdateSeekerProfile" });

export type UpdateSeekerProfile = z.infer<typeof updateSeekerProfileSchema>;

/**
 * GET/PUT /api/v1/me/profile — response 200.
 *
 * PEMBUNGKUS `{ data }`, bukan profil telanjang — sama seperti
 * `accessibilityResponseSchema`. Klien yang memarse `seekerProfileSchema`
 * langsung atas badan HTTP akan menolak SETIAP jawaban yang benar.
 */
export const seekerProfileResponseSchema = z
  .object({ data: seekerProfileSchema })
  .openapi({ ref: "SeekerProfileResponse" });

export type SeekerProfileResponse = z.infer<typeof seekerProfileResponseSchema>;
