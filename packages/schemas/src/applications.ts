// Domain: applications — skema lamaran. Diisi bertahap per PR fitur terkait;
// ikuti konvensi README (camelCase+Schema, tipe via z.infer, ref PascalCase).
//
// PR-047 MENGISI BAGIAN PERTAMANYA, DAN ITU BUKAN URUTAN YANG KELIRU. Modul
// `applications` sendiri baru lahir di Phase 12; yang lahir hari ini adalah
// PELANGGANNYA — notifikasi in-app. Kontrak event ditaruh di sini, bukan di
// `core/events` maupun di dalam modul notifications, karena alasan yang sama
// dengan `jobClosedEventSchema`: penerbit dan pelanggan harus membaca bentuk
// yang SAMA, dan bentuk itu adalah kontrak lintas modul — bukan detail internal
// pihak mana pun.
//
// Konsekuensinya disengaja: saat Phase 12 menulis penerbitnya, ia tidak boleh
// merancang bentuk payload-nya sendiri. Bentuknya sudah ada, sudah punya
// pelanggan, dan mengubahnya akan terbaca sebagai perubahan kontrak.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";
import { sensitiveProfileSchema } from "./profiles.js";

/**
 * Status pipeline lamaran — cerminan enum `ApplicationStatus` di schema.prisma.
 *
 * Ditulis ulang di sini DENGAN SENGAJA meski sudah ada di Prisma: paket ini
 * dipakai web dan mobile, yang tidak punya `@prisma/client` dan tidak boleh
 * punya. Kesepadanan keduanya dijaga test (`notifications-kontrak.test.ts`),
 * bukan harapan.
 */
export const applicationStatusSchema = z.enum([
  "submitted",
  "viewed",
  "in_review",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

// SENGAJA tanpa `.openapi({ ref })` untuk kedua event di bawah: ini event
// DOMAIN, bukan kontrak HTTP — tidak ada satu pun endpoint yang
// mengembalikannya, dan menandainya sebagai komponen OpenAPI akan
// menempatkannya di dokumen yang dibaca klien sebagai janji API.

/**
 * Event domain `application.submitted` — lamaran baru terkirim (PR-076).
 *
 * TIDAK memuat judul lowongan maupun nama perusahaan. Alasannya sama dengan
 * `jobClosedEventSchema`: payload yang membawa salinan data akan basi begitu
 * barisnya berubah. Pelanggan yang membutuhkannya membaca lewat service
 * pemilik datanya — di sini, `applicationId` adalah kuncinya.
 */
export const applicationSubmittedEventSchema = z.object({
  applicationId: idSchema,
  /** Pelamar — penerima notifikasi. */
  userId: idSchema,
  jobId: idSchema,
  submittedAt: timestampSchema,
});

export type ApplicationSubmittedEvent = z.infer<typeof applicationSubmittedEventSchema>;

/**
 * Event domain `application.status_changed` — status pipeline berpindah (PR-078).
 *
 * `from` OPSIONAL: transisi pertama datang dari status awal `submitted` yang
 * ditulis DB sebagai default, dan penerbit tidak selalu punya nilai sebelumnya
 * di tangan. Pelanggan yang butuh membedakan "baru masuk" dari "berpindah"
 * memeriksa ketiadaannya, bukan menebak dari `to`.
 */
export const applicationStatusChangedEventSchema = z.object({
  applicationId: idSchema,
  /** Pelamar — penerima notifikasi, BUKAN pihak yang mengubah statusnya. */
  userId: idSchema,
  jobId: idSchema,
  from: applicationStatusSchema.optional(),
  to: applicationStatusSchema,
  changedAt: timestampSchema,
});

export type ApplicationStatusChangedEvent = z.infer<typeof applicationStatusChangedEventSchema>;

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
  .strict();

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
  .extend({ disclosureSnapshot: disclosureSnapshotSchema.nullable() })
  .openapi({ ref: "ExportApplication" });

export type ExportApplication = z.infer<typeof exportApplicationSchema>;
