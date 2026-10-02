// Domain: applications — kontrak HTTP lamaran (apply PR-075, "Lamaran Saya"
// PR-076, admin PR-077a, ekspor PDP).
//
// KENAPA TERPISAH DARI `applications.ts`. Berkas itu diimpor `notifications.ts`
// (status lamaran untuk kalimat notifikasi), dan notification center ada di
// bundel AWAL web. `sideEffects: false` memangkas MODUL yang tak terpakai,
// tetapi panggilan `z.object(...).openapi(...)` tingkat-atas di modul yang
// TERPAKAI tidak bisa dibuang bundler — jadi seluruh kontrak HTTP yang dulu
// tinggal di sana ikut terunduh di halaman beranda. Itu menurunkan skor
// Lighthouse 3G landing ke 0,74 (ambang 0,75) di CI PR-077a. Di sini, berkas ini
// hanya ikut ke chunk yang benar-benar memakainya.
//
// ATURAN: skema yang dibaca pelanggan event / notifikasi tetap di
// `applications.ts`; kontrak endpoint masuk ke sini.
import "zod-openapi/extend";
import { z } from "zod";
import {
  idSchema,
  paginationMetaSchema,
  paginationQuerySchema,
  timestampSchema,
} from "./common.js";
import { sensitiveProfileSchema } from "./profiles.js";
import { resumeSchema } from "./resumes.js";
import { applicationStatusHistoryEntrySchema, applicationStatusSchema } from "./applications.js";

// ---------------------------------------------------------------------------
// Apply (PR-075) — POST /api/v1/jobs/:id/apply
// ---------------------------------------------------------------------------

/**
 * Header `Idempotency-Key` — WAJIB (keputusan owner 2026-10-01).
 *
 * Bentuknya dibatasi longgar (8–128 karakter aman-URL) alih-alih harus UUID:
 * yang dijamin header ini adalah KEUNIKAN per percobaan melamar, dan klien
 * bebas memilih cara membangkitkannya. Batas atas mencegah kunci Redis raksasa.
 */
export const idempotencyKeySchema = z
  .string({ required_error: "Header Idempotency-Key wajib diisi" })
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, {
    message: "Idempotency-Key harus 8–128 karakter huruf, angka, - atau _",
  });

/**
 * Badan permintaan melamar.
 *
 * `discloseDisability` WAJIB DAN TANPA DEFAULT. Default `false` di kolom DB
 * adalah jaring pengaman; di kontrak HTTP, ketiadaan pilihan bukan pilihan.
 * Keputusan pengungkapan harus dinyatakan klien secara eksplisit (PRD US-11) —
 * dialog PR-078 yang memastikannya bukan centang yang tersembunyi.
 *
 * `resumeId` wajib: lamaran tanpa CV tidak punya isi untuk dibaca perusahaan.
 * Klien tanpa CV diarahkan membuatnya lebih dulu (AC PR-078).
 */
export const applyJobSchema = z
  .object({
    resumeId: idSchema,
    discloseDisability: z.boolean({
      required_error: "Pilih apakah data disabilitas ikut dikirim",
    }),
  })
  .strict()
  .openapi({ ref: "ApplyJob" });

export type ApplyJob = z.infer<typeof applyJobSchema>;

/**
 * Lamaran sebagaimana dibaca PELAMARNYA.
 *
 * Snapshot pengungkapan SENGAJA tidak ikut: pelamar sudah tahu isi profilnya
 * sendiri, dan respons yang membawa data disabilitas adalah respons yang bisa
 * berakhir di cache, log proxy, atau tangkapan layar.
 */
export const applicationSchema = z
  .object({
    id: idSchema,
    jobId: idSchema,
    resumeId: idSchema.nullable(),
    discloseDisability: z.boolean(),
    status: applicationStatusSchema,
    appliedAt: timestampSchema,
  })
  .openapi({ ref: "Application" });

export type Application = z.infer<typeof applicationSchema>;

export const applicationResponseSchema = z
  .object({ data: applicationSchema })
  .openapi({ ref: "ApplicationResponse" });

export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;

/**
 * Isi `applications.disclosure_snapshot` SETELAH didekripsi (PR-075).
 *
 * Ragam disabilitas + kebutuhan akomodasi (keputusan owner 2026-10-01, PRD
 * US-11), ditambah kapan salinannya diambil. Tidak pernah dikirim ke pelamar
 * dan tidak punya ref OpenAPI — pembacanya kelak hanya jalur admin ter-audit
 * (PR-077). Ditaruh di sini supaya penulis (PR-075) dan pembaca (PR-077)
 * membaca bentuk yang SAMA.
 */
export const disclosureSnapshotSchema = sensitiveProfileSchema
  .extend({ capturedAt: timestampSchema })
  .strict()
  .openapi({ ref: "DisclosureSnapshot", description: "Salinan data yang diungkap per lamaran" });

export type DisclosureSnapshot = z.infer<typeof disclosureSnapshotSchema>;

/**
 * Satu lamaran di berkas ekspor PDP milik PELAMARNYA (PR-075, keputusan owner
 * 2026-10-01 — dibayar bersama endpoint pertama yang menulis `applications`,
 * pelajaran U-03/U-04/U-25).
 *
 * BERBEDA dari `applicationSchema` di satu hal yang disengaja: SALINAN data
 * disabilitas yang diserahkan ikut, terdekripsi. Hak akses UU PDP berarti
 * pelamar berhak tahu persis apa yang sudah diterima tiap perusahaan — dan
 * salinan itu bisa berbeda dari profilnya hari ini. `null` = tidak diungkap.
 */
export const exportApplicationSchema = applicationSchema
  .extend({
    disclosureSnapshot: disclosureSnapshotSchema.nullable(),
    // PR-076 — riwayat dan konfirmasi diterima juga milik pelamar.
    statusHistory: z.array(applicationStatusHistoryEntrySchema),
    hiredConfirmedAt: timestampSchema.nullable(),
  })
  .openapi({ ref: "ExportApplication" });

export type ExportApplication = z.infer<typeof exportApplicationSchema>;

// ---------------------------------------------------------------------------
// Lamaran Saya (PR-076) — GET /me/applications, GET /me/applications/:id,
// POST /me/applications/:id/{withdraw,confirm-hired}
// ---------------------------------------------------------------------------

export const applicationIdParamsSchema = z
  .object({ id: idSchema })
  .openapi({ ref: "ApplicationIdParams" });

export type ApplicationIdParams = z.infer<typeof applicationIdParamsSchema>;

/**
 * Ringkasan lowongan yang dilamar. Dibaca lewat service `jobs` SAAT INI, bukan
 * disalin ke lamaran: judul yang diperbaiki admin ikut terbaca benar.
 * `aktif: false` = lowongan sudah ditutup/kedaluwarsa — lamarannya tetap ada.
 */
export const applicationJobSummarySchema = z
  .object({
    title: z.string(),
    companyName: z.string(),
    aktif: z.boolean(),
  })
  .openapi({ ref: "ApplicationJobSummary" });

/**
 * Satu lamaran di daftar "Lamaran Saya".
 *
 * `job` nullable hanya sebagai jaring: FK Restrict membuat lowongan berlamaran
 * tidak bisa dihapus, jadi `null` seharusnya tidak pernah terlihat.
 */
export const myApplicationSchema = applicationSchema
  .extend({
    updatedAt: timestampSchema,
    hiredConfirmedAt: timestampSchema.nullable(),
    job: applicationJobSummarySchema.nullable(),
  })
  .openapi({ ref: "MyApplication" });

export type MyApplication = z.infer<typeof myApplicationSchema>;

/** Detail = ringkasan + riwayat status (urut kronologis, terlama dulu). */
export const myApplicationDetailSchema = myApplicationSchema
  .extend({ statusHistory: z.array(applicationStatusHistoryEntrySchema) })
  .openapi({ ref: "MyApplicationDetail" });

export type MyApplicationDetail = z.infer<typeof myApplicationDetailSchema>;

export const myApplicationListResponseSchema = z
  .object({ data: z.array(myApplicationSchema), meta: paginationMetaSchema })
  .openapi({ ref: "MyApplicationListResponse" });

export type MyApplicationListResponse = z.infer<typeof myApplicationListResponseSchema>;

export const myApplicationDetailResponseSchema = z
  .object({ data: myApplicationDetailSchema })
  .openapi({ ref: "MyApplicationDetailResponse" });

export type MyApplicationDetailResponse = z.infer<typeof myApplicationDetailResponseSchema>;

// ---------------------------------------------------------------------------
// Admin — operasional lamaran pilot (PR-077a). Admin menjembatani perusahaan
// partner (model operasi MVP), jadi ia perlu nama, kontak, dan CV pelamar —
// TETAPI tidak data disabilitas, kecuali diungkap DAN dibuka dengan alasan.
// ---------------------------------------------------------------------------

/**
 * Alasan admin — perubahan status maupun membuka data yang diungkap. Teks
 * bebas 1–200 karakter yang masuk `audit_logs` (keputusan owner 2026-10-02).
 * JANGAN tulis nama, nomor, atau kondisi siapa pun: tulis apa yang terjadi
 * ("perusahaan mengundang wawancara 10 Okt"). Pelamar tidak melihatnya.
 */
export const adminReasonSchema = z
  .string({ required_error: "Alasan wajib diisi" })
  .trim()
  .min(1, { message: "Alasan wajib diisi" })
  .max(200, { message: "Alasan maksimal 200 karakter" });

/** GET /admin/applications — filter per lowongan/status, cursor, 50 per halaman. */
export const adminApplicationListQuerySchema = paginationQuerySchema
  .extend({
    job_id: idSchema.optional().openapi({ description: "Saring per lowongan" }),
    status: applicationStatusSchema.optional().openapi({ description: "Saring per status" }),
    limit: z.coerce
      .number()
      .int({ message: "limit harus bilangan bulat" })
      .min(1, { message: "limit minimal 1" })
      .max(100, { message: "limit maksimal 100" })
      .default(50),
  })
  .openapi({ ref: "AdminApplicationListQuery" });

export type AdminApplicationListQuery = z.infer<typeof adminApplicationListQuerySchema>;

/**
 * Pelamar sebagaimana dilihat admin di DAFTAR — nama saja. `fullName: null` =
 * akun sudah dihapus pemiliknya (menunggu purge); lamarannya masih ada.
 */
export const adminApplicantSchema = z
  .object({ userId: idSchema, fullName: z.string().nullable() })
  .openapi({ ref: "AdminApplicant" });

/** Pelamar di DETAIL — ditambah kontak untuk dihubungi admin. */
export const adminApplicantContactSchema = adminApplicantSchema
  .extend({ phone: z.string().nullable(), email: z.string().nullable() })
  .openapi({ ref: "AdminApplicantContact" });

/**
 * Satu baris daftar lamaran admin. `discloseDisability` HANYA penanda — isi
 * yang diungkap tidak pernah ikut di daftar maupun detail; ia dibuka lewat
 * POST .../disclosure dengan alasan.
 */
export const adminApplicationSchema = myApplicationSchema
  .extend({ applicant: adminApplicantSchema })
  .openapi({ ref: "AdminApplication" });

export type AdminApplication = z.infer<typeof adminApplicationSchema>;

export const adminApplicationDetailSchema = myApplicationDetailSchema
  .extend({
    applicant: adminApplicantContactSchema,
    /** CV yang dilampirkan saat melamar (isi terkini). `null` = tanpa CV. */
    resume: resumeSchema.nullable(),
  })
  .openapi({ ref: "AdminApplicationDetail" });

export type AdminApplicationDetail = z.infer<typeof adminApplicationDetailSchema>;

export const adminApplicationListResponseSchema = z
  .object({ data: z.array(adminApplicationSchema), meta: paginationMetaSchema })
  .openapi({ ref: "AdminApplicationListResponse" });

export type AdminApplicationListResponse = z.infer<typeof adminApplicationListResponseSchema>;

export const adminApplicationDetailResponseSchema = z
  .object({ data: adminApplicationDetailSchema })
  .openapi({ ref: "AdminApplicationDetailResponse" });

export type AdminApplicationDetailResponse = z.infer<typeof adminApplicationDetailResponseSchema>;

/** PUT /admin/applications/:id/status. */
export const updateApplicationStatusSchema = z
  .object({ status: applicationStatusSchema, reason: adminReasonSchema })
  .strict()
  .openapi({ ref: "UpdateApplicationStatus" });

export type UpdateApplicationStatus = z.infer<typeof updateApplicationStatusSchema>;

/** POST /admin/applications/:id/disclosure — membuka salinan yang diungkap. */
export const revealDisclosureSchema = z
  .object({ reason: adminReasonSchema })
  .strict()
  .openapi({ ref: "RevealDisclosure" });

export type RevealDisclosure = z.infer<typeof revealDisclosureSchema>;

export const disclosureSnapshotResponseSchema = z
  .object({ data: disclosureSnapshotSchema })
  .openapi({ ref: "DisclosureSnapshotResponse" });

export type DisclosureSnapshotResponse = z.infer<typeof disclosureSnapshotResponseSchema>;
