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
import { idSchema, timestampSchema } from "./common.js";

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
    // `effectType: "same"` bukan basa-basi generator: tanpanya zod-openapi tidak
    // bisa menentukan tipe `ZodEffects` dan MENGGAGALKAN pembuatan dokumen —
    // yang baru terlihat saat skema ini ikut terbawa ke sebuah path (ekspor PDP,
    // PR-038). Nilainya benar apa adanya: membuang duplikat tidak mengubah
    // bentuk, hanya isinya.
    tags: z
      .array(accommodationNeedSchema)
      .max(ACCOMMODATION_NEEDS.length, { message: "Terlalu banyak pilihan akomodasi" })
      .transform(unik)
      .openapi({ effectType: "same" }),
    // `.nullable()` SEBELUM `.transform()`, bukan sesudah. Urutannya tidak
    // mengubah perilaku (null tetap null, string kosong tetap menjadi null)
    // tetapi membuat tipe masuk dan tipe keluar sama-sama `string | null` —
    // yang berarti `effectType: "same"` di bawah adalah pernyataan yang benar,
    // bukan sekadar mantra untuk menyenangkan generator.
    notes: z
      .string()
      .trim()
      .max(500, { message: "Catatan akomodasi maksimal 500 karakter" })
      .nullable()
      .transform((v) => (v === null || v === "" ? null : v))
      .openapi({ effectType: "same" }),
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
  // Urutan `.nullable()` lalu `.transform()` — alasannya sama dengan `notes`
  // pada `accommodationNeedsSchema` di atas.
  return z
    .string()
    .trim()
    .max(maks, { message: pesan })
    .nullable()
    .transform((v) => (v === null || v === "" ? null : v))
    .openapi({ effectType: "same" });
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

// ===== Sub-entitas karier (PR-038) =====
//
// Riwayat kerja, pendidikan, dan keahlian: bahan CV (Phase 09) dan bahan
// matching (PR-069). Ketiganya AMAN — tidak satu pun butuh consent, dan tidak
// satu pun disimpan terenkripsi. Mereka tinggal di file yang sama dengan data
// sensitif justru supaya perbedaannya terbaca sekali lihat: yang di atas
// bersarang di bawah `sensitive`, yang di bawah ini tidak.

/**
 * Tanggal tanpa jam/zona (`@db.Date` di schema.prisma).
 *
 * BUKAN `timestampSchema`: riwayat kerja tidak punya jam, dan menyimpannya
 * sebagai timestamptz berarti "mulai Januari 2020" milik seseorang di Jayapura
 * bisa terbaca sebagai Desember 2019 di kolom yang sama.
 *
 * Regex saja tidak cukup, dan `new Date` saja JUGA tidak cukup: pengurai string
 * ISO hanya menuntut hari berada di 01–31 tanpa memeriksa panjang bulannya,
 * sehingga `2026-02-31` bukan menjadi Invalid Date melainkan DIAM-DIAM
 * bergeser menjadi 3 Maret. Riwayat kerja yang tanggalnya bergeser sendiri
 * adalah kesalahan yang tidak akan pernah dilaporkan siapa pun — pemiliknya
 * mengira ia salah ingat. Karena itu hasil uraiannya dibaca kembali dan harus
 * sama persis dengan yang dikirim.
 */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal harus ditulis YYYY-MM-DD" })
  .refine(
    (v) => {
      const waktu = new Date(v + "T00:00:00.000Z");
      return !Number.isNaN(waktu.getTime()) && waktu.toISOString().slice(0, 10) === v;
    },
    { message: "Tanggal itu tidak ada di kalender" },
  )
  .openapi({ description: "Tanggal YYYY-MM-DD", example: "2020-01-15" });

/** Teks WAJIB: kosong/spasi ditolak, bukan diam-diam menjadi null. */
function teksWajib(maks: number, pesanKosong: string, pesanPanjang: string) {
  return z.string().trim().min(1, { message: pesanKosong }).max(maks, { message: pesanPanjang });
}

/**
 * Riwayat kerja satu baris.
 *
 * `endDate` null berarti MASIH BEKERJA di sana — bukan data yang belum diisi.
 * UI (PR-040) menampilkannya sebagai "sekarang", dan matching memperlakukannya
 * sebagai pengalaman yang sedang berjalan.
 */
export const experienceSchema = z
  .object({
    id: idSchema,
    title: z.string(),
    company: z.string().nullable(),
    startDate: dateOnlySchema.nullable(),
    endDate: dateOnlySchema.nullable(),
    description: z.string().nullable(),
  })
  .openapi({ ref: "Experience", description: "Satu riwayat pekerjaan" });

export type Experience = z.infer<typeof experienceSchema>;

const experienceFields = z.object({
  title: teksWajib(120, "Nama posisi tidak boleh kosong", "Nama posisi maksimal 120 karakter"),
  company: teksOpsional(120, "Nama perusahaan maksimal 120 karakter").default(null),
  startDate: dateOnlySchema.nullable().default(null),
  endDate: dateOnlySchema.nullable().default(null),
  description: teksOpsional(2000, "Deskripsi pekerjaan maksimal 2000 karakter").default(null),
});

/**
 * Mulai tidak boleh melewati selesai.
 *
 * Dijaga DI SINI supaya klien menerima kesalahan pada field yang benar, dan
 * DIULANG di service atas baris hasil gabungan (`career.service.ts`) — sebab
 * permintaan ubah yang hanya mengirim `endDate` tidak punya `startDate` untuk
 * dibandingkan di sini, dan pemeriksaan yang hanya melihat separuh datanya
 * bukan pemeriksaan.
 */
function urutanTanggal(
  nilai: { startDate?: string | null; endDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  const mulai = nilai.startDate ?? null;
  const selesai = nilai.endDate ?? null;
  // Perbandingan string cukup: format YYYY-MM-DD berpanjang tetap, jadi urutan
  // leksikografisnya sama dengan urutan kronologisnya.
  if (mulai !== null && selesai !== null && mulai > selesai) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "Tanggal selesai tidak boleh lebih awal daripada tanggal mulai",
    });
  }
}

export const createExperienceSchema = experienceFields
  .strict()
  .superRefine(urutanTanggal)
  .openapi({ ref: "CreateExperience" });

export type CreateExperience = z.infer<typeof createExperienceSchema>;

/**
 * Ubah sebagian: field yang tidak disebut tidak disentuh.
 *
 * `.partial()` diterapkan SEBELUM `.strict()` dan `.superRefine()` — keduanya
 * menghasilkan pembungkus yang tidak lagi punya `.partial()`, jadi urutan lain
 * akan diam-diam kehilangan salah satunya.
 */
export const updateExperienceSchema = experienceFields
  .partial()
  .strict()
  .superRefine(urutanTanggal)
  .openapi({ ref: "UpdateExperience" });

export type UpdateExperience = z.infer<typeof updateExperienceSchema>;

/**
 * Riwayat pendidikan satu baris.
 *
 * `year` adalah tahun lulus (atau perkiraan lulus), bukan tanggal: ijazah tidak
 * pernah ditanyakan dalam hari, dan meminta tanggal penuh hanya menambah field
 * yang harus diisi tanpa menambah arti.
 */
export const educationSchema = z
  .object({
    id: idSchema,
    institution: z.string(),
    degree: z.string().nullable(),
    field: z.string().nullable(),
    year: z.number().int().nullable(),
  })
  .openapi({ ref: "Education", description: "Satu riwayat pendidikan" });

export type Education = z.infer<typeof educationSchema>;

/**
 * Batas tahun: 1950 sampai sepuluh tahun ke depan.
 *
 * Batas atasnya BUKAN "tahun ini": pendidikan yang sedang berjalan diisi dengan
 * perkiraan tahun lulus, dan menolaknya berarti mahasiswa tingkat akhir tidak
 * bisa menuliskan kuliahnya sama sekali. Dihitung sekali saat modul dimuat —
 * proses yang hidup bertahun-tahun akan memakai angka yang membeku, dan
 * kelonggaran sepuluh tahun itulah yang membuat pembekuan itu tidak pernah
 * menjadi masalah.
 */
export const EDUCATION_YEAR_MIN = 1950;
export const EDUCATION_YEAR_MAX = new Date().getUTCFullYear() + 10;

const educationFields = z.object({
  institution: teksWajib(
    160,
    "Nama institusi tidak boleh kosong",
    "Nama institusi maksimal 160 karakter",
  ),
  degree: teksOpsional(120, "Jenjang pendidikan maksimal 120 karakter").default(null),
  field: teksOpsional(120, "Bidang studi maksimal 120 karakter").default(null),
  year: z
    .number()
    .int({ message: "Tahun harus bilangan bulat" })
    .min(EDUCATION_YEAR_MIN, { message: "Tahun minimal " + String(EDUCATION_YEAR_MIN) })
    .max(EDUCATION_YEAR_MAX, { message: "Tahun maksimal " + String(EDUCATION_YEAR_MAX) })
    .nullable()
    .default(null),
});

export const createEducationSchema = educationFields.strict().openapi({ ref: "CreateEducation" });

export type CreateEducation = z.infer<typeof createEducationSchema>;

export const updateEducationSchema = educationFields
  .partial()
  .strict()
  .openapi({ ref: "UpdateEducation" });

export type UpdateEducation = z.infer<typeof updateEducationSchema>;

/**
 * Satu keahlian.
 *
 * `level` masih TEKS BEBAS, mengikuti kolomnya di schema.prisma: produk belum
 * memutuskan taksonominya, dan enum yang ditebak sekarang akan menolak jawaban
 * yang benar sebelum ada yang tahu jawaban benar itu seperti apa.
 */
export const skillSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    level: z.string().nullable(),
  })
  .openapi({ ref: "Skill", description: "Satu keahlian" });

export type Skill = z.infer<typeof skillSchema>;

const skillFields = z.object({
  name: teksWajib(80, "Nama keahlian tidak boleh kosong", "Nama keahlian maksimal 80 karakter"),
  level: teksOpsional(40, "Tingkat keahlian maksimal 40 karakter").default(null),
});

export const createSkillSchema = skillFields.strict().openapi({ ref: "CreateSkill" });

export type CreateSkill = z.infer<typeof createSkillSchema>;

export const updateSkillSchema = skillFields.partial().strict().openapi({ ref: "UpdateSkill" });

export type UpdateSkill = z.infer<typeof updateSkillSchema>;

/** Param `:id` route sub-entitas — id ITEM, bukan id pengguna (lihat routers). */
export const careerItemParamsSchema = z.object({ id: idSchema });

export type CareerItemParams = z.infer<typeof careerItemParamsSchema>;

/** Response daftar: `{ data: [...] }`, sama seperti seluruh API. */
export const experienceListResponseSchema = z
  .object({ data: z.array(experienceSchema) })
  .openapi({ ref: "ExperienceListResponse" });

export const educationListResponseSchema = z
  .object({ data: z.array(educationSchema) })
  .openapi({ ref: "EducationListResponse" });

export const skillListResponseSchema = z
  .object({ data: z.array(skillSchema) })
  .openapi({ ref: "SkillListResponse" });

/**
 * Bagian profil yang berubah — dibawa event `profile.updated`.
 *
 * Ada BUKAN supaya pelanggan bisa memilih sebagian: konsumen pertamanya
 * (embedding PR-069) menghitung ulang seluruh profil apa pun yang berubah. Ada
 * supaya barisnya di log bisa menjawab "yang mana yang memicu ini?" tanpa
 * membaca tabel — pertanyaan pertama setiap kali seseorang menyelidiki mengapa
 * embedding orang lain berubah.
 */
export const profileSectionSchema = z.enum(["profile", "experiences", "educations", "skills"]);

export type ProfileSection = z.infer<typeof profileSectionSchema>;

/**
 * Event domain `profile.updated` — profil atau sub-entitasnya berubah (PR-038).
 *
 * TIDAK memuat isi perubahan, sama seperti `userRegisteredEventSchema`: payload
 * yang membawa salinan data menjadi basi begitu ada mutasi berikutnya, dan
 * pelanggan yang memercayainya akan menghitung embedding dari keadaan yang
 * sudah tidak berlaku. Yang dibawa hanya cukup untuk membaca ulang sendiri.
 */
// SENGAJA tanpa `.openapi({ ref })`: event DOMAIN, bukan kontrak HTTP.
export const profileUpdatedEventSchema = z.object({
  userId: idSchema,
  section: profileSectionSchema,
  updatedAt: timestampSchema,
});

export type ProfileUpdatedEvent = z.infer<typeof profileUpdatedEventSchema>;
