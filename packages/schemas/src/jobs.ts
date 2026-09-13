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

/**
 * Kenapa sebuah lowongan ditutup.
 *
 * Hari ini hanya `expired` — penutupan otomatis oleh job retensi. Ditulis
 * sebagai enum sejak awal, bukan dihilangkan karena "cuma satu nilai": saat
 * penutupan manual lahir (Phase 08), pelanggan yang sudah mendengarkan event
 * ini perlu bisa membedakan keduanya, dan menambah field wajib belakangan akan
 * membuat setiap pelanggan lama ikut berubah.
 */
export const jobCloseReasonSchema = z.enum(["expired"]);

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
