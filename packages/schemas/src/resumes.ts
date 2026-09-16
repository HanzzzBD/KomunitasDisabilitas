// Domain: resumes — CV terstruktur (PR-060, SDD §6.2, PRD US-05).
//
// TIGA HAL BERBEDA HIDUP DI BERKAS INI, dan membedakannya adalah separuh isinya:
//
//   `resumeContentSchema`      ISI CV sebagaimana DIBACA. Inilah yang dokumen
//                              phase sebut "resumeSchema": kontrak TUNGGAL yang
//                              dipakai jalur manual (PR-061) DAN ekstraksi AI
//                              (PR-067), lalu dirender menjadi PDF (PR-063). Ia
//                              menempati satu kolom `jsonb` (`resumes.content`).
//   `resumeContentInputSchema` ISI CV sebagaimana DITULIS — bentuk yang sama,
//                              tetapi setiap bagian boleh dihilangkan. Kenapa
//                              harus terpisah: lihat blok "Isi CV" di bawah.
//   `resumeSchema`             SATU BARIS `resumes` apa adanya: id, judul, isi,
//                              `pdfUrl`, `createdVia`, stempel waktu. Bentuk
//                              yang dikembalikan API.
//
// Satu kontrak isi untuk dua jalur pembuatan bukan penghematan: jalur AI yang
// punya bentuk sendiri berarti CV hasil percakapan tidak bisa dibuka editor
// manual, dan graceful degradation (kewajiban produk, bukan fitur — PRD)
// berhenti menjadi mungkin justru pada saat AI tumbang.
//
// TIDAK ADA SATU PUN FIELD DISABILITAS DI SINI, DAN ITU DITEGAKKAN OLEH BENTUK,
// BUKAN OLEH KEHATI-HATIAN. Setiap objek di bawah `.strict()`, jadi
// `disabilityTypes` atau `accommodationNeeds` yang menyelinap masuk ditolak 400
// di gerbang — bukan diam-diam tersimpan di `jsonb` yang tidak terenkripsi.
// Alasannya bukan kerapian skema: CV adalah berkas yang dikirim pengguna ke
// perusahaan, dan pengungkapan ragam disabilitas HARUS tetap menjadi keputusan
// terpisah per lamaran (PR-075), bukan sesuatu yang ikut terbawa karena pernah
// diisi sekali di editor CV. Dijaga `__tests__/resumes.test.ts` di paket ini DAN
// `apps/api/__tests__/resumes-http.test.ts`.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";
import { dateOnlySchema } from "./profiles.js";

/**
 * Versi kontrak isi CV.
 *
 * Risiko yang ditulis dokumen phase adalah "skema CV berubah setelah dipakai
 * AI", dan mitigasinya "skema versioned". Angka ini adalah mitigasi itu: baris
 * `resumes.content` membawa versinya sendiri, jadi perubahan bentuk kelak bisa
 * dikenali per baris alih-alih ditebak dari tanggal pembuatan.
 *
 * DINAIKKAN HANYA untuk perubahan yang MERUSAK (field dihapus, arti berubah,
 * tipe berganti). Penambahan field opsional tidak menaikkannya — baris lama
 * tetap sah membacanya, dan versi yang naik pada setiap tambahan akan menjadi
 * angka yang tidak lagi berarti apa-apa.
 */
export const RESUME_SCHEMA_VERSION = 1;

/** Teks WAJIB — kosong/spasi ditolak, bukan diam-diam menjadi null. */
function teksWajib(maks: number, pesanKosong: string, pesanPanjang: string) {
  return z.string().trim().min(1, { message: pesanKosong }).max(maks, { message: pesanPanjang });
}

/**
 * Teks OPSIONAL — "" dan spasi menjadi null.
 *
 * Bentuknya sama persis dengan `teksOpsional` di `profiles.ts`, termasuk urutan
 * `.nullable()` sebelum `.transform()` yang membuat tipe masuk dan tipe keluar
 * sama-sama `string | null` — sehingga `effectType: "same"` di bawah adalah
 * pernyataan yang benar, bukan mantra untuk menyenangkan generator OpenAPI.
 *
 * TIDAK diimpor dari `profiles.ts`: fungsi itu tidak diekspor, dan mengekspornya
 * hanya untuk dipakai di sini akan menjadikan detail internal satu domain
 * sebagai permukaan publik paket.
 */
function teksOpsional(maks: number, pesan: string) {
  return z
    .string()
    .trim()
    .max(maks, { message: pesan })
    .nullable()
    .transform((v) => (v === null || v === "" ? null : v))
    .openapi({ effectType: "same" });
}

// ===== Isi CV — kontrak tunggal manual + AI (PR-061, PR-067) =====
//
// SETIAP BAGIAN PUNYA DUA SKEMA: satu untuk bentuk yang DIBACA (seluruh field
// hadir, termasuk yang kosong) dan satu untuk bentuk yang DITULIS (field yang
// boleh kosong tidak wajib dikirim). Field-nya sendiri ditulis SEKALI, sebagai
// `*_FIELDS`, lalu dipakai keduanya.
//
// Pemisahan itu WAJIB, bukan selera. Satu komponen OpenAPI yang bentuk masuknya
// berbeda dari bentuk keluarnya — dan `.default()` membuatnya berbeda: opsional
// di permintaan, wajib di jawaban — DITOLAK generator zod-openapi, dan
// penolakannya menggagalkan SELURUH dokumen, bukan hanya bagian ini. Pola yang
// sama sudah dipakai `createJobSchema` versus `jobAdminSchema`; bedanya hanya
// bahwa isi CV dipakai dua arah pada endpoint yang sama, sehingga keduanya
// benar-benar bertemu di satu dokumen.
//
// Yang dijaga penulisan berpasangan ini: bentuk yang tersimpan di `jsonb` SELALU
// sama, sesedikit apa pun yang dikirim pengirimnya — bawaannya diisi di gerbang,
// bukan di service, bukan pula di pembacanya nanti.

/**
 * Satu tautan pada bagian kontak (portofolio, LinkedIn, GitHub).
 *
 * `url` dibatasi http/https dengan sengaja. Template PDF (PR-063) menuliskannya
 * sebagai `href`, dan skema `javascript:` di sana adalah kerentanan yang dibawa
 * pengguna sendiri ke dalam berkas yang ia kirim ke perusahaan.
 *
 * TANPA PASANGAN TULIS: kedua field-nya wajib, jadi bentuk baca dan bentuk tulis
 * memang sudah sama.
 */
export const resumeLinkSchema = z
  .object({
    label: teksWajib(60, "Nama tautan tidak boleh kosong", "Nama tautan maksimal 60 karakter"),
    url: z
      .string()
      .trim()
      .max(300, { message: "Tautan maksimal 300 karakter" })
      .url({ message: "Tautan tidak valid" })
      .refine((v) => /^https?:\/\//i.test(v), {
        message: "Tautan harus dimulai dengan http:// atau https://",
      }),
  })
  .strict()
  .openapi({ ref: "ResumeLink", description: "Satu tautan pada bagian kontak CV" });

export type ResumeLink = z.infer<typeof resumeLinkSchema>;

const TAUTAN = z.array(resumeLinkSchema).max(5, { message: "Tautan maksimal 5" });

const KONTAK_FIELDS = {
  email: z
    .string()
    .trim()
    .max(160, { message: "Email maksimal 160 karakter" })
    .email({ message: "Format email tidak valid" })
    // Tanpa normalisasi "" → null seperti `teksOpsional`: `.email()` menolak
    // string kosong lebih dulu, jadi transformasinya tidak akan pernah
    // menerimanya. Field yang dikosongkan pengguna dikirim sebagai `null`.
    .nullable(),
  phone: teksOpsional(32, "Nomor HP maksimal 32 karakter"),
  city: teksOpsional(80, "Nama kota maksimal 80 karakter"),
  province: teksOpsional(80, "Nama provinsi maksimal 80 karakter"),
  links: TAUTAN,
} as const;

/**
 * Bagian kontak CV.
 *
 * SALINAN, bukan rujukan ke `users`/`seeker_profiles`. CV adalah dokumen yang
 * dibekukan saat dibuat: nomor HP yang berubah di profil tidak boleh mengubah
 * PDF yang sudah pernah diunduh dan dikirim seseorang ke lima perusahaan.
 * Prefill dari profil (PR-061) mengisi nilainya sekali, lalu pemiliknya bebas
 * mengubahnya di sini tanpa menyentuh profilnya.
 */
export const resumeContactSchema = z
  .object(KONTAK_FIELDS)
  .strict()
  .openapi({ ref: "ResumeContact", description: "Bagian kontak CV (salinan, bukan rujukan)" });

export type ResumeContact = z.infer<typeof resumeContactSchema>;

const resumeContactInputSchema = z
  .object({
    email: KONTAK_FIELDS.email.default(null),
    phone: KONTAK_FIELDS.phone.default(null),
    city: KONTAK_FIELDS.city.default(null),
    province: KONTAK_FIELDS.province.default(null),
    links: KONTAK_FIELDS.links.default([]),
  })
  .strict()
  .openapi({ ref: "ResumeContactInput", description: "Bagian kontak CV yang dikirim klien" });

/** Bagian kontak yang belum diisi sama sekali — nilai bila `contact` tak dikirim. */
const KONTAK_KOSONG: ResumeContact = resumeContactInputSchema.parse({});

/**
 * Mulai tidak boleh melewati selesai.
 *
 * Dipasang pada bentuk BACA maupun bentuk TULIS: pemeriksaan yang hanya ada di
 * salah satunya adalah pemeriksaan yang bisa dilewati lewat jalur yang lain.
 */
function urutanTanggal(
  nilai: { startDate?: string | null; endDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  const mulai = nilai.startDate ?? null;
  const selesai = nilai.endDate ?? null;
  // Perbandingan string cukup: YYYY-MM-DD berpanjang tetap, jadi urutan
  // leksikografisnya sama dengan urutan kronologisnya.
  if (mulai !== null && selesai !== null && mulai > selesai) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "Tanggal selesai tidak boleh lebih awal daripada tanggal mulai",
    });
  }
}

const PENGALAMAN_FIELDS = {
  title: teksWajib(120, "Nama posisi tidak boleh kosong", "Nama posisi maksimal 120 karakter"),
  company: teksOpsional(120, "Nama perusahaan maksimal 120 karakter"),
  startDate: dateOnlySchema.nullable(),
  /** null = MASIH BEKERJA di sana, bukan data yang belum diisi (sama seperti profil). */
  endDate: dateOnlySchema.nullable(),
  description: teksOpsional(2000, "Uraian pekerjaan maksimal 2000 karakter"),
} as const;

/**
 * Satu riwayat kerja DI DALAM CV.
 *
 * TANPA `id`, berbeda dari `experienceSchema` di `profiles.ts`. Yang di sana
 * adalah BARIS TABEL yang perlu ditunjuk satu per satu oleh `PUT /:id`; yang di
 * sini adalah elemen larik di dalam satu dokumen `jsonb` yang selalu ditulis
 * utuh. Id pada elemen larik hanya akan menjadi field yang harus dijaga
 * keunikannya tanpa satu pun yang membacanya.
 *
 * URUTAN LARIK ADALAH URUTAN TAMPIL. Itulah yang membuat tombol naik/turun di
 * editor (AC PR-061 — reorder lewat tombol, bukan drag-only) cukup menukar dua
 * elemen, dan membuat PDF menampilkan persis yang dilihat pemiliknya di layar.
 * Tidak ada `orderBy` di mana pun yang bisa diam-diam menyusun ulang.
 */
export const resumeExperienceSchema = z
  .object(PENGALAMAN_FIELDS)
  .strict()
  .openapi({ ref: "ResumeExperience", description: "Satu riwayat kerja di dalam CV" });

export type ResumeExperience = z.infer<typeof resumeExperienceSchema>;

const resumeExperienceInputSchema = z
  .object({
    title: PENGALAMAN_FIELDS.title,
    company: PENGALAMAN_FIELDS.company.default(null),
    startDate: PENGALAMAN_FIELDS.startDate.default(null),
    endDate: PENGALAMAN_FIELDS.endDate.default(null),
    description: PENGALAMAN_FIELDS.description.default(null),
  })
  .strict()
  .superRefine(urutanTanggal)
  .openapi({ ref: "ResumeExperienceInput", description: "Riwayat kerja yang dikirim klien" });

/** Batas tahun — alasannya sama persis dengan `educationFields` di `profiles.ts`. */
export const RESUME_YEAR_MIN = 1950;
export const RESUME_YEAR_MAX = new Date().getUTCFullYear() + 10;

const tahunSchema = z
  .number()
  .int({ message: "Tahun harus bilangan bulat" })
  .min(RESUME_YEAR_MIN, { message: "Tahun minimal " + String(RESUME_YEAR_MIN) })
  .max(RESUME_YEAR_MAX, { message: "Tahun maksimal " + String(RESUME_YEAR_MAX) })
  .nullable();

const PENDIDIKAN_FIELDS = {
  institution: teksWajib(
    160,
    "Nama institusi tidak boleh kosong",
    "Nama institusi maksimal 160 karakter",
  ),
  degree: teksOpsional(120, "Jenjang pendidikan maksimal 120 karakter"),
  field: teksOpsional(120, "Bidang studi maksimal 120 karakter"),
  year: tahunSchema,
} as const;

/** Satu riwayat pendidikan di dalam CV. */
export const resumeEducationSchema = z
  .object(PENDIDIKAN_FIELDS)
  .strict()
  .openapi({ ref: "ResumeEducation", description: "Satu riwayat pendidikan di dalam CV" });

export type ResumeEducation = z.infer<typeof resumeEducationSchema>;

const resumeEducationInputSchema = z
  .object({
    institution: PENDIDIKAN_FIELDS.institution,
    degree: PENDIDIKAN_FIELDS.degree.default(null),
    field: PENDIDIKAN_FIELDS.field.default(null),
    year: PENDIDIKAN_FIELDS.year.default(null),
  })
  .strict()
  .openapi({ ref: "ResumeEducationInput", description: "Riwayat pendidikan yang dikirim klien" });

const KEAHLIAN_FIELDS = {
  name: teksWajib(80, "Nama keahlian tidak boleh kosong", "Nama keahlian maksimal 80 karakter"),
  level: teksOpsional(40, "Tingkat keahlian maksimal 40 karakter"),
} as const;

/**
 * Satu keahlian di dalam CV.
 *
 * `level` tetap TEKS BEBAS, mengikuti keputusan yang sama di `profiles.ts`:
 * produk belum memutuskan taksonominya, dan enum yang ditebak sekarang akan
 * menolak jawaban yang benar sebelum ada yang tahu jawaban benar itu seperti apa.
 */
export const resumeSkillSchema = z
  .object(KEAHLIAN_FIELDS)
  .strict()
  .openapi({ ref: "ResumeSkill", description: "Satu keahlian di dalam CV" });

export type ResumeSkill = z.infer<typeof resumeSkillSchema>;

const resumeSkillInputSchema = z
  .object({ name: KEAHLIAN_FIELDS.name, level: KEAHLIAN_FIELDS.level.default(null) })
  .strict()
  .openapi({ ref: "ResumeSkillInput", description: "Keahlian yang dikirim klien" });

const SERTIFIKAT_FIELDS = {
  name: teksWajib(
    160,
    "Nama sertifikat tidak boleh kosong",
    "Nama sertifikat maksimal 160 karakter",
  ),
  issuer: teksOpsional(160, "Nama penerbit maksimal 160 karakter"),
  year: tahunSchema,
} as const;

/**
 * Satu sertifikasi/pelatihan.
 *
 * ADA sejak versi pertama, tidak ditunda. Bagi sebagian besar pencari kerja
 * penyandang disabilitas di Indonesia, sertifikat pelatihan vokasi adalah bukti
 * kompetensi paling kuat yang mereka punya — seringkali lebih kuat daripada
 * riwayat kerja formal yang justru sulit mereka dapatkan. CV yang tidak punya
 * tempat untuknya memaksa bukti itu diselipkan ke ringkasan sebagai prosa.
 */
export const resumeCertificationSchema = z
  .object(SERTIFIKAT_FIELDS)
  .strict()
  .openapi({ ref: "ResumeCertification", description: "Satu sertifikasi atau pelatihan" });

export type ResumeCertification = z.infer<typeof resumeCertificationSchema>;

const resumeCertificationInputSchema = z
  .object({
    name: SERTIFIKAT_FIELDS.name,
    issuer: SERTIFIKAT_FIELDS.issuer.default(null),
    year: SERTIFIKAT_FIELDS.year.default(null),
  })
  .strict()
  .openapi({ ref: "ResumeCertificationInput", description: "Sertifikasi yang dikirim klien" });

const ORGANISASI_FIELDS = {
  name: teksWajib(
    160,
    "Nama organisasi tidak boleh kosong",
    "Nama organisasi maksimal 160 karakter",
  ),
  role: teksOpsional(120, "Peran maksimal 120 karakter"),
  startDate: dateOnlySchema.nullable(),
  endDate: dateOnlySchema.nullable(),
  description: teksOpsional(1000, "Uraian organisasi maksimal 1000 karakter"),
} as const;

/** Satu pengalaman organisasi/kerelawanan. */
export const resumeOrganizationSchema = z
  .object(ORGANISASI_FIELDS)
  .strict()
  .openapi({ ref: "ResumeOrganization", description: "Satu pengalaman organisasi" });

export type ResumeOrganization = z.infer<typeof resumeOrganizationSchema>;

const resumeOrganizationInputSchema = z
  .object({
    name: ORGANISASI_FIELDS.name,
    role: ORGANISASI_FIELDS.role.default(null),
    startDate: ORGANISASI_FIELDS.startDate.default(null),
    endDate: ORGANISASI_FIELDS.endDate.default(null),
    description: ORGANISASI_FIELDS.description.default(null),
  })
  .strict()
  .superRefine(urutanTanggal)
  .openapi({ ref: "ResumeOrganizationInput", description: "Organisasi yang dikirim klien" });

/**
 * BATAS JUMLAH ELEMEN per larik.
 *
 * Bukan kesopanan: kolomnya `jsonb` tanpa batas ukuran bawaan, dan satu dokumen
 * 40 MB akan dibaca utuh ke memori oleh proses render PDF yang berjalan dengan
 * concurrency 1 dan batas RAM kontainer (risiko T4, SDD §16). Angkanya longgar
 * bagi manusia, ketat bagi skrip. Ditulis sekali, dipakai bentuk baca DAN tulis
 * — batas yang berbeda di antara keduanya adalah batas yang bisa dilewati.
 */
const BATAS = {
  experiences: [30, "Riwayat kerja maksimal 30"],
  educations: [20, "Riwayat pendidikan maksimal 20"],
  skills: [60, "Keahlian maksimal 60"],
  certifications: [30, "Sertifikasi maksimal 30"],
  organizations: [20, "Pengalaman organisasi maksimal 20"],
} as const;

const larik = <T extends z.ZodTypeAny>(item: T, batas: readonly [number, string]) =>
  z.array(item).max(batas[0], { message: batas[1] });

/** Kesembilan bagian isi CV sebagaimana DIBACA. */
const BAGIAN = {
  schemaVersion: z.literal(RESUME_SCHEMA_VERSION).openapi({ description: "Versi kontrak isi CV" }),
  headline: teksOpsional(160, "Headline maksimal 160 karakter"),
  summary: teksOpsional(2000, "Ringkasan maksimal 2000 karakter"),
  contact: resumeContactSchema,
  experiences: larik(resumeExperienceSchema, BATAS.experiences),
  educations: larik(resumeEducationSchema, BATAS.educations),
  skills: larik(resumeSkillSchema, BATAS.skills),
  certifications: larik(resumeCertificationSchema, BATAS.certifications),
  organizations: larik(resumeOrganizationSchema, BATAS.organizations),
} as const;

/**
 * ISI CV SEBAGAIMANA DIBACA — kontrak tunggal yang dokumen phase sebut
 * "resumeSchema".
 *
 * Seluruh bagian HADIR, termasuk yang kosong (`null`, `[]`). Pembacanya — editor
 * PR-061, template PDF PR-063, ekstraksi AI PR-067 — karena itu tidak pernah
 * perlu menebak apakah sebuah bagian tidak ada atau memang kosong, dan tidak
 * satu pun dari mereka butuh cabang kode untuk `undefined`.
 */
export const resumeContentSchema = z
  .object(BAGIAN)
  .strict()
  .openapi({
    ref: "ResumeContent",
    description:
      "Isi CV terstruktur — kontrak tunggal jalur manual (PR-061) dan ekstraksi AI (PR-067). " +
      "Tidak memuat field disabilitas apa pun dengan sengaja.",
  });

export type ResumeContent = z.infer<typeof resumeContentSchema>;

/**
 * ISI CV SEBAGAIMANA DITULIS — bentuk yang diterima POST/PUT.
 *
 * Setiap bagian punya bawaan, jadi `{}` adalah isi CV yang sah: CV lahir kosong
 * lalu diisi bagian demi bagian (AC PR-061 — "simpan-per-bagian, gagal parsial
 * tidak menghanguskan"). Menuntut kesembilan bagian terisi sejak awal akan
 * membuat langkah pertama seorang pengguna menjadi formulir sembilan bagian.
 *
 * HASIL PARSE-NYA ADALAH `ResumeContent` YANG UTUH, dan itu dijaga test: apa pun
 * yang lolos gerbang tulis selalu berbentuk seperti yang dijanjikan gerbang baca.
 */
export const resumeContentInputSchema = z
  .object({
    schemaVersion: BAGIAN.schemaVersion.default(RESUME_SCHEMA_VERSION),
    headline: BAGIAN.headline.default(null),
    summary: BAGIAN.summary.default(null),
    contact: resumeContactInputSchema.default(KONTAK_KOSONG),
    experiences: larik(resumeExperienceInputSchema, BATAS.experiences).default([]),
    educations: larik(resumeEducationInputSchema, BATAS.educations).default([]),
    skills: larik(resumeSkillInputSchema, BATAS.skills).default([]),
    certifications: larik(resumeCertificationInputSchema, BATAS.certifications).default([]),
    organizations: larik(resumeOrganizationInputSchema, BATAS.organizations).default([]),
  })
  .strict()
  .openapi({
    ref: "ResumeContentInput",
    description: "Isi CV yang dikirim klien — setiap bagian boleh dihilangkan",
  });

export type ResumeContentInput = z.input<typeof resumeContentInputSchema>;

/**
 * Nama seluruh bagian isi CV sebagai DATA.
 *
 * Dipakai penjaga "tanpa field disabilitas" (`__tests__/resumes.test.ts`) dan kelak
 * editor PR-061. Diturunkan dari skemanya, bukan ditulis ulang: daftar tangan
 * akan tetap hijau pada hari seseorang menambahkan bagian baru yang keliru.
 */
export const RESUME_CONTENT_SECTIONS = Object.keys(BAGIAN) as (keyof ResumeContent)[];

// ===== Baris `resumes` & kontrak HTTP =====

/** Cerminan enum Prisma `ResumeCreatedVia` — jalur lahirnya satu CV. */
export const resumeCreatedViaSchema = z
  .enum(["manual", "ai_chat"])
  .openapi({ description: "Jalur pembuatan CV: manual (PR-061) atau percakapan AI (PR-066)" });

export type ResumeCreatedVia = z.infer<typeof resumeCreatedViaSchema>;

/**
 * Ringkasan satu CV — bentuk yang dikembalikan DAFTAR, tanpa `content`.
 *
 * Isi CV sengaja tidak ikut: daftar dipakai untuk memilih, bukan untuk membaca,
 * dan lima dokumen lengkap pada layar yang hanya menampilkan judul adalah muatan
 * yang dibayar setiap pengguna pada koneksi seluler tanpa satu pun yang
 * memakainya. Editor (PR-061) mengambil satu CV lewat `GET /me/resumes/:id`.
 */
export const resumeSummarySchema = z
  .object({
    id: idSchema,
    title: z.string(),
    /** null = belum pernah dirender (PR-063). */
    pdfUrl: z.string().nullable(),
    createdVia: resumeCreatedViaSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .openapi({ ref: "ResumeSummary", description: "Ringkasan satu CV (tanpa isi)" });

export type ResumeSummary = z.infer<typeof resumeSummarySchema>;

/** Satu CV lengkap beserta isinya. */
export const resumeSchema = resumeSummarySchema
  .extend({ content: resumeContentSchema })
  .openapi({ ref: "Resume", description: "Satu CV beserta isinya" });

export type Resume = z.infer<typeof resumeSchema>;

/**
 * CV yang belum diisi apa pun — nilai bila `content` tidak dikirim saat membuat.
 *
 * Dihitung dari skemanya sendiri, bukan ditulis sebagai literal kedua: dua
 * sumber kebenaran untuk "CV kosong itu seperti apa" akan berbeda pada hari
 * sebuah bagian baru ditambahkan, dan yang tertinggal adalah yang ini.
 */
const ISI_KOSONG: ResumeContent = resumeContentInputSchema.parse({});

/** Param `:id` — id CV, BUKAN id pengguna (lihat routers modul resumes). */
export const resumeIdParamsSchema = z.object({ id: idSchema });

export type ResumeIdParams = z.infer<typeof resumeIdParamsSchema>;

const judulSchema = teksWajib(120, "Judul CV tidak boleh kosong", "Judul CV maksimal 120 karakter");

/**
 * POST /api/v1/me/resumes.
 *
 * TIDAK MEMUAT `createdVia`, dan itu disengaja: nilainya ditentukan JALUR yang
 * dipakai, bukan diakui klien. Endpoint ini selalu menghasilkan `manual`; jalur
 * `ai_chat` lahir dari endpoint percakapan (PR-066) yang memanggil service yang
 * sama dengan nilai berbeda. Klien yang bisa mengakui `ai_chat` akan membuat
 * analitik "berapa CV lahir dari AI" menjadi angka yang tidak berarti apa-apa.
 *
 * `content` punya default `{}` — CV boleh lahir kosong lalu diisi bagian demi
 * bagian; lihat `resumeContentSchema`.
 */
export const createResumeSchema = z
  .object({
    title: judulSchema,
    content: resumeContentInputSchema.default(ISI_KOSONG),
  })
  .strict()
  .openapi({ ref: "CreateResume" });

export type CreateResume = z.infer<typeof createResumeSchema>;

/**
 * PUT /api/v1/me/resumes/:id — field yang tidak dikirim tidak diubah.
 *
 * `content` DIGANTI UTUH bila disebut, tidak digabung per bagian. Penggabungan
 * di server menuntut aturan untuk setiap larik — "kirim `experiences` kosong"
 * berarti menghapus semuanya atau tidak mengubah apa pun? — dan aturan yang
 * tidak bisa dijawab tanpa menebak adalah aturan yang akan ditebak berbeda oleh
 * setiap klien. Editor per bagian (PR-061) mengirim dokumen utuh dengan satu
 * bagian berubah; itu bentuk yang sama-sama dipahami kedua sisi.
 */
export const updateResumeSchema = z
  .object({
    title: judulSchema,
    content: resumeContentInputSchema,
  })
  .partial()
  .strict()
  .openapi({ ref: "UpdateResume" });

export type UpdateResume = z.infer<typeof updateResumeSchema>;

/** Response satu CV — dipakai POST (201), GET satu, dan PUT (200). */
export const resumeResponseSchema = z
  .object({ data: resumeSchema })
  .openapi({ ref: "ResumeResponse" });

/** Response daftar CV. Tanpa pagination: batasnya lima per pengguna. */
export const resumeListResponseSchema = z
  .object({ data: z.array(resumeSummarySchema) })
  .openapi({ ref: "ResumeListResponse" });
