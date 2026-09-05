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
