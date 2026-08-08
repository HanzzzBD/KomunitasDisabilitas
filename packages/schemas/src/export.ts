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
export const dataExportSchema = z
  .object({
    formatVersion: z.literal(EXPORT_FORMAT_VERSION),
    /** Kapan berkas ini dibuat — pembaca perlu tahu seberapa lama data ini. */
    exportedAt: timestampSchema,
    account: exportAccountSchema,
  })
  .strict()
  .openapi({ ref: "DataExport", description: "Berkas ekspor data pribadi" });

export type DataExport = z.infer<typeof dataExportSchema>;

/** GET /api/v1/me/export — response 200. */
export const dataExportResponseSchema = z
  .object({ data: dataExportSchema })
  .openapi({ ref: "DataExportResponse" });

export type DataExportResponse = z.infer<typeof dataExportResponseSchema>;
