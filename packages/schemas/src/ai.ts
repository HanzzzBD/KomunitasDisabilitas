// Kontrak AI Gateway yang dilihat KLIEN (ADR-012, PR-043a).
//
// Hanya bentuk yang benar-benar melintasi HTTP yang tinggal di sini. Mesin
// kuotanya sendiri (reservasi, refund, kunci Redis) adalah urusan
// `apps/api/src/core/ai` dan sengaja tidak punya padanan di paket ini —
// kontrak bukan tempat menaruh mekanisme.
import "zod-openapi/extend";
import { z } from "zod";
import { degradedMetaSchema, idSchema, timestampSchema } from "./common.js";

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
 * `finalizing` — sedang diekstrak menjadi draft CV oleh worker (PR-067); tidak
 * menerima giliran baru. Berakhir `finalized`, atau kembali `active` dengan
 * `extractionFailedAt` terisi bila ekstraksi gagal (keputusan owner 2026-09-28).
 * `finalized` — sudah menjadi draft CV (`resumeId`); tidak menerima giliran
 * baru, dan dihapus retensi 30 hari setelah `finalizedAt`.
 */
export const aiChatSessionStatusSchema = z
  .enum(["active", "finalizing", "finalized"])
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
    /**
     * Draft CV hasil ekstraksi (PR-067). `null` sebelum `finalized` — dan juga
     * sesudahnya bila draft itu kemudian dihapus pemiliknya.
     */
    resumeId: idSchema.nullable(),
    /**
     * Ekstraksi TERAKHIR gagal (PR-067): kapan, dan kode sebabnya (mis.
     * `AI_INVALID_OUTPUT`, `BATAS_CV_TERCAPAI`). Keduanya `null` bila belum
     * pernah gagal atau finalize berikutnya sedang/sudah berjalan. Klien
     * memakainya untuk menawarkan formulir manual dengan transkrip terlampir.
     */
    extractionFailedAt: timestampSchema.nullable(),
    extractionError: z.string().nullable(),
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

// ---------------------------------------------------------------------------
// Endpoint percakapan AI CV Builder (PR-066).
//
// `POST /ai/cv-chat` menjawab `text/event-stream`, bukan JSON. Skema di bawah
// menuliskan BENTUK DATA tiap event supaya klien (PR-068) punya satu sumber:
//
//   event `giliran` — data: `AiChatTurn` (JSON). Dikirim DUA kali per
//                      permintaan: giliran pengguna setelah tersimpan, lalu
//                      giliran asisten setelah jawaban utuh tersimpan.
//   event `token`   — data: potongan teks mentah (BUKAN JSON). Hanya untuk
//                      tampilan sementara; sumber kebenarannya `giliran`.
//   event `error`   — data: `AiCvChatErrorEvent` (JSON), lalu aliran ditutup.
//   event `selesai` — data kosong; aliran ditutup normal.
//
// Setiap event bernomor (`id:`); sambung ulang lewat
// `GET /ai/cv-chat/:session/stream` dengan header `Last-Event-Id`.
// ---------------------------------------------------------------------------

/** Body `POST /ai/cv-chat`. */
export const aiCvChatRequestSchema = z
  .object({
    /** Sesi dari `POST /ai/cv-chat/sessions` — harus sesi AKTIF milik pemanggil. */
    sessionId: idSchema,
    message: z
      .string()
      .trim()
      .min(1, { message: "Pesan tidak boleh kosong" })
      .max(AI_CHAT_LIMITS.maxContentChars, {
        message: `Pesan paling panjang ${String(AI_CHAT_LIMITS.maxContentChars)} karakter`,
      }),
  })
  .strict()
  .openapi({ ref: "AiCvChatRequest" });

export type AiCvChatRequest = z.infer<typeof aiCvChatRequestSchema>;

/**
 * Muatan event `error`. Amplop yang sama dengan error HTTP ({code, message,
 * hint}) ditambah dua penanda:
 *
 * - `degraded: true` — kegagalan ini PUNYA jalur turun: klien beralih ke
 *   formulir CV biasa dengan pesan jujur, bukan menampilkan galat (ADR-005).
 *   Dipakai untuk kuota habis dan AI yang tidak tersedia sebelum menjawab.
 * - `retryAfterSeconds` — kapan jatah dibuka lagi (kuota habis).
 */
export const aiCvChatErrorEventSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    hint: z.string(),
    degraded: z.boolean().optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  })
  .openapi({ ref: "AiCvChatErrorEvent" });

export type AiCvChatErrorEvent = z.infer<typeof aiCvChatErrorEventSchema>;

/** Response `POST /ai/cv-chat/sessions` — 201 sesi baru, 200 sesi aktif yang ada. */
export const aiCvChatSessionStartResponseSchema = aiChatSessionResponseSchema;

// ---------------------------------------------------------------------------
// Finalize → draft CV (PR-067).
// ---------------------------------------------------------------------------

/**
 * Response `POST /ai/cv-chat/:session/finalize`.
 *
 * 202 + `finalizing` = ekstraksi berjalan di worker; hasilnya dibaca lewat
 * `GET /ai/cv-chat/:session` (poll) atau notifikasi `resume.draft_ai_siap` /
 * `resume.draft_ai_gagal`. 200 + `finalized` = sudah selesai sebelumnya —
 * finalize ganda aman dan tidak memotong kuota lagi.
 */
export const aiCvChatFinalizeResultSchema = z
  .object({
    sessionId: idSchema,
    status: z.enum(["finalizing", "finalized"]),
    resumeId: idSchema.nullable(),
  })
  .strict()
  .openapi({ ref: "AiCvChatFinalizeResult" });

export type AiCvChatFinalizeResult = z.infer<typeof aiCvChatFinalizeResultSchema>;

export const aiCvChatFinalizeResponseSchema = z
  .object({ data: aiCvChatFinalizeResultSchema })
  .openapi({ ref: "AiCvChatFinalizeResponse" });

// ---------------------------------------------------------------------------
// Sederhanakan teks (PR-087, Gap G1, SDD §4.3 & §11).
// ---------------------------------------------------------------------------

/**
 * Bagian lowongan yang bisa disederhanakan — satu per permintaan, supaya
 * hasilnya menggantikan tepat satu blok di halaman dan cache-nya per blok.
 */
export const aiSimplifyBagianLowonganSchema = z.enum(["deskripsi", "persyaratan"]);

export type AiSimplifyBagianLowongan = z.infer<typeof aiSimplifyBagianLowonganSchema>;

/**
 * Body `POST /ai/simplify-text`.
 *
 * RUJUKAN, BUKAN TEKS (keputusan owner 2026-10-04). Klien menyebut KONTEN mana
 * yang ingin disederhanakan; server membaca teksnya sendiri dari lowongan
 * aktif. Body yang membawa teks bebas akan menjadikan endpoint ini LLM
 * serba-guna bagi siapa pun yang punya akun, dan memaksa cache per pengguna.
 *
 * Discriminated union atas `sumber` walau anggotanya baru satu: sumber konten
 * berikutnya (mis. profil perusahaan) menambah anggota, bukan mengubah bentuk.
 */
export const aiSimplifyTextRequestSchema = z
  .discriminatedUnion("sumber", [
    z
      .object({
        sumber: z.literal("lowongan"),
        id: idSchema,
        bagian: aiSimplifyBagianLowonganSchema,
      })
      .strict(),
  ])
  .openapi({ ref: "AiSimplifyTextRequest" });

export type AiSimplifyTextRequest = z.infer<typeof aiSimplifyTextRequestSchema>;

/**
 * Kenapa tidak ada versi sederhana. Klien memilih kalimat penjelasannya dari
 * sini — "coba lagi besok" hanya benar untuk kuota.
 *
 * - `kuota_habis` — jatah `simplify_text` hari ini habis (atau penghitung kuota
 *   tak terbaca; satu kode, alasan yang sama dengan `KUOTA_AI_HABIS`).
 * - `ai_tidak_tersedia` — penyedia AI gagal/tak dikonfigurasi, ATAU hasilnya
 *   ditolak penjaga fakta (angka yang tidak ada di teks asli). Pengguna tidak
 *   perlu tahu bedanya: keduanya berarti "baca teks aslinya".
 * - `dimatikan` — fitur dimatikan operator (`AI_SIMPLIFY_ENABLED=false`).
 */
export const aiSimplifyAlasanDegradasiSchema = z.enum([
  "kuota_habis",
  "ai_tidak_tersedia",
  "dimatikan",
]);

export type AiSimplifyAlasanDegradasi = z.infer<typeof aiSimplifyAlasanDegradasiSchema>;

/**
 * Hasil penyederhanaan. TEPAT SATU dari `teks`/`alasan` terisi — `teks` berisi
 * teks polos (tanpa HTML/markdown) yang WAJIB dirender sebagai teks.
 *
 * Tidak ada penanda "dari cache": entri cache fitur ini dipakai bersama semua
 * pengguna, dan penanda itu akan memberi tahu pemanggil apakah ORANG LAIN
 * pernah menyederhanakan konten yang sama (catatan `AiPromptResponse`).
 */
export const aiSimplifyTextResultSchema = z
  .union([
    z.object({ teks: z.string().min(1), alasan: z.null() }).strict(),
    z.object({ teks: z.null(), alasan: aiSimplifyAlasanDegradasiSchema }).strict(),
  ])
  .openapi({ ref: "AiSimplifyTextResult" });

export type AiSimplifyTextResult = z.infer<typeof aiSimplifyTextResultSchema>;

/**
 * Response `POST /ai/simplify-text` — SELALU 200 untuk permintaan yang sah.
 * Degradasi bukan kegagalan (aturan 1 tabel pola degradasi PR-046): `alasan`
 * terisi dan `meta.degraded: true`; teks asli tetap milik klien.
 */
export const aiSimplifyTextResponseSchema = z
  .object({
    data: aiSimplifyTextResultSchema,
    meta: degradedMetaSchema.optional(),
  })
  .openapi({ ref: "AiSimplifyTextResponse" });

export type AiSimplifyTextResponse = z.infer<typeof aiSimplifyTextResponseSchema>;
