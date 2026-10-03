// Domain: admin — moderasi pengguna (PR-083, FR-6.2).
//
// BERKAS TERPISAH dari `users.ts` dengan sengaja: `users.ts` diimpor kode yang
// ikut bundel AWAL web (`meSchema`), dan panggilan `z.object(...).openapi()`
// tingkat-atas tidak bisa dipangkas bundler (pelajaran Lighthouse 3G PR-077a).
//
// Keputusan owner 2026-10-03:
//   1. Bagian "Pengguna" admin: daftar ber-cari + saring status, cursor 50.
//   2. Hanya PENCARI KERJA yang bisa ditangguhkan (admin tidak saling mengunci).
//   3. Alasan wajib (1–200, masuk audit) — tidak pernah ditampilkan ke pengguna.
import "zod-openapi/extend";
import { z } from "zod";
import {
  idSchema,
  paginationMetaSchema,
  paginationQuerySchema,
  timestampSchema,
} from "./common.js";
import { userRoleSchema } from "./auth.js";

/** Alasan moderasi — teks bebas internal 1–200 (aturan sama `adminReasonSchema`). */
export const moderationReasonSchema = z
  .string({ required_error: "Alasan wajib diisi" })
  .trim()
  .min(1, { message: "Alasan wajib diisi" })
  .max(200, { message: "Alasan maksimal 200 karakter" });

export const adminUserStatusSchema = z.enum(["aktif", "ditangguhkan"]);
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;

/** GET /admin/users?q=&status=&cursor=&limit= */
export const adminUserListQuerySchema = paginationQuerySchema
  .extend({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .openapi({ description: "Cari nama, nomor HP, atau email (sebagian, tak peka huruf)" }),
    status: adminUserStatusSchema.optional().openapi({ description: "Saring status akun" }),
    limit: z.coerce
      .number()
      .int({ message: "limit harus bilangan bulat" })
      .min(1, { message: "limit minimal 1" })
      .max(100, { message: "limit maksimal 100" })
      .default(50),
  })
  .openapi({ ref: "AdminUserListQuery" });

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

/**
 * Satu akun di mata admin. Kontak ikut (preseden PR-077a: admin menjembatani
 * perusahaan partner). TIDAK ADA data disabilitas di sini.
 */
export const adminUserSchema = z
  .object({
    id: idSchema,
    fullName: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    role: userRoleSchema,
    createdAt: timestampSchema,
    suspendedAt: timestampSchema.nullable(),
    /** Alasan internal penangguhan — hanya untuk admin. */
    suspendReason: z.string().nullable(),
  })
  .openapi({ ref: "AdminUser" });

export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserListResponseSchema = z
  .object({ data: z.array(adminUserSchema), meta: paginationMetaSchema })
  .openapi({ ref: "AdminUserListResponse" });

export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

export const adminUserResponseSchema = z
  .object({ data: adminUserSchema })
  .openapi({ ref: "AdminUserResponse" });

export const adminUserIdParamsSchema = z
  .object({ id: idSchema })
  .openapi({ ref: "AdminUserIdParams" });

export type AdminUserIdParams = z.infer<typeof adminUserIdParamsSchema>;

/** POST /admin/users/:id/suspend | /unsuspend — badan. */
export const moderateUserSchema = z
  .object({ reason: moderationReasonSchema })
  .strict()
  .openapi({ ref: "ModerateUser" });

export type ModerateUser = z.infer<typeof moderateUserSchema>;
