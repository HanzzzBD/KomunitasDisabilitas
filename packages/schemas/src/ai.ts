// Kontrak AI Gateway yang dilihat KLIEN (ADR-012, PR-043a).
//
// Hanya bentuk yang benar-benar melintasi HTTP yang tinggal di sini. Mesin
// kuotanya sendiri (reservasi, refund, kunci Redis) adalah urusan
// `apps/api/src/core/ai` dan sengaja tidak punya padanan di paket ini —
// kontrak bukan tempat menaruh mekanisme.
import { z } from "zod";

/**
 * Fitur AI yang punya jatah harian.
 *
 * Sengaja DIURUT SAMA dengan `AI_FEATURES` di `core/ai/quota-config.ts`.
 * Keduanya memang dua sumber, dan itu disadari: jalur boot fail-fast di
 * `apps/api/src/index.ts` tidak boleh menyeret paket ini. Yang menjaga
 * keduanya tetap seiring bukan kedisiplinan, melainkan penjaga tipe
 * compile-time di `apps/api/__tests__/ai-quota-kontrak.test.ts` — bila salah
 * satu berubah sendirian, typecheck merah.
 */
export const aiQuotaFeatureSchema = z.enum([
  "cv_chat",
  "cv_finalize",
  "cv_check",
  "simplify_text",
  "interview_sim",
  "rerank",
  "embed",
]);

export type AiQuotaFeatureName = z.infer<typeof aiQuotaFeatureSchema>;

/** Jatah satu fitur pada hari WIB yang sedang berjalan. */
export const aiQuotaFeatureUsageSchema = z
  .object({
    fitur: aiQuotaFeatureSchema,
    /** Jatah harian. `0` berarti fiturnya dimatikan, bukan "habis". */
    batas: z.number().int().nonnegative(),
    terpakai: z.number().int().nonnegative(),
    sisa: z.number().int().nonnegative(),
  })
  .openapi({ ref: "AiQuotaFeatureUsage" });

export type AiQuotaFeatureUsage = z.infer<typeof aiQuotaFeatureUsageSchema>;

/**
 * Ringkasan jatah AI milik pemanggil sendiri.
 *
 * `globalTersedia` sengaja hanya BOOLEAN. Sisa anggaran bersama adalah data
 * operasional (`/internal/*`, PR-103): menyebutkan angkanya kepada pengguna
 * sama dengan memberi tahu penyalahguna kapan anggaran sedang tipis.
 */
export const aiQuotaSummarySchema = z
  .object({
    /** Tanggal WIB yang sedang dihitung, `YYYY-MM-DD`. */
    hari: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Detik tersisa sampai jatah berikutnya dibuka (tengah malam WIB). */
    resetDalamDetik: z.number().int().nonnegative(),
    fitur: z.array(aiQuotaFeatureUsageSchema),
    globalTersedia: z.boolean(),
  })
  .openapi({ ref: "AiQuotaSummary" });

export type AiQuotaSummary = z.infer<typeof aiQuotaSummarySchema>;

/** Response `GET /ai/quota` — `{ data: ... }`, sama seperti seluruh API. */
export const aiQuotaResponseSchema = z
  .object({ data: aiQuotaSummarySchema })
  .openapi({ ref: "AiQuotaResponse" });

export type AiQuotaResponse = z.infer<typeof aiQuotaResponseSchema>;
