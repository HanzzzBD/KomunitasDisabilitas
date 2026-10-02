// modules/admin — agregat metrik pilot (PR-080). READ-ONLY, raw SQL.
//
// LINTAS TABEL, DAN ITU DISENGAJA. Funnel per pengguna adalah satu join
// users ⨝ seeker_profiles ⨝ applications; memecahnya menjadi panggilan service
// tiap modul berarti mengoper himpunan id kohort bolak-balik. Preseden yang
// sama: `matching/repositories/embeddings.repository.ts` membaca `users` dan
// `seeker_profiles` secara read-only. Berkas ini TIDAK PERNAH menulis.
//
// KOLOM TERENKRIPSI TIDAK DISENTUH. Satu-satunya kolom `seeker_profiles` yang
// dibaca adalah `profile_embedding IS NOT NULL` (vektor, bukan ciphertext).
// Penjaganya `admin-metrics.test.ts`: daftar kolom CIPHERTEXT dibaca langsung
// dari `schema.prisma`, lalu dicocokkan dengan teks SQL di bawah — kolom
// terenkripsi baru tidak bisa diam-diam terbaca di sini.
//
// JENDELA WAKTU EKSPLISIT `[dari, sampai)`. Service menghitungnya dari periode;
// test DB memakai jendela yang hanya berisi fixture-nya sendiri, sehingga
// angka bisa dicocokkan persis di database yang dipakai bersama.
import { Prisma } from "@prisma/client";
import type { AiFeatureName } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";

export interface JendelaMetrik {
  /** `null` = sejak awal. */
  dari: Date | null;
  sampai: Date;
}

export interface BarisFunnel {
  registered: number;
  profileReady: number;
  applied: number;
  interviewed: number;
  hired: number;
}

export interface BarisAiUsage {
  feature: AiFeatureName;
  requests: number;
  tokensIn: number;
  tokensOut: number;
}

/** Status yang berarti "sudah sampai wawancara atau lebih jauh" di alur maju. */
const SAMPAI_WAWANCARA = Prisma.sql`ARRAY['interview','offered','hired']::text[]`;

function batasBawah(kolom: Prisma.Sql, dari: Date | null): Prisma.Sql {
  return dari === null ? Prisma.sql`TRUE` : Prisma.sql`${kolom} >= ${dari}`;
}

/**
 * Funnel kohort. Kohort = pencari kerja AKTIF (tidak soft-delete) yang daftar
 * dalam jendela. "Wawancara" dibaca dari status SEKARANG atau riwayat — admin
 * boleh melompati status (PR-076), dan lamaran yang sesudah wawancara ditolak
 * atau ditarik tetap pernah sampai wawancara.
 */
export function kueriFunnel(j: JendelaMetrik): Prisma.Sql {
  return Prisma.sql`
    WITH kohort AS (
      SELECT u."id"
      FROM "users" u
      WHERE u."role" = 'seeker'
        AND u."deleted_at" IS NULL
        AND ${batasBawah(Prisma.sql`u."created_at"`, j.dari)}
        AND u."created_at" < ${j.sampai}
    ),
    lamaran AS (
      SELECT a."user_id", a."status"::text AS status, a."status_history", a."hired_confirmed_at"
      FROM "applications" a
      JOIN kohort k ON k."id" = a."user_id"
    )
    SELECT
      (SELECT count(*) FROM kohort)::int AS "registered",
      (SELECT count(*) FROM kohort k
         JOIN "seeker_profiles" sp ON sp."user_id" = k."id"
        WHERE sp."profile_embedding" IS NOT NULL)::int AS "profileReady",
      (SELECT count(DISTINCT l."user_id") FROM lamaran l)::int AS "applied",
      (SELECT count(DISTINCT l."user_id") FROM lamaran l
        WHERE l.status = ANY(${SAMPAI_WAWANCARA})
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements(l."status_history") e
              WHERE e->>'to' = ANY(${SAMPAI_WAWANCARA})
           ))::int AS "interviewed",
      (SELECT count(DISTINCT l."user_id") FROM lamaran l
        WHERE l."hired_confirmed_at" IS NOT NULL)::int AS "hired"
  `;
}

/** North Star: konfirmasi diterima dalam jendela + sepanjang waktu. */
export function kueriNorthStar(j: JendelaMetrik): Prisma.Sql {
  return Prisma.sql`
    SELECT
      count(*) FILTER (
        WHERE ${batasBawah(Prisma.sql`a."hired_confirmed_at"`, j.dari)}
          AND a."hired_confirmed_at" < ${j.sampai}
      )::int AS "confirmedInPeriod",
      count(*)::int AS "confirmedTotal"
    FROM "applications" a
    WHERE a."hired_confirmed_at" IS NOT NULL
  `;
}

/** Pemakaian AI per fitur dalam jendela (baris mentah `ai_usage`, retensi 90 hari). */
export function kueriAiUsage(j: JendelaMetrik): Prisma.Sql {
  return Prisma.sql`
    SELECT
      u."feature"::text AS "feature",
      count(*)::int AS "requests",
      COALESCE(sum(u."tokens_in"), 0)::bigint AS "tokensIn",
      COALESCE(sum(u."tokens_out"), 0)::bigint AS "tokensOut"
    FROM "ai_usage" u
    WHERE ${batasBawah(Prisma.sql`u."created_at"`, j.dari)}
      AND u."created_at" < ${j.sampai}
    GROUP BY u."feature"
    ORDER BY u."feature"
  `;
}

export function createMetricsRepository(prisma: AppPrisma) {
  return {
    async funnel(j: JendelaMetrik): Promise<BarisFunnel> {
      const [baris] = await prisma.$queryRaw<BarisFunnel[]>(kueriFunnel(j));
      return baris ?? { registered: 0, profileReady: 0, applied: 0, interviewed: 0, hired: 0 };
    },

    async northStar(
      j: JendelaMetrik,
    ): Promise<{ confirmedInPeriod: number; confirmedTotal: number }> {
      const [baris] = await prisma.$queryRaw<
        Array<{ confirmedInPeriod: number; confirmedTotal: number }>
      >(kueriNorthStar(j));
      return baris ?? { confirmedInPeriod: 0, confirmedTotal: 0 };
    },

    async aiUsage(j: JendelaMetrik): Promise<BarisAiUsage[]> {
      const baris = await prisma.$queryRaw<
        Array<{ feature: AiFeatureName; requests: number; tokensIn: bigint; tokensOut: bigint }>
      >(kueriAiUsage(j));
      // bigint → number: jumlah token pilot jauh di bawah 2^53.
      return baris.map((b) => ({
        feature: b.feature,
        requests: b.requests,
        tokensIn: Number(b.tokensIn),
        tokensOut: Number(b.tokensOut),
      }));
    },
  };
}

export type MetricsRepository = ReturnType<typeof createMetricsRepository>;
