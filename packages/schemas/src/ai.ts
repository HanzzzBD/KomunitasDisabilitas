// Kontrak AI Gateway yang dilihat KLIEN (ADR-012, PR-043a).
//
// Hanya bentuk yang benar-benar melintasi HTTP yang tinggal di sini. Mesin
// kuotanya sendiri (reservasi, refund, kunci Redis) adalah urusan
// `apps/api/src/core/ai` dan sengaja tidak punya padanan di paket ini —
// kontrak bukan tempat menaruh mekanisme.
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";

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

// ---------------------------------------------------------------------------
// Sesi AI CV Builder (PR-065, PRD FR-3.1, SDD §6.4).
//
// Sesi disimpan di SERVER supaya percakapan tidak hilang saat koneksi 3G putus
// (risiko T7): klien cukup mengingat satu id, dan server yang memegang seluruh
// giliran. Kontrak ini hanya BENTUK yang melintasi HTTP; mekanisme append
// (penomoran giliran, batas ukuran, konkurensi) hidup di `modules/ai`.
// ---------------------------------------------------------------------------

/**
 * Batas transkrip satu sesi — satu tempat, dibaca skema DAN repository.
 *
 * Dua batas sekaligus, sebab masing-masing menutup lubang yang berbeda:
 * jumlah giliran membatasi percakapan yang tidak pernah selesai, sedangkan
 * byte membatasi giliran-giliran panjang yang jumlahnya masih di bawah batas.
 * Angkanya longgar untuk percakapan CV yang wajar (kuota cv-chat 30 pesan/hari,
 * jadi 120 giliran = empat hari penuh) dan ketat untuk baris jsonb yang
 * dibaca ulang utuh pada setiap giliran berikutnya.
 */
export const AI_CHAT_LIMITS = {
  /** Karakter per giliran. Jawaban wawancara, bukan esai. */
  maxContentChars: 2_000,
  /** Giliran per sesi (pengguna + asisten). */
  maxTurns: 120,
  /** Ukuran jsonb transkrip dalam byte (UTF-8, bentuk teks). */
  maxTranscriptBytes: 256 * 1024,
} as const;

/** Siapa yang berbicara pada satu giliran. `system` SENGAJA tidak ada — prompt bukan transkrip. */
export const aiChatRoleSchema = z
  .enum(["user", "assistant"])
  .openapi({ description: "Pembicara giliran ini" });

export type AiChatRole = z.infer<typeof aiChatRoleSchema>;

/**
 * Satu giliran percakapan.
 *
 * `.strict()` DAN hanya empat field adalah GUARD, bukan kerapian: transkrip
 * disimpan polos (bukan kolom terenkripsi ADR-007), jadi bentuknya sendiri yang
 * menjamin tidak ada tempat bagi ragam disabilitas atau kebutuhan akomodasi
 * untuk ikut terbawa sebagai field. Yang diucapkan pengguna dengan kata-katanya
 * sendiri memang ada di `content` — dan itu miliknya, ikut diekspor, dan
 * dihapus 30 hari setelah sesi selesai.
 */
export const aiChatTurnSchema = z
  .object({
    /** Nomor urut mulai 1, diberikan SERVER — tidak pernah dari klien. */
    seq: z.number().int().positive(),
    role: aiChatRoleSchema,
    content: z.string().min(1).max(AI_CHAT_LIMITS.maxContentChars),
    at: timestampSchema,
  })
  .strict()
  .openapi({ ref: "AiChatTurn", description: "Satu giliran percakapan CV" });

export type AiChatTurn = z.infer<typeof aiChatTurnSchema>;

/**
 * `active` — percakapan masih berjalan dan bisa dilanjutkan.
 * `finalized` — sudah diekstrak menjadi draft CV (PR-067); tidak menerima
 * giliran baru, dan dihapus retensi 30 hari setelah `finalizedAt`.
 */
export const aiChatSessionStatusSchema = z
  .enum(["active", "finalized"])
  .openapi({ description: "Keadaan sesi" });

export type AiChatSessionStatus = z.infer<typeof aiChatSessionStatusSchema>;

export const aiChatSessionSchema = z
  .object({
    id: idSchema,
    status: aiChatSessionStatusSchema,
    /** Urut menurut `seq`, tanpa lubang — dijamin repository. */
    turns: z.array(aiChatTurnSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    finalizedAt: timestampSchema.nullable(),
  })
  .strict()
  .openapi({ ref: "AiChatSession", description: "Sesi AI CV Builder beserta transkripnya" });

export type AiChatSession = z.infer<typeof aiChatSessionSchema>;

/** Param `:session` — id sesi, BUKAN id pengguna. */
export const aiChatSessionParamsSchema = z.object({ session: idSchema });

export type AiChatSessionParams = z.infer<typeof aiChatSessionParamsSchema>;

/** Response `GET /ai/cv-chat/:session`. */
export const aiChatSessionResponseSchema = z
  .object({ data: aiChatSessionSchema })
  .openapi({ ref: "AiChatSessionResponse" });

export type AiChatSessionResponse = z.infer<typeof aiChatSessionResponseSchema>;
