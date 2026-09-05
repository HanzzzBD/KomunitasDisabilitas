// Skema fondasi yang dipakai seluruh domain (SDD §11):
// - error envelope {code, message, hint?} — message Bahasa Indonesia sederhana
// - success envelope {data, meta?}
// - pagination cursor (?cursor=&limit=, meta.nextCursor)
import "zod-openapi/extend";
import { z } from "zod";

/** Kode error terdaftar — katalog lengkap menyusul di PR-007 (core/http). */
export const errorCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, {
    message: "Kode error harus UPPER_SNAKE_CASE",
  })
  .openapi({ description: "Kode error mesin, UPPER_SNAKE_CASE", example: "VALIDATION_ERROR" });

/** Envelope error seluruh API — pesan Bahasa Indonesia sederhana. */
export const errorEnvelopeSchema = z
  .object({
    code: errorCodeSchema,
    message: z.string().min(1).openapi({
      description: "Pesan untuk pengguna, Bahasa Indonesia sederhana",
      example: "Input tidak valid",
    }),
    hint: z.string().optional().openapi({
      description: "Saran perbaikan untuk pengguna",
      example: "Periksa format nomor HP Anda",
    }),
  })
  .openapi({ ref: "ErrorEnvelope", description: "Envelope error standar Nawasena" });

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** UUID (v7 di DB; validasi menerima uuid umum). */
export const idSchema = z
  .string()
  .uuid({ message: "ID tidak valid" })
  .openapi({ description: "UUID", example: "01912345-89ab-7def-8123-456789abcdef" });

export type Id = z.infer<typeof idSchema>;

/** Timestamp ISO 8601 (timestamptz di DB). */
export const timestampSchema = z
  .string()
  .datetime({ offset: true, message: "Format waktu tidak valid" })
  .openapi({ description: "Waktu ISO 8601 dengan offset", example: "2026-07-18T09:00:00+07:00" });

/** Query pagination cursor: ?cursor=&limit= (SDD §11). */
export const paginationQuerySchema = z
  .object({
    cursor: z
      .string()
      .optional()
      .openapi({ description: "Cursor halaman berikut dari meta.nextCursor" }),
    limit: z.coerce
      .number()
      .int({ message: "limit harus bilangan bulat" })
      .min(1, { message: "limit minimal 1" })
      .max(100, { message: "limit maksimal 100" })
      .default(20)
      .openapi({ description: "Jumlah item per halaman (1–100)", example: 20 }),
  })
  .openapi({ ref: "PaginationQuery" });

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Meta pagination pada response berhalaman. */
export const paginationMetaSchema = z
  .object({
    nextCursor: z
      .string()
      .nullable()
      .openapi({ description: "Cursor halaman berikut; null bila halaman terakhir" }),
  })
  .openapi({ ref: "PaginationMeta" });

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/**
 * Meta degradasi fitur AI (PR-046, ADR-005).
 *
 * `true` berarti: permintaannya BERHASIL dijawab, tetapi tanpa bantuan AI —
 * kuota habis, penyedia tumbang, atau AI sedang dimatikan. Data di `data`
 * tetap sah dan tetap melewati kontrol akses yang sama; yang hilang hanya
 * lapisan AI-nya. FE memakainya untuk menampilkan penjelasan kepada pengguna
 * (banner/tombol nonaktif), bukan untuk menyembunyikan jawabannya.
 *
 * OPSIONAL, dan itu disengaja: seluruh response yang sudah ada hari ini tidak
 * mengirim field ini dan harus tetap sah (tambahan additive, bukan breaking).
 * Ketiadaannya dibaca sama dengan `false`.
 */
export const degradedMetaSchema = z
  .object({
    degraded: z.boolean().optional().openapi({
      description: "true bila jawaban disajikan tanpa bantuan AI (jalur degradasi)",
      example: true,
    }),
  })
  .openapi({ ref: "DegradedMeta", description: "Penanda degradasi jalur AI" });

export type DegradedMeta = z.infer<typeof degradedMetaSchema>;

/**
 * Envelope sukses {data, meta?} — dipakai builder response per endpoint.
 *
 * `meta` menggabungkan pagination + degradasi, lalu `.partial()`: satu response
 * boleh membawa `nextCursor` saja, `degraded` saja, keduanya, atau tidak sama
 * sekali. `paginationMetaSchema` SENDIRI tidak dilonggarkan — di sana
 * `nextCursor` tetap wajib, sebab endpoint berhalaman yang lupa mengirimnya
 * adalah bug, bukan pilihan.
 */
export function successEnvelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data,
    meta: paginationMetaSchema.merge(degradedMetaSchema).partial().optional(),
  });
}
