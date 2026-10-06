// Domain: users — ekspor data pribadi (PR-022, hak portabilitas UU PDP §8.7).
//
// KONTRAK INI ADALAH JANJI KEPADA PENGGUNA, bukan bentuk internal. Berkas yang
// diunduh seseorang hari ini harus tetap bisa dibaca alat yang sama tahun depan,
// jadi `formatVersion` naik SETIAP kali bentuknya berubah dengan cara yang bisa
// membingungkan pembacanya.
//
// PENAMBAHAN BAGIAN BARU ADALAH PERUBAHAN ADITIF: pembaca lama yang mengabaikan
// key tak dikenal tetap bekerja, jadi menambah `resumes` kelak TIDAK menaikkan
// versi. Yang menaikkan versi adalah mengubah arti atau membuang field.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";
import { phoneNumberSchema, userRoleSchema } from "./auth.js";
import { emailSchema } from "./users.js";
import {
  disclosureDefaultSchema,
  educationSchema,
  experienceSchema,
  sensitiveProfileSchema,
  skillSchema,
} from "./profiles.js";
import { accessibilityProfileSchema } from "./accessibility.js";
import { notificationChannelPrefsSchema, notificationSchema } from "./notifications.js";
import { aiChatSessionSchema, aiQuotaFeatureSchema } from "./ai.js";
import { resumeSchema } from "./resumes.js";
import { exportApplicationSchema } from "./applications-api.js";
import {
  communityMembershipSchema,
  communityPostSchema,
  communityCommentSchema,
  communityReportReceiptSchema,
} from "./community.js";

/** Versi bentuk berkas ekspor. Naik hanya saat perubahan TIDAK aditif. */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * Cara pengguna masuk ke akunnya. Diturunkan dari kolom `phone`/`google_id`,
 * dan menggantikan keduanya sebagai identitas provider.
 *
 * `google_id` SENGAJA tidak pernah diekspor mentah: ia pengenal opaque milik
 * Google yang tidak berarti apa pun bagi pengguna, sekaligus tautan kredensial.
 * Yang benar-benar ingin diketahui seseorang saat membaca ekspornya adalah
 * "bagaimana saya masuk ke akun ini" — itulah yang dijawab field ini.
 */
export const authMethodSchema = z
  .enum(["otp", "google"])
  .openapi({ description: "Cara masuk yang tersedia untuk akun ini" });

/** Bagian `account` — identitas dasar pemilik ekspor. */
export const exportAccountSchema = z
  .object({
    id: idSchema,
    fullName: z.string(),
    email: emailSchema.nullable(),
    /** Apakah kepemilikan alamat sudah dibuktikan (PR-020a). */
    emailVerified: z.boolean(),
    phone: phoneNumberSchema.nullable(),
    role: userRoleSchema,
    createdAt: timestampSchema,
    authMethods: z.array(authMethodSchema),
  })
  .openapi({ ref: "ExportAccount", description: "Data identitas akun" });

export type ExportAccount = z.infer<typeof exportAccountSchema>;

/**
 * Isi berkas ekspor.
 *
 * `.strict()` DISENGAJA dan bukan sekadar kehati-hatian. Bagian ekspor dirakit
 * dari registry kontributor (`modules/users/services/export.service.ts`), jadi
 * modul baru bisa mendaftarkan bagiannya tanpa menyentuh berkas ini. Objek zod
 * yang longgar akan MEMBUANG bagian itu diam-diam — pengguna menerima ekspor
 * yang kekurangan datanya tanpa satu pun sinyal. Dengan `.strict()`, kontributor
 * yang belum punya tempat di kontrak membuat permintaan GAGAL, dan yang
 * menambahkannya dipaksa menuliskannya di sini juga.
 */
/**
 * Bagian `profile` — profil karier beserta seluruh sub-entitasnya (PR-038).
 *
 * SATU bagian, bukan empat. Riwayat kerja, pendidikan, dan keahlian tidak
 * berarti apa-apa lepas dari profil yang memilikinya, dan memecahnya menjadi
 * empat key sejajar membuat pembaca berkas harus merakit ulang hubungan yang
 * sudah jelas di kepalanya.
 *
 * `sensitive` IKUT DIEKSPOR, dalam bentuk terdekripsi. Itu memang inti hak
 * portabilitas: data yang paling dilindungi adalah data yang paling berhak
 * dibawa pemiliknya. Yang menjaganya adalah endpoint-nya sendiri — `/me/export`
 * hanya melayani pemilik sesi — dan `null` di sini berarti platform memang tidak
 * sedang memegang data disabilitas orang ini, bukan bahwa ekspornya disunat.
 */
export const exportProfileSchema = z
  .object({
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    openToRemote: z.boolean(),
    disclosureDefault: disclosureDefaultSchema,
    consentSensitiveAt: timestampSchema.nullable(),
    sensitive: sensitiveProfileSchema.nullable(),
    experiences: z.array(experienceSchema),
    educations: z.array(educationSchema),
    skills: z.array(skillSchema),
  })
  .openapi({ ref: "ExportProfile", description: "Profil karier lengkap milik pemiliknya" });

export type ExportProfile = z.infer<typeof exportProfileSchema>;

/**
 * Satu baris jejak pemakaian AI (utang U-05, dibayar PR-066).
 *
 * Hanya METADATA biaya — fitur, provider, cacah token, versi prompt, waktu.
 * Isi prompt dan jawaban model memang TIDAK PERNAH disimpan di `ai_usage`
 * (kontrak `AiUsagePeristiwa`), jadi berkas ini tidak menyembunyikan apa pun:
 * ia menunjukkan semua yang platform catat tentang pemakaian AI orang ini.
 */
export const exportAiUsageSchema = z
  .object({
    feature: aiQuotaFeatureSchema,
    provider: z.string(),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    promptVersion: z.string().nullable(),
    createdAt: timestampSchema,
  })
  .strict()
  .openapi({ ref: "ExportAiUsage", description: "Satu catatan pemakaian fitur AI" });

export type ExportAiUsage = z.infer<typeof exportAiUsageSchema>;

export const dataExportSchema = z
  .object({
    formatVersion: z.literal(EXPORT_FORMAT_VERSION),
    /** Kapan berkas ini dibuat — pembaca perlu tahu seberapa lama data ini. */
    exportedAt: timestampSchema,
    account: exportAccountSchema,
    /**
     * WAJIB, bukan opsional. Setiap akun punya profil — barisnya mungkin belum
     * pernah ditulis, tetapi bentuk kosongnya tetap ada (`SEEKER_PROFILE_KOSONG`).
     * Field opsional di sini berarti ekspor tanpa profil tetap lolos validasi,
     * dan itu persis kegagalan senyap yang `.strict()` di bawah ada untuk cegah.
     */
    profile: exportProfileSchema,
    /**
     * Preferensi aksesibilitas (utang U-03, dibayar 2026-09-05).
     *
     * Dipakai ULANG dari `accessibilityProfileSchema`, bukan bentuk ekspor
     * tersendiri: apa yang dibaca pengguna di berkas ekspornya harus sama persis
     * dengan yang ia lihat di pengaturannya. Bentuk kedua yang bebas menyimpang
     * adalah cara ekspor mulai berbohong tanpa ada yang mengubah apa pun.
     *
     * WAJIB, dengan alasan yang sama seperti `profile`: setiap akun punya
     * preferensi — barisnya mungkin belum pernah ditulis, tetapi bentuk
     * kosongnya tetap ada (tujuh `null` = "belum memilih", yang BERBEDA dari
     * "memilih bawaan"; lihat accessibility.service.ts).
     */
    accessibility: accessibilityProfileSchema,
    /**
     * Preferensi kanal notifikasi (PR-049b).
     *
     * Ikut sejak kolomnya lahir, bukan menyusul — pelajaran U-03/U-04, tempat
     * dua bagian data pengguna tidak ikut terekspor selama lima phase tanpa satu
     * pun penjaga menyalak. Bentuknya dipakai ULANG dari
     * `notificationChannelPrefsSchema` dengan alasan yang sama seperti
     * `accessibility`: yang dibaca pengguna di berkas ekspornya harus sama persis
     * dengan yang ia lihat di pengaturannya.
     *
     * `null` pada sebuah kanal berarti "belum pernah memilih" — dan berkas ekspor
     * TIDAK mengklaim pilihan yang tidak pernah dibuat orangnya.
     */
    notificationChannels: notificationChannelPrefsSchema,
    /**
     * Riwayat notifikasi (utang U-04, dibayar 2026-09-05).
     *
     * Kalimatnya DIRENDER saat ekspor dibuat, memakai renderer yang sama dengan
     * yang melayani layar — bukan disalin dari kolom. Akibatnya berkas ekspor
     * memuat kalimat versi terbaru, termasuk untuk notifikasi lama; itu memang
     * yang benar, sebab yang disimpan sistem ini memang `type` + referensi,
     * bukan kalimat.
     *
     * TIDAK BERPAGINASI, dan itu keputusan sadar: ekspor PDP yang memotong
     * riwayat bukan ekspor yang lengkap. Konsekuensinya berkas tumbuh bersama
     * riwayat pengguna — dicatat sebagai U-16.
     */
    notifications: z.array(notificationSchema),
    /**
     * Transkrip AI CV Builder (PR-065).
     *
     * Ikut sejak tabelnya lahir, bukan menyusul — pelajaran U-03/U-04 yang sama
     * dengan `notificationChannels`. Isinya kata-kata pengguna sendiri tentang
     * riwayat kerjanya, jadi justru inilah jenis data yang paling jelas menjadi
     * miliknya. Bentuknya dipakai ULANG dari `aiChatSessionSchema`: yang dibaca
     * di berkas ekspor sama persis dengan yang dilayani `GET /ai/cv-chat/:session`.
     *
     * Hanya sesi yang MASIH ADA — sesi yang sudah lewat retensi (30 hari)
     * memang sudah tidak dipegang platform, dan berkas ekspor tidak mengklaim
     * sebaliknya.
     */
    aiChatSessions: z.array(aiChatSessionSchema),
    /**
     * Jejak pemakaian AI (utang U-05, dibayar PR-066 — endpoint yang menulis
     * baris `ai_usage` pertama). Hanya baris yang MASIH ADA: rinciannya dihapus
     * retensi 90 hari (SDD §6.4), dan agregat bulanannya tidak memuat
     * identitas siapa pun — jadi memang bukan data milik orang ini.
     */
    aiUsage: z.array(exportAiUsageSchema),
    /**
     * CV milik pengguna (utang U-25, dibayar 2026-10-01). Pemicunya menyala sejak
     * PR-060 (pengguna bisa membuat CV), dan selama itu CV tidak ikut berkas ini
     * tanpa satu pun penjaga menyalak — pola U-03/U-04 yang sama.
     *
     * Bentuknya dipakai ULANG dari `resumeSchema`: yang diunduh sama persis
     * dengan yang dilayani `GET /me/resumes/:id`, termasuk isinya. Berkas PDF
     * sendiri TIDAK ikut (artefak turunan dari isi yang sama; `pdfUrl` menunjuk
     * keberadaannya).
     */
    resumes: z.array(resumeSchema),
    /**
     * Lamaran (PR-075) — ditulis bersama endpoint pertama yang bisa melamar,
     * bukan menyusul (pelajaran U-03/U-04/U-25, keputusan owner 2026-10-01).
     * Termasuk SALINAN data disabilitas yang diungkap per lamaran; lihat
     * `exportApplicationSchema`.
     */
    applications: z.array(exportApplicationSchema),
    employerMemberships: z
      .array(
        z
          .object({
            companyId: idSchema,
            role: z.enum(["owner", "recruiter"]),
            createdAt: timestampSchema,
          })
          .strict(),
      )
      .default([]),
    /** PR-114: all memberships owned by this session, including blocked and archived rooms. */
    communityMemberships: z.array(communityMembershipSchema),
    communityPosts: z.array(
      communityPostSchema.omit({ author: true, moderation: true, commentCount: true }),
    ),
    communityComments: z.array(communityCommentSchema.omit({ author: true, moderation: true })),
    communityReports: z.array(
      communityReportReceiptSchema
        .extend({ reason: z.string(), resolvedAt: timestampSchema.nullable() })
        .strict(),
    ),
  })
  .strict()
  .openapi({ ref: "DataExport", description: "Berkas ekspor data pribadi" });

export type DataExport = z.infer<typeof dataExportSchema>;

/** GET /api/v1/me/export — response 200. */
export const dataExportResponseSchema = z
  .object({ data: dataExportSchema })
  .openapi({ ref: "DataExportResponse" });

export type DataExportResponse = z.infer<typeof dataExportResponseSchema>;
