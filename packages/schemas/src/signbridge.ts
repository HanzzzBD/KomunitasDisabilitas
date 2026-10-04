// Domain: signbridge — kamus video BISINDO (SignBridge v1, PR-084, ADR-010).
//
// Keputusan owner 2026-10-03:
//   1. Kolom media menyimpan KEY object storage (`sign-videos/{id}/...`), bukan
//      URL. Bucket privat (ADR-020): publik menerima URL presigned berumur pendek.
//   2. Video, thumbnail, caption boleh kosong selama draft; publish menuntut
//      video + caption (.vtt) + transkrip (422, juga CHECK di DB).
//   3. Kategori = daftar TERTUTUP di sini, bukan enum DB — kategori baru cukup
//      lewat review skema, tanpa migrasi.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";

export const signVideoCategorySchema = z
  .enum(
    ["salam", "perkenalan", "wawancara", "tempat_kerja", "akomodasi", "waktu", "angka", "umum"],
    {
      errorMap: () => ({ message: "Kategori tidak dikenal" }),
    },
  )
  .openapi({ ref: "SignVideoCategory" });

export type SignVideoCategory = z.infer<typeof signVideoCategorySchema>;

export const signVideoStatusSchema = z
  .enum(["draft", "published"])
  .openapi({ ref: "SignVideoStatus" });

export type SignVideoStatus = z.infer<typeof signVideoStatusSchema>;

const phraseSchema = z
  .string({ required_error: "Frasa wajib diisi" })
  .trim()
  .min(1, { message: "Frasa wajib diisi" })
  .max(120, { message: "Frasa maksimal 120 karakter" });

/** Transkrip = padanan teks isi video, dibaca pengguna netra & yang tidak memutar video. */
const transcriptSchema = z
  .string()
  .trim()
  .min(1, { message: "Transkrip tidak boleh kosong" })
  .max(2000, { message: "Transkrip maksimal 2000 karakter" });

const durationSchema = z
  .number()
  .int({ message: "Durasi harus bilangan bulat (detik)" })
  .min(1, { message: "Durasi minimal 1 detik" })
  .max(600, { message: "Durasi maksimal 600 detik" });

/**
 * Key object storage. Bentuknya di sini hanya disaring kasar; kepemilikan
 * (`sign-videos/{id}/` milik video ini) dan ekstensi per jenis media diperiksa
 * service, karena keduanya butuh id dari path.
 */
const mediaKeySchema = z
  .string()
  .trim()
  .min(1, { message: "Key media tidak boleh kosong" })
  .max(1024, { message: "Key media maksimal 1024 karakter" });

/** POST /admin/sign-videos — draft baru; media menyusul lewat PUT (PR-085). */
export const createSignVideoSchema = z
  .object({
    phrase: phraseSchema,
    category: signVideoCategorySchema,
    transcript: transcriptSchema.optional(),
    durationS: durationSchema.optional(),
  })
  .strict()
  .openapi({ ref: "CreateSignVideo" });

export type CreateSignVideo = z.infer<typeof createSignVideoSchema>;

/** PUT /admin/sign-videos/:id — patch sebagian; `null` mengosongkan kolom opsional. */
export const updateSignVideoSchema = z
  .object({
    phrase: phraseSchema.optional(),
    category: signVideoCategorySchema.optional(),
    transcript: transcriptSchema.nullable().optional(),
    durationS: durationSchema.nullable().optional(),
    videoKey: mediaKeySchema.nullable().optional(),
    thumbnailKey: mediaKeySchema.nullable().optional(),
    captionKey: mediaKeySchema.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim" })
  .openapi({ ref: "UpdateSignVideo" });

export type UpdateSignVideo = z.infer<typeof updateSignVideoSchema>;

export const signVideoIdParamsSchema = z
  .object({ id: idSchema })
  .openapi({ ref: "SignVideoIdParams" });

export type SignVideoIdParams = z.infer<typeof signVideoIdParamsSchema>;

/**
 * Jenis media + tipe MIME yang diterima + batas ukuran (PR-085, keputusan owner
 * 2026-10-03: video 50 MB, caption 200 KB, thumbnail 1 MB). SATU sumber untuk
 * server (presign & verifikasi objek) dan formulir web (validasi dini).
 */
export const SIGN_VIDEO_MEDIA = {
  video: {
    kolom: "videoKey",
    maksByte: 50 * 1024 * 1024,
    tipe: { "video/mp4": "mp4", "video/webm": "webm" },
  },
  caption: {
    kolom: "captionKey",
    maksByte: 200 * 1024,
    tipe: { "text/vtt": "vtt" },
  },
  thumbnail: {
    kolom: "thumbnailKey",
    maksByte: 1024 * 1024,
    tipe: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  },
} as const;

export const signVideoMediaKindSchema = z
  .enum(["video", "caption", "thumbnail"])
  .openapi({ ref: "SignVideoMediaKind" });

export type SignVideoMediaKind = z.infer<typeof signVideoMediaKindSchema>;

/** POST /admin/sign-videos/presign — izin unggah satu berkas untuk satu entri. */
export const signVideoPresignSchema = z
  .object({
    videoId: idSchema,
    kind: signVideoMediaKindSchema,
    contentType: z.string().trim().min(1).max(100),
    size: z
      .number()
      .int({ message: "Ukuran berkas harus bilangan bulat (byte)" })
      .min(1, { message: "Berkas kosong" }),
  })
  .strict()
  .superRefine((v, ctx) => {
    const aturan = SIGN_VIDEO_MEDIA[v.kind];
    if (!(v.contentType in aturan.tipe)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentType"],
        message: `Tipe berkas tidak diterima untuk ${v.kind}`,
      });
    }
    if (v.size > aturan.maksByte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["size"],
        message: `Berkas ${v.kind} maksimal ${Math.round(aturan.maksByte / 1024)} KB`,
      });
    }
  })
  .openapi({ ref: "SignVideoPresign" });

export type SignVideoPresign = z.infer<typeof signVideoPresignSchema>;

export const signVideoPresignResultSchema = z
  .object({
    /** Disimpan lewat PUT `/admin/sign-videos/:id` SETELAH unggah berhasil. */
    key: z.string(),
    uploadUrl: z.string().url(),
    method: z.literal("PUT"),
    /** Kirim apa adanya — bagian dari signature. */
    headers: z.record(z.string()),
    expiresAt: timestampSchema,
  })
  .openapi({ ref: "SignVideoPresignResult" });

export type SignVideoPresignResult = z.infer<typeof signVideoPresignResultSchema>;

export const signVideoPresignResponseSchema = z
  .object({ data: signVideoPresignResultSchema })
  .openapi({ ref: "SignVideoPresignResponse" });

/** Bentuk admin — key mentah, termasuk draft yang belum lengkap. */
export const signVideoAdminSchema = z
  .object({
    id: idSchema,
    phrase: z.string(),
    category: signVideoCategorySchema.nullable(),
    status: signVideoStatusSchema,
    videoKey: z.string().nullable(),
    thumbnailKey: z.string().nullable(),
    captionKey: z.string().nullable(),
    transcript: z.string().nullable(),
    durationS: z.number().int().nullable(),
    createdBy: idSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .openapi({ ref: "SignVideoAdmin" });

export type SignVideoAdmin = z.infer<typeof signVideoAdminSchema>;

export const signVideoAdminResponseSchema = z
  .object({ data: signVideoAdminSchema })
  .openapi({ ref: "SignVideoAdminResponse" });

export const signVideoAdminListResponseSchema = z
  .object({ data: z.array(signVideoAdminSchema) })
  .openapi({ ref: "SignVideoAdminListResponse" });

/** GET /sign-videos?query=&category=&limit= */
export const signVideoSearchQuerySchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(100, { message: "Kata kunci maksimal 100 karakter" })
      .optional()
      .openapi({ description: "Cari frasa (full-text bahasa Indonesia)" }),
    category: signVideoCategorySchema.optional(),
    limit: z.coerce
      .number()
      .int({ message: "limit harus bilangan bulat" })
      .min(1, { message: "limit minimal 1" })
      .max(50, { message: "limit maksimal 50" })
      .default(24),
  })
  .openapi({ ref: "SignVideoSearchQuery" });

export type SignVideoSearchQuery = z.infer<typeof signVideoSearchQuerySchema>;

/**
 * Satu entri kamus publik. Hanya video PUBLISHED — jadi video, caption, dan
 * transkrip selalu ada. URL presigned kedaluwarsa pada `mediaExpiresAt`;
 * klien mengambil ulang daftar bila pemutaran dimulai setelahnya.
 */
export const signVideoPublicSchema = z
  .object({
    id: idSchema,
    phrase: z.string(),
    category: signVideoCategorySchema.nullable(),
    transcript: z.string(),
    durationS: z.number().int().nullable(),
    videoUrl: z.string().url(),
    captionUrl: z.string().url(),
    thumbnailUrl: z.string().url().nullable(),
    mediaExpiresAt: timestampSchema,
  })
  .openapi({ ref: "SignVideoPublic" });

export type SignVideoPublic = z.infer<typeof signVideoPublicSchema>;

export const signVideoSearchResponseSchema = z
  .object({ data: z.array(signVideoPublicSchema) })
  .openapi({ ref: "SignVideoSearchResponse" });

export type SignVideoSearchResponse = z.infer<typeof signVideoSearchResponseSchema>;

/** GET /sign-videos/:id — satu entri terbit (halaman detail PR-086). */
export const signVideoPublicResponseSchema = z
  .object({ data: signVideoPublicSchema })
  .openapi({ ref: "SignVideoPublicResponse" });
