// modules/matching — cache feed `match_scores` (PR-072, SDD §6.1 butir 3, §7.2 langkah 5).
//
// SATU ANGKATAN PER PENGGUNA. Setiap hitung ulang MENGGANTI seluruh baris
// pengguna itu dalam satu transaksi, dengan `computed_at` yang SAMA untuk
// semua barisnya. `computed_at` karena itu berfungsi sebagai id angkatan:
// job re-rank membawa nilainya, dan pembaruan yang ditulis job itu hanya
// mengenai baris dengan `computed_at` yang sama. Angkatan yang sudah diganti
// (refresh lain menang, profil disunting → invalidasi PR-069) tidak tersentuh
// hasil re-rank yang basi.
//
// `score` = skor deterministik PR-071; `rank` + `explanation` = hasil LLM.
// Keduanya NULL sampai re-rank selesai (atau selamanya bila kuota habis/AI mati
// — PR-073 lalu memakai template deterministik).
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";

export interface BarisFeed {
  jobId: string;
  score: number;
  explanation: string | null;
  rank: number | null;
  computedAt: Date;
}

export interface RingkasanAngkatan {
  computedAt: Date;
  jumlah: number;
  sudahRerank: boolean;
}

export interface SkorUntukCache {
  jobId: string;
  skor: number;
}

export interface PembaruanRerank {
  jobId: string;
  rank: number;
  explanation: string | null;
}

export interface MatchScoresRepository {
  /** Angkatan terbaru pengguna; `null` = belum ada cache. */
  angkatanTerbaru(userId: string): Promise<RingkasanAngkatan | null>;
  /** Feed dari cache: `rank` menaik (NULL terakhir), lalu `score` menurun, lalu `job_id`. */
  bacaFeed(userId: string): Promise<BarisFeed[]>;
  /** Ganti seluruh cache pengguna dengan satu angkatan baru (atomik). */
  gantiAngkatan(userId: string, skor: readonly SkorUntukCache[], computedAt: Date): Promise<void>;
  /** `batas` teratas angkatan `computedAt` menurut skor. Kosong = angkatan sudah diganti. */
  topAngkatan(userId: string, computedAt: Date, batas: number): Promise<SkorUntukCache[]>;
  /** Tulis hasil re-rank HANYA ke baris angkatan `computedAt`. Mengembalikan jumlah baris. */
  terapkanRerank(
    userId: string,
    computedAt: Date,
    hasil: readonly PembaruanRerank[],
  ): Promise<number>;
}

export function createMatchScoresRepository(prisma: AppPrisma): MatchScoresRepository {
  return {
    async angkatanTerbaru(userId) {
      const [ringkas] = await prisma.$queryRaw<
        Array<{ computed_at: Date | null; jumlah: bigint; sudah_rerank: boolean | null }>
      >(Prisma.sql`
        SELECT MAX("computed_at") AS computed_at,
               COUNT(*) AS jumlah,
               BOOL_OR("rank" IS NOT NULL) AS sudah_rerank
        FROM "match_scores" WHERE "user_id" = ${userId}::uuid`);
      if (ringkas === undefined || ringkas.computed_at === null) return null;
      return {
        computedAt: ringkas.computed_at,
        jumlah: Number(ringkas.jumlah),
        sudahRerank: ringkas.sudah_rerank === true,
      };
    },

    async bacaFeed(userId) {
      const rows = await prisma.matchScore.findMany({
        where: { userId },
        orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { score: "desc" }, { jobId: "asc" }],
        select: { jobId: true, score: true, explanation: true, rank: true, computedAt: true },
      });
      return rows.map((r) => ({ ...r, score: r.score.toNumber() }));
    },

    async gantiAngkatan(userId, skor, computedAt) {
      await prisma.$transaction([
        prisma.matchScore.deleteMany({ where: { userId } }),
        prisma.matchScore.createMany({
          data: skor.map((s) => ({
            userId,
            jobId: s.jobId,
            score: new Prisma.Decimal(s.skor.toFixed(4)),
            computedAt,
          })),
        }),
      ]);
    },

    async topAngkatan(userId, computedAt, batas) {
      const rows = await prisma.matchScore.findMany({
        where: { userId, computedAt },
        orderBy: [{ score: "desc" }, { jobId: "asc" }],
        take: batas,
        select: { jobId: true, score: true },
      });
      return rows.map((r) => ({ jobId: r.jobId, skor: r.score.toNumber() }));
    },

    async terapkanRerank(userId, computedAt, hasil) {
      if (hasil.length === 0) return 0;
      const jumlah = await prisma.$transaction(
        hasil.map((h) =>
          prisma.matchScore.updateMany({
            where: { userId, jobId: h.jobId, computedAt },
            data: { rank: h.rank, explanation: h.explanation },
          }),
        ),
      );
      return jumlah.reduce((total, r) => total + r.count, 0);
    },
  };
}
