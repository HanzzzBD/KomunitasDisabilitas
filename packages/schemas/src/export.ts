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
import { notificationSchema } from "./notifications.js";

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
  })
  .strict()
  .openapi({ ref: "DataExport", description: "Berkas ekspor data pribadi" });

export type DataExport = z.infer<typeof dataExportSchema>;

/** GET /api/v1/me/export — response 200. */
export const dataExportResponseSchema = z
  .object({ data: dataExportSchema })
  .openapi({ ref: "DataExportResponse" });

export type DataExportResponse = z.infer<typeof dataExportResponseSchema>;
