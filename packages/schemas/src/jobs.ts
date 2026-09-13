// Domain: jobs — skema lowongan. Diisi bertahap per PR fitur terkait;
// ikuti konvensi README (camelCase+Schema, tipe via z.infer, ref PascalCase).
//
// PR-024b mengisi bagian pertamanya: event domain `job.closed`. Kontraknya
// ditaruh di sini, bukan di `core/events`, supaya pelanggan masa depan
// (notifikasi, cache feed, analitik) memakai bentuk yang SAMA dengan yang
// dikirim penerbitnya — dan supaya perubahan bentuknya terlihat sebagai
// perubahan kontrak, bukan detail internal satu modul.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, successEnvelopeSchema, timestampSchema } from "./common.js";
import { accommodationNeedSchema, disabilityTypeSchema } from "./profiles.js";

/**
 * Kenapa sebuah lowongan ditutup.
 *
 * `expired` — penutupan otomatis oleh job retensi (PR-024b). `closed_by_admin`
 * — admin menutup lewat `POST /admin/jobs/:id/close` (PR-055), persis nilai
 * kedua yang sudah diantisipasi komentar ini sejak lahir: pelanggan yang sudah
 * mendengarkan `job.closed` sekarang bisa membedakan keduanya tanpa perlu
 * berubah sama sekali.
 */
export const jobCloseReasonSchema = z.enum(["expired", "closed_by_admin"]);

export type JobCloseReason = z.infer<typeof jobCloseReasonSchema>;

/**
 * Event domain `job.closed` — lowongan berpindah ke status `closed`.
 *
 * TIDAK memuat isi lowongan (judul, perusahaan, gaji). Pelanggan yang
 * membutuhkannya membaca dari service `jobs`: event yang membawa salinan data
 * akan basi begitu barisnya berubah, dan pelanggan yang mempercayai salinan itu
 * bekerja dengan keadaan yang sudah tidak ada.
 */
// SENGAJA tanpa `.openapi({ ref })`: ini event DOMAIN, bukan kontrak HTTP.
// Menandainya sebagai komponen OpenAPI akan menempatkannya di dokumen yang
// dibaca klien sebagai janji API — padahal tidak ada satu pun endpoint yang
// mengembalikannya, dan tidak akan pernah ada.
export const jobClosedEventSchema = z.object({
  jobId: idSchema,
  closedAt: timestampSchema,
  reason: jobCloseReasonSchema,
});

export type JobClosedEvent = z.infer<typeof jobClosedEventSchema>;

/**
 * Cerminan enum Prisma `EmploymentType`/`WorkMode` (migrasi 03, PR-011).
 *
 * DITULIS DI SINI SEKARANG, MESKI MODUL `jobs` BARU LAHIR PR-055 — sama
 * alasannya dengan `jobClosedEventSchema` di atas: PR-054 (halaman publik
 * perusahaan) butuh menampilkan ringkasan lowongan aktif SEBELUM modul jobs
 * penuh ada, dan kontraknya harus sama persis dengan yang kelak dipakai
 * `jobs` sungguhan — bukan ditebak dua kali.
 */
export const employmentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "internship",
  "freelance",
]);

export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const workModeSchema = z.enum(["onsite", "hybrid", "remote"]);

export type WorkMode = z.infer<typeof workModeSchema>;

/**
 * Ringkasan lowongan AKTIF untuk halaman publik perusahaan (PR-054).
 *
 * SENGAJA MINIMAL — bukan kontrak lowongan penuh. Deskripsi, taksonomi
 * akomodasi per lowongan, dan gaji menyusul di PR-055/056/058/059 bersama
 * modul `jobs` sungguhan; yang dibutuhkan kartu ringkas di halaman perusahaan
 * hanyalah cukup untuk menyatakan "lowongan ini ada" dan menautkannya ke
 * halaman detail (PR-059).
 */
export const jobPublicSummarySchema = z
  .object({
    id: idSchema,
    title: z.string(),
    employmentType: employmentTypeSchema,
    workMode: workModeSchema,
    city: z.string().nullable(),
    province: z.string().nullable(),
    publishedAt: timestampSchema.nullable(),
  })
  .openapi({
    ref: "JobPublicSummary",
    description: "Ringkasan lowongan aktif untuk halaman publik perusahaan",
  });

export type JobPublicSummary = z.infer<typeof jobPublicSummarySchema>;

/** GET /api/v1/companies/:id/jobs — response 200. */
export const companyActiveJobsResponseSchema = successEnvelopeSchema(
  z.array(jobPublicSummarySchema),
);

export type CompanyActiveJobsResponse = z.infer<typeof companyActiveJobsResponseSchema>;

// ============================================================================
// PR-055 — Jobs BE: CRUD + lifecycle (draft → published → closed)
// ============================================================================

/** Cerminan enum Prisma `JobStatus` (migrasi 03, PR-011). */
export const jobStatusSchema = z.enum(["draft", "published", "closed"]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

/**
 * Cerminan enum Prisma `JobSource`. TIDAK ADA di `createJobSchema`/
 * `updateJobSchema` — setiap lowongan yang lahir lewat endpoint admin ini
 * SELALU `admin_curated` (bawaan kolom di schema.prisma); `employer` dan
 * `aggregated` menunggu jalur masuk yang belum ada di backlog MVP (posting
 * mandiri employer, agregasi eksternal).
 */
export const jobSourceSchema = z.enum(["admin_curated", "employer", "aggregated"]);

export type JobSource = z.infer<typeof jobSourceSchema>;

const judulSchema = z
  .string()
  .trim()
  .min(1, { message: "Judul lowongan wajib diisi" })
  .max(200, { message: "Judul lowongan maksimal 200 karakter" });

const deskripsiSchema = z
  .string()
  .trim()
  .min(1, { message: "Deskripsi lowongan wajib diisi" })
  .max(5000, { message: "Deskripsi maksimal 5000 karakter" });

const persyaratanSchema = z
  .string()
  .trim()
  .max(3000, { message: "Persyaratan maksimal 3000 karakter" })
  .nullable();

const wilayahSchema = z
  .string()
  .trim()
  .max(100, { message: "Maksimal 100 karakter" })
  .nullable();

/** Rupiah per bulan — bukan sen, bukan mata uang lain (skala pilot Indonesia). */
const gajiSchema = z
  .number()
  .int({ message: "Gaji harus bilangan bulat" })
  .min(0, { message: "Gaji tidak boleh negatif" })
  .nullable();

const akomodasiLowonganSchema = z
  .array(accommodationNeedSchema)
  .max(accommodationNeedSchema.options.length, { message: "Terlalu banyak pilihan akomodasi" });

const disabilitasDisambutSchema = z
  .array(disabilityTypeSchema)
  .max(disabilityTypeSchema.options.length, { message: "Terlalu banyak ragam disabilitas dipilih" });

/**
 * `salaryMin` ≤ `salaryMax` bila keduanya diisi — dipasang sekali di sini,
 * dipakai ulang oleh `createJobSchema` DAN `updateJobSchema` lewat
 * `.superRefine` (keduanya berbagi field yang sama, lihat definisi masing-masing).
 */
function periksaRentangGaji(
  nilai: { salaryMin?: number | null; salaryMax?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (
    nilai.salaryMin != null &&
    nilai.salaryMax != null &&
    nilai.salaryMin > nilai.salaryMax
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Gaji minimum tidak boleh lebih besar dari gaji maksimum",
      path: ["salaryMin"],
    });
  }
}

/**
 * Profil lowongan PUBLIK — dilihat kandidat di halaman detail (PR-059).
 *
 * `companyId` disertakan, BUKAN data perusahaan bersarang: kandidat yang butuh
 * profil perusahaan memanggil `GET /companies/:id` yang sudah ada (PR-051),
 * bukan menduplikasi bentuknya di sini. `salaryMin`/`salaryMax` null bila
 * `salaryVisible` false DI SISI SERVER (lihat `jobs.service.ts`) — field
 * `salaryVisible` itu sendiri TIDAK diekspos di sini karena preferensi
 * tampilan internal perusahaan, bukan informasi bagi kandidat. Tidak ada
 * `status`: endpoint publik hanya pernah menjawab lowongan `published` yang
 * belum `expiresAt`-nya (selain itu 404), jadi menyebut status hanya
 * mengulang apa yang sudah tersirat dari keberhasilan permintaan.
 */
export const jobPublicSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    title: z.string(),
    description: z.string(),
    requirements: z.string().nullable(),
    employmentType: employmentTypeSchema,
    workMode: workModeSchema,
    city: z.string().nullable(),
    province: z.string().nullable(),
    salaryMin: z.number().int().nullable(),
    salaryMax: z.number().int().nullable(),
    accommodations: z.array(accommodationNeedSchema),
    welcomedDisabilityTypes: z.array(disabilityTypeSchema),
    publishedAt: timestampSchema.nullable(),
    expiresAt: timestampSchema.nullable(),
  })
  .openapi({ ref: "JobPublic", description: "Profil lowongan (tampilan publik)" });

export type JobPublic = z.infer<typeof jobPublicSchema>;

/**
 * Profil lowongan lengkap — hanya admin. Menambah field internal/kurasi yang
 * tidak pernah diekspos ke `jobPublicSchema`: `salaryVisible` (preferensi
 * tampilan), `status`+`source` (state kurasi), `createdBy` (id admin
 * internal), timestamp administratif.
 */
export const jobAdminSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    title: z.string(),
    description: z.string(),
    requirements: z.string().nullable(),
    employmentType: employmentTypeSchema,
    workMode: workModeSchema,
    city: z.string().nullable(),
    province: z.string().nullable(),
    salaryMin: z.number().int().nullable(),
    salaryMax: z.number().int().nullable(),
    salaryVisible: z.boolean(),
    accommodations: z.array(accommodationNeedSchema),
    welcomedDisabilityTypes: z.array(disabilityTypeSchema),
    source: jobSourceSchema,
    status: jobStatusSchema,
    createdBy: idSchema.nullable(),
    publishedAt: timestampSchema.nullable(),
    expiresAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .openapi({ ref: "JobAdmin", description: "Profil lowongan (tampilan admin)" });

export type JobAdmin = z.infer<typeof jobAdminSchema>;

export const jobIdParamsSchema = z.object({ id: idSchema }).openapi({ ref: "JobIdParams" });

export type JobIdParams = z.infer<typeof jobIdParamsSchema>;

/**
 * POST /api/v1/admin/jobs — lowongan selalu lahir `draft` + `admin_curated`
 * (bawaan kolom `schema.prisma`, tidak ditulis ulang di sini). `accommodations`
 * boleh kosong saat draft — AC PR-055 hanya menuntutnya terisi sebelum
 * PUBLISH (lihat `POST .../publish` di `jobs.service.ts`), bukan sebelum
 * disimpan sebagai draft.
 */
export const createJobSchema = z
  .object({
    companyId: idSchema,
    title: judulSchema,
    description: deskripsiSchema,
    requirements: persyaratanSchema.default(null),
    employmentType: employmentTypeSchema,
    workMode: workModeSchema,
    city: wilayahSchema.default(null),
    province: wilayahSchema.default(null),
    salaryMin: gajiSchema.default(null),
    salaryMax: gajiSchema.default(null),
    salaryVisible: z.boolean().default(true),
    accommodations: akomodasiLowonganSchema.default([]),
    welcomedDisabilityTypes: disabilitasDisambutSchema.default([]),
  })
  .strict()
  .superRefine(periksaRentangGaji)
  .openapi({ ref: "CreateJob" });

export type CreateJob = z.infer<typeof createJobSchema>;

/**
 * PUT /api/v1/admin/jobs/:id — patch sebagian. TIDAK memuat `companyId`
 * (lowongan tidak berpindah pemilik) maupun `status` (satu-satunya jalan
 * mengubahnya adalah `POST .../publish` dan `POST .../close` — pola yang
 * sama dengan `editableInclusivityStatusSchema` di @nawasena/schemas/companies:
 * transisi status yang bisa lahir tanpa audit/event terpisah membuat endpoint
 * transisi kehilangan alasan untuk ada).
 */
export const updateJobSchema = z
  .object({
    title: judulSchema,
    description: deskripsiSchema,
    requirements: persyaratanSchema,
    employmentType: employmentTypeSchema,
    workMode: workModeSchema,
    city: wilayahSchema,
    province: wilayahSchema,
    salaryMin: gajiSchema,
    salaryMax: gajiSchema,
    salaryVisible: z.boolean(),
    accommodations: akomodasiLowonganSchema,
    welcomedDisabilityTypes: disabilitasDisambutSchema,
    expiresAt: timestampSchema.nullable(),
  })
  .partial()
  .strict()
  .superRefine(periksaRentangGaji)
  .openapi({ ref: "UpdateJob" });

export type UpdateJob = z.infer<typeof updateJobSchema>;

export const jobPublicResponseSchema = successEnvelopeSchema(jobPublicSchema);
export const jobAdminResponseSchema = successEnvelopeSchema(jobAdminSchema);
/** GET /api/v1/admin/jobs — daftar penuh, tanpa pagination (skala pilot, pola sama companies). */
export const jobAdminListResponseSchema = successEnvelopeSchema(z.array(jobAdminSchema));

/**
 * Event domain `job.published` (SDD §3.2, AC PR-055 "Publish → event
 * job.published"). TIDAK memuat isi lowongan — pola yang sama dengan
 * `jobClosedEventSchema`/`companyVerifiedEventSchema`: pelanggan yang
 * membutuhkannya membaca dari modul `jobs`, bukan mempercayai salinan yang
 * bisa basi.
 *
 * SENGAJA tanpa `.openapi({ ref })`: event domain, bukan kontrak HTTP.
 */
export const jobPublishedEventSchema = z.object({
  jobId: idSchema,
  companyId: idSchema,
  publishedAt: timestampSchema,
});

export type JobPublishedEvent = z.infer<typeof jobPublishedEventSchema>;
