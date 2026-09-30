// Repo `match_scores` di memori — semantik angkatan SAMA dengan repo Prisma
// (PR-072): satu angkatan per pengguna, `computedAt` = id angkatan, pembaruan
// re-rank hanya mengenai angkatan yang sama. Dipakai test PR-072/PR-073.
import type { BarisFeed, MatchScoresRepository } from "../../src/modules/matching/index.js";

export interface RepoMatchScoresMemori extends MatchScoresRepository {
  /** Baris milik pengguna (referensi hidup — boleh diubah test). */
  baris(userId: string): BarisFeed[];
  /** Tiru invalidasi PR-069 (`profile.updated`). */
  hapus(userId: string): void;
}

const menurutSkor = (a: BarisFeed, b: BarisFeed) =>
  b.score - a.score || (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0);

export function repoMatchScoresMemori(): RepoMatchScoresMemori {
  const isi = new Map<string, BarisFeed[]>();
  const milik = (userId: string) => isi.get(userId) ?? [];

  return {
    baris: milik,
    hapus: (userId) => void isi.delete(userId),

    angkatanTerbaru(userId) {
      const rows = milik(userId);
      if (rows.length === 0) return Promise.resolve(null);
      return Promise.resolve({
        computedAt: new Date(Math.max(...rows.map((b) => b.computedAt.getTime()))),
        jumlah: rows.length,
        sudahRerank: rows.some((b) => b.rank !== null),
      });
    },
    bacaFeed(userId) {
      return Promise.resolve(
        [...milik(userId)]
          .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || menurutSkor(a, b))
          .map((b) => ({ ...b })),
      );
    },
    gantiAngkatan(userId, skor, computedAt) {
      isi.set(
        userId,
        skor.map((s) => ({
          jobId: s.jobId,
          score: s.skor,
          explanation: null,
          rank: null,
          computedAt,
        })),
      );
      return Promise.resolve();
    },
    topAngkatan(userId, computedAt, batas) {
      return Promise.resolve(
        milik(userId)
          .filter((b) => b.computedAt.getTime() === computedAt.getTime())
          .sort(menurutSkor)
          .slice(0, batas)
          .map((b) => ({ jobId: b.jobId, skor: b.score })),
      );
    },
    terapkanRerank(userId, computedAt, hasil) {
      let n = 0;
      for (const h of hasil) {
        const b = milik(userId).find(
          (x) => x.jobId === h.jobId && x.computedAt.getTime() === computedAt.getTime(),
        );
        if (b === undefined) continue;
        b.rank = h.rank;
        b.explanation = h.explanation;
        n++;
      }
      return Promise.resolve(n);
    },
  };
}
