// Domain: matching — feed AI Job Matching (PR-073, SDD §7.2, §12.2).
//
// KONTRAK SATU BENTUK UNTUK DUA MODE (AC PR-073). Feed dengan hasil re-rank
// LLM dan feed turunan (tanpa AI) memakai skema yang PERSIS sama: setiap item
// selalu punya `explanation` (dari LLM atau template deterministik), dan
// `meta` selalu membawa SEMUA kuncinya. Klien tidak pernah bercabang pada
// "field ini ada atau tidak" — hanya pada NILAI `degraded`/`aiMenyusun`.
//
// `meta` karena itu TIDAK memakai `successEnvelopeSchema` (yang meta-nya
// `.partial()`): di sini kelengkapan kunci justru kontraknya.
import "zod-openapi/extend";
import { z } from "zod";
import { paginationQuerySchema, timestampSchema } from "./common.js";
import { jobSearchResultSchema } from "./jobs.js";

/** Batas atas feed = jumlah kandidat SDD §7.2 (top-50). */
export const MATCHES_MAX_LIMIT = 50;

/** GET /api/v1/me/matches — query. */
export const matchesQuerySchema = paginationQuerySchema
  .extend({
    limit: z.coerce
      .number()
      .int({ message: "limit harus bilangan bulat" })
      .min(1, { message: "limit minimal 1" })
      .max(MATCHES_MAX_LIMIT, { message: `limit maksimal ${String(MATCHES_MAX_LIMIT)}` })
      .default(20)
      .openapi({ description: "Jumlah item per halaman (1–50)", example: 20 }),
  })
  .openapi({ ref: "MatchesQuery" });

export type MatchesQuery = z.infer<typeof matchesQuerySchema>;

/** POST /api/v1/me/matches/refresh — query (selalu halaman 1, jadi tanpa cursor). */
export const matchesRefreshQuerySchema = matchesQuerySchema
  .omit({ cursor: true })
  .openapi({ ref: "MatchesRefreshQuery" });

export type MatchesRefreshQuery = z.infer<typeof matchesRefreshQuerySchema>;

export const matchExplanationSourceSchema = z.enum(["ai", "template"]).openapi({
  description:
    "`ai` = kalimat dari re-rank LLM; `template` = kalimat deterministik dari data lowongan & profil",
});

export type MatchExplanationSource = z.infer<typeof matchExplanationSourceSchema>;

export const matchItemSchema = z
  .object({
    /** Kartu publik yang SAMA dengan hasil pencarian — satu komponen kartu di FE. */
    job: jobSearchResultSchema,
    score: z.number().min(0).max(1).openapi({
      description: "Skor kecocokan deterministik 0–1 (bukan urutan LLM)",
      example: 0.7312,
    }),
    explanation: z.string().min(1).openapi({
      description:
        "Satu kalimat Bahasa Indonesia sederhana. Tidak pernah menyebut kondisi/disabilitas pengguna.",
      example: "Cocok: bisa kerja dari rumah (remote), sesuai keahlian Excel.",
    }),
    explanationSource: matchExplanationSourceSchema,
  })
  .openapi({ ref: "MatchItem", description: "Satu lowongan di feed matching" });

export type MatchItem = z.infer<typeof matchItemSchema>;

export const matchesEmptyReasonSchema = z.enum(["profil-belum-siap", "tanpa-kecocokan"]).openapi({
  description:
    "`profil-belum-siap` = profil belum cukup untuk dicocokkan (arahkan ke lengkapi profil); " +
    "`tanpa-kecocokan` = profil siap, tetapi belum ada lowongan yang lolos filter",
});

export type MatchesEmptyReason = z.infer<typeof matchesEmptyReasonSchema>;

export const matchesMetaSchema = z
  .object({
    nextCursor: z.string().nullable().openapi({
      description: "Cursor halaman berikut; null bila halaman terakhir",
    }),
    degraded: z.boolean().openapi({
      description:
        "true = feed ini disajikan tanpa AI (kuota habis, AI dimatikan, atau re-rank gagal) — penjelasan template",
    }),
    aiMenyusun: z.boolean().openapi({
      description:
        "true = re-rank AI masih berjalan; muat ulang sebentar lagi untuk urutan & penjelasan AI",
    }),
    sisaRefresh: z.number().int().min(0).openapi({
      description: "Sisa refresh feed hari ini (jatah `rerank`)",
      example: 2,
    }),
    diperbaruiPada: timestampSchema.nullable().openapi({
      description: "Waktu feed ini dihitung; null bila belum ada feed",
    }),
    alasanKosong: matchesEmptyReasonSchema.nullable(),
  })
  .openapi({ ref: "MatchesMeta" });

export type MatchesMeta = z.infer<typeof matchesMetaSchema>;

/** GET /api/v1/me/matches & POST /api/v1/me/matches/refresh — response 200. */
export const matchesResponseSchema = z
  .object({
    data: z.array(matchItemSchema),
    meta: matchesMetaSchema,
  })
  .openapi({ ref: "MatchesResponse" });

export type MatchesResponse = z.infer<typeof matchesResponseSchema>;
