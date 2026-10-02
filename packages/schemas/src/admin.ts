// Domain: admin — metrik operasional pilot (PR-080, KPI PRD §15).
//
// SEMUA ANGKA DI SINI AGREGAT. Tidak ada id, nama, atau atribut pengguna apa
// pun — dan tidak satu pun angka diturunkan dari kolom terenkripsi (data
// disabilitas/akomodasi). Itu bukan kebetulan bentuk respons: query-nya dijaga
// test yang membaca daftar kolom CIPHERTEXT langsung dari `schema.prisma`.
//
// Keputusan owner 2026-10-02 (PR-080):
//   1. Funnel PER PENGGUNA: tiap tahap = jumlah pencari kerja dalam kohort yang
//      PERNAH mencapai tahap itu. Konversi antartahap jadi persentase bermakna.
//   2. "Profil" = profil SIAP DICOCOKKAN (baris profil + vektor profil terisi) —
//      syarat yang sama dengan feed rekomendasi.
//   3. Periode tetap `7d | 30d | semua`, bawaan 30d. Kohort = pengguna yang
//      DAFTAR dalam periode.
//   4. Tanpa tabel counter: agregasi SQL + cache 5 menit.
import "zod-openapi/extend";
import { z } from "zod";
import { timestampSchema } from "./common.js";
import { aiFeatureSchema } from "./queue.js";

export const ADMIN_METRICS_PERIODS = ["7d", "30d", "semua"] as const;

export const adminMetricsPeriodSchema = z.enum(ADMIN_METRICS_PERIODS);

export type AdminMetricsPeriod = z.infer<typeof adminMetricsPeriodSchema>;

/** GET /admin/metrics?periode= — bawaan 30 hari. */
export const adminMetricsQuerySchema = z
  .object({
    periode: adminMetricsPeriodSchema
      .default("30d")
      .openapi({ description: "Jendela kohort: 7d, 30d, atau semua" }),
  })
  .openapi({ ref: "AdminMetricsQuery" });

export type AdminMetricsQuery = z.infer<typeof adminMetricsQuerySchema>;

const cacahSchema = z.number().int().nonnegative();

/**
 * Funnel kohort. Tahap TIDAK dijamin menurun: "profil siap" dan "melamar"
 * diukur independen (seseorang bisa melamar sebelum vektornya dihitung).
 */
export const adminFunnelSchema = z
  .object({
    /** Pencari kerja (akun aktif) yang mendaftar dalam periode. */
    registered: cacahSchema,
    /** …yang profilnya siap dicocokkan (baris profil + vektor profil). */
    profileReady: cacahSchema,
    /** …yang punya ≥1 lamaran. */
    applied: cacahSchema,
    /** …yang ≥1 lamarannya pernah mencapai wawancara atau lebih jauh. */
    interviewed: cacahSchema,
    /** …yang ≥1 lamarannya dikonfirmasi diterima oleh pelamar (North Star). */
    hired: cacahSchema,
  })
  .openapi({ ref: "AdminFunnel" });

export type AdminFunnel = z.infer<typeof adminFunnelSchema>;

/** North Star (PRD §15) = jumlah `hired_confirmed_at`, bukan status `hired` dari admin. */
export const adminNorthStarSchema = z
  .object({
    /** Konfirmasi diterima yang TERJADI dalam periode (bukan kohort). */
    confirmedInPeriod: cacahSchema,
    /** Sepanjang waktu. */
    confirmedTotal: cacahSchema,
  })
  .openapi({ ref: "AdminNorthStar" });

export const adminAiUsageFeatureSchema = z
  .object({
    feature: aiFeatureSchema,
    requests: cacahSchema,
    tokensIn: cacahSchema,
    tokensOut: cacahSchema,
  })
  .openapi({ ref: "AdminAiUsageFeature" });

export const adminAiUsageSchema = z
  .object({
    /**
     * Awal jendela AI yang SEBENARNYA dihitung. Untuk `semua` ini dipotong ke
     * umur retensi `ai_usage` (90 hari) — baris yang lebih tua sudah tidak ada.
     */
    since: timestampSchema,
    /** Satu baris per fitur yang dipakai dalam jendela; fitur tanpa pemakaian tidak ikut. */
    features: z.array(adminAiUsageFeatureSchema),
  })
  .openapi({ ref: "AdminAiUsage" });

export const adminMetricsSchema = z
  .object({
    period: adminMetricsPeriodSchema,
    /** `null` = sepanjang waktu. */
    from: timestampSchema.nullable(),
    to: timestampSchema,
    /** Kapan angka ini dihitung — bisa sampai 5 menit lebih tua dari `to` permintaan (cache). */
    generatedAt: timestampSchema,
    funnel: adminFunnelSchema,
    northStar: adminNorthStarSchema,
    aiUsage: adminAiUsageSchema,
    /** Total pekerjaan di DLQ seluruh antrean; `null` = antrean tidak terjangkau saat dihitung. */
    dlqTotal: cacahSchema.nullable(),
  })
  .openapi({ ref: "AdminMetrics" });

export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

export const adminMetricsResponseSchema = z
  .object({ data: adminMetricsSchema })
  .openapi({ ref: "AdminMetricsResponse" });

export type AdminMetricsResponse = z.infer<typeof adminMetricsResponseSchema>;
