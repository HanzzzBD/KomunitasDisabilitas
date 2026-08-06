// Domain: users — profil akun dasar (PR-020). GET/PUT /api/v1/me.
//
// Konvensi (lihat README):
// - nama skema camelCase + suffix Schema: updateMeSchema
// - tipe PascalCase via z.infer: UpdateMe
// - component OpenAPI PascalCase via .openapi({ ref: "..." })
//
// Pesan validasi ditulis dalam Bahasa Indonesia sederhana dan MENYEBUT apa yang
// harus diperbaiki — pesan ini dibacakan screen reader apa adanya, jadi "Nama
// tidak valid" tidak cukup: pengguna tidak tahu harus mengubah apa.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";
import { phoneNumberSchema, userRoleSchema } from "./auth.js";

/**
 * Nama lengkap. Batas 80 karakter mengikuti kolom DB yang tidak dibatasi —
 * angkanya dipilih agar muat di kartu profil tanpa terpotong, bukan karena
 * keterbatasan penyimpanan.
 *
 * Minimal 2 karakter, bukan 1: satu huruf hampir selalu salah ketik, dan nama
 * kosong sudah punya maknanya sendiri di sistem ini (akun hasil login OTP yang
 * belum onboarding).
 */
export const fullNameSchema = z
  .string()
  .trim()
  .min(2, { message: "Nama minimal 2 huruf" })
  .max(80, { message: "Nama maksimal 80 huruf" })
  .openapi({ description: "Nama lengkap pengguna", example: "Rina Pratiwi" });

/**
 * Email. `toLowerCase()` disengaja: alamat email tidak peka huruf besar-kecil
 * pada bagian domain, dan menyimpan dua bentuk berbeda akan membuat unique
 * index parsial (migrasi 06) menganggap keduanya alamat yang berlainan —
 * persis celah yang index itu tutup.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: "Format email belum benar, contoh: nama@contoh.com" })
  .max(254, { message: "Email terlalu panjang" })
  .openapi({ description: "Alamat email pengguna", example: "rina@contoh.id" });

/**
 * Profil akun yang dikembalikan ke PEMILIKNYA sendiri.
 *
 * Yang sengaja TIDAK ada di sini: `tokenVersion` (mekanik internal sesi),
 * `googleId` (identitas provider, bukan urusan pengguna), `deletedAt`, dan
 * `lastActiveAt`. `role` ADA karena FE memakainya memilih navigasi — itulah
 * arti "selektif": bukan menyembunyikan semuanya, melainkan memilih sadar.
 */
export const meSchema = z
  .object({
    id: idSchema,
    fullName: z.string().openapi({ description: "Kosong bila belum diisi saat onboarding" }),
    email: emailSchema.nullable(),
    phone: phoneNumberSchema.nullable(),
    role: userRoleSchema,
    createdAt: timestampSchema,
  })
  .openapi({ ref: "Me", description: "Profil akun milik pengguna yang sedang masuk" });

export type Me = z.infer<typeof meSchema>;

/**
 * PUT /api/v1/me — body.
 *
 * SEMANTIK YANG DIPILIH SADAR: `email` yang TIDAK dikirim berarti "jangan
 * ubah"; `email: null` berarti "kosongkan". PUT murni akan memperlakukan field
 * yang hilang sebagai penghapusan — dan pada endpoint yang kelak bertambah
 * field, itu berarti klien lama diam-diam menghapus data yang tidak ia ketahui.
 * Bentuk ini menukar kemurnian dengan keselamatan.
 */
export const updateMeSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema.nullable().optional().openapi({
      description: "Tidak dikirim = tidak diubah; null = dikosongkan",
    }),
  })
  .openapi({ ref: "UpdateMe", description: "Perbarui profil akun sendiri" });

export type UpdateMe = z.infer<typeof updateMeSchema>;

/** GET/PUT /api/v1/me — response 200. */
export const meResponseSchema = z.object({ data: meSchema }).openapi({ ref: "MeResponse" });

export type MeResponse = z.infer<typeof meResponseSchema>;
