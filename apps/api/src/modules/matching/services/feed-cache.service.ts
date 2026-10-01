// modules/matching — kebijakan cache + refresh feed (PR-072, SDD §7.2 langkah 4–5, §12.2).
//
// SISI API. Menjawab satu pertanyaan per permintaan feed: pakai cache, atau
// hitung ulang lalu antre re-rank? Pekerjaan LLM-nya sendiri milik worker
// (`rerank.service.ts`) — keputusan owner 2026-09-30: re-rank ASINKRON. Muat
// pertama menampilkan urutan skor deterministik; hasil re-rank tampil pada
// muat berikutnya.
//
// KEBIJAKAN (keputusan owner 2026-09-30):
//   - Cache < 24 jam dan bukan refresh paksa → cache, TANPA LLM (AC-1).
//   - Setiap panggilan LLM memotong 1 jatah `rerank` (bawaan 3/hari) —
//     re-rank otomatis (cache kedaluwarsa/terinvalidasi) maupun refresh manual.
//   - Refresh paksa saat jatah habis → cache lama TETAP dipakai + info kuota
//     (AC-3). Cache TIDAK dibuang lebih dulu: jatah diperiksa SEBELUM apa pun
//     dihitung ulang, jadi refresh yang tidak bisa dilayani tidak merusak feed
//     yang sudah ada.
//   - Tanpa cache segar dan jatah habis → skor deterministik dihitung dan
//     di-cache, tanpa re-rank (penjelasan template, PR-073).
//
// JATAH DIPOTONG DI SINI, SAAT ENQUEUE (pola `ai-extract-resume`), bukan di
// worker: info "sisa refresh" harus benar di respons yang sama. Setiap jalan
// yang membuat pengguna tidak menerima re-rank mengembalikannya.
import type { AiRerankFeedJob } from "@nawasena/schemas";
import { QUEUE_NAME } from "@nawasena/schemas";
import { withDegradation, type AiQuota, type AiQuotaReservasi } from "../../../core/ai/index.js";
import type { Logger } from "../../../core/logger/index.js";
import { buildJobId, type QueueRegistry } from "../../../core/queue/index.js";
import type { ProfilesActor } from "../../profiles/services/profiles.service.js";
import type { BarisFeed, MatchScoresRepository } from "../repositories/match-scores.repository.js";
import type { SkorLowongan } from "./skor.js";

/** Umur cache feed (SDD §7.2 langkah 5). */
export const UMUR_CACHE_FEED_MS = 24 * 60 * 60 * 1000;

/** Port antrean re-rank — dipisah supaya test tidak butuh BullMQ. */
export interface RerankJobs {
  enqueue(job: AiRerankFeedJob): Promise<void>;
}

/** Produser `ai-rerank-feed`. Satu job per angkatan — `computedAt` ada di id-nya. */
export function createRerankJobs(queues: Pick<QueueRegistry, "enqueue">): RerankJobs {
  return {
    async enqueue(job) {
      await queues.enqueue(QUEUE_NAME.AI_RERANK_FEED, job, {
        jobId: buildJobId("ai-rerank", job.userId, new Date(job.computedAt).getTime()),
      });
    },
  };
}

/**
 * Nasib re-rank pada permintaan ini:
 * - `tidak-perlu`   cache segar dipakai apa adanya;
 * - `dijadwalkan`   angkatan baru + job re-rank di antrean;
 * - `kuota-habis`   jatah `rerank` hari ini habis;
 * - `dimatikan`     `MATCHING_RERANK_ENABLED=false`;
 * - `profil-belum-siap` pengguna belum punya vektor profil (PR-073: `alasanKosong`);
 * - `tanpa-kandidat` profil siap, tetapi tidak ada kandidat yang lolos filter;
 * - `gagal-antre`   antrean menolak — feed tetap ada, jatah dikembalikan.
 */
export type StatusRerank =
  | "tidak-perlu"
  | "dijadwalkan"
  | "kuota-habis"
  | "dimatikan"
  | "profil-belum-siap"
  | "tanpa-kandidat"
  | "gagal-antre";

/**
 * Penanda nasib re-rank SATU angkatan (PR-073) — supaya muat berikutnya dari
 * cache tahu apakah angkatan tanpa `rank` itu "masih disusun" atau "memang
 * tanpa AI". Hidup di `redis.cache`: boleh hilang (evict), dan kehilangannya
 * dibaca sebagai "tidak diketahui" → feed dianggap turun (banner muncul) —
 * sisi yang aman. Tidak pernah menggagalkan permintaan.
 */
export interface PenandaRerank {
  tulis(userId: string, computedAt: Date, status: StatusRerank): Promise<void>;
  baca(userId: string): Promise<{ computedAt: Date; status: StatusRerank } | null>;
}

/** Kunci penanda. Tanpa data selain id pengguna (sudah menjadi kunci baris `match_scores`). */
export const kunciPenandaRerank = (userId: string): string => `matching:rerank:v1:${userId}`;

/** Port Redis minimum untuk penanda. */
export interface PenandaRedisLike {
  set(key: string, value: string, mode: "EX", detik: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

export function createPenandaRerank(deps: {
  redis: PenandaRedisLike;
  logger: Pick<Logger, "warn">;
}): PenandaRerank {
  const { redis, logger } = deps;
  return {
    async tulis(userId, computedAt, status) {
      try {
        await redis.set(
          kunciPenandaRerank(userId),
          `${String(computedAt.getTime())}|${status}`,
          "EX",
          UMUR_CACHE_FEED_MS / 1000,
        );
      } catch (err) {
        logger.warn({ err }, "Gagal menulis penanda re-rank — feed dianggap tanpa AI");
      }
    },
    async baca(userId) {
      try {
        const isi = await redis.get(kunciPenandaRerank(userId));
        if (isi === null) return null;
        const [ms, status] = isi.split("|");
        const waktu = Number(ms);
        if (!Number.isFinite(waktu) || status === undefined || status === "") return null;
        return { computedAt: new Date(waktu), status: status as StatusRerank };
      } catch (err) {
        logger.warn({ err }, "Gagal membaca penanda re-rank — feed dianggap tanpa AI");
        return null;
      }
    },
  };
}

export interface HasilSegarkan {
  /** `cache` = feed dari angkatan yang sudah ada; `baru` = baru dihitung. */
  sumber: "cache" | "baru";
  rerank: StatusRerank;
  /**
   * Nasib re-rank ANGKATAN yang disajikan: sama dengan `rerank` untuk angkatan
   * baru; dari penanda untuk angkatan cache. `null` = tidak diketahui.
   */
  rerankAngkatan: StatusRerank | null;
  /** Sisa jatah refresh (`rerank`) hari ini, sesudah permintaan ini. */
  sisaRefresh: number;
  /** `null` = belum ada angkatan (mis. profil belum punya vektor). */
  computedAt: Date | null;
  feed: BarisFeed[];
}

export interface FeedCacheServiceDeps {
  repo: MatchScoresRepository;
  quota: Pick<AiQuota, "periksaDanPakai" | "kembalikan" | "ringkasan">;
  jobs: RerankJobs;
  /**
   * Kandidat → hard filter → skor, terurut (PR-070/071). `null` = pengguna
   * belum punya vektor profil. Dirakit PR-073 dari `kandidatService` +
   * `penilaianService`.
   */
  hitung(actor: ProfilesActor): Promise<SkorLowongan[] | null>;
  /** `env.MATCHING_RERANK_ENABLED`. */
  aktif: boolean;
  /** Penanda nasib re-rank per angkatan (PR-073). Absen = selalu "tidak diketahui". */
  penanda?: PenandaRerank;
  logger: Pick<Logger, "error">;
  clock?: () => Date;
}

export function createFeedCacheService(deps: FeedCacheServiceDeps) {
  const { repo, quota, jobs, logger } = deps;
  const now = deps.clock ?? (() => new Date());

  async function sisaRefresh(userId: string): Promise<number> {
    const ringkas = await quota.ringkasan(userId);
    return ringkas.fitur.find((f) => f.fitur === "rerank")?.sisa ?? 0;
  }

  async function selesai(
    userId: string,
    sumber: HasilSegarkan["sumber"],
    rerank: StatusRerank,
  ): Promise<HasilSegarkan> {
    const [feed, sisa] = await Promise.all([repo.bacaFeed(userId), sisaRefresh(userId)]);
    const computedAt = feed[0]?.computedAt ?? null;
    let rerankAngkatan: StatusRerank | null = rerank;
    if (sumber === "cache") {
      const tanda = computedAt === null ? null : ((await deps.penanda?.baca(userId)) ?? null);
      rerankAngkatan =
        tanda !== null && computedAt !== null && tanda.computedAt.getTime() === computedAt.getTime()
          ? tanda.status
          : null;
    } else if (computedAt !== null) {
      await deps.penanda?.tulis(userId, computedAt, rerank);
    }
    return { sumber, rerank, rerankAngkatan, sisaRefresh: sisa, computedAt, feed };
  }

  /**
   * Potong satu jatah `rerank`, atau `null` bila habis. Penolakan kuota adalah
   * `DegradedError` — jalur turunnya "feed tanpa re-rank", persis kontrak
   * `withDegradation` (utang U-06: pemakai pertamanya di sini). Kegagalan lain
   * (Redis tumbang tanpa fail-open, bug) tetap naik apa adanya.
   */
  function pesanJatah(userId: string): Promise<AiQuotaReservasi | null> {
    return withDegradation<AiQuotaReservasi | null>(
      () => quota.periksaDanPakai({ userId, feature: "rerank" }),
      null,
    );
  }

  return {
    /**
     * Cache apa adanya, TANPA menghitung ulang dan tanpa jatah — halaman
     * lanjutan feed (cursor) PR-073: angkatannya harus sama dengan halaman 1.
     */
    baca(userId: string): Promise<HasilSegarkan> {
      return selesai(userId, "cache", "tidak-perlu");
    },

    /**
     * Feed pengguna, dari cache atau dihitung ulang. `paksa` = tombol refresh.
     */
    async segarkan(actor: ProfilesActor, opsi: { paksa: boolean }): Promise<HasilSegarkan> {
      const { userId } = actor;
      const saat = now();
      const terbaru = await repo.angkatanTerbaru(userId);
      const segar =
        terbaru !== null && saat.getTime() - terbaru.computedAt.getTime() < UMUR_CACHE_FEED_MS;

      if (segar && !opsi.paksa) return selesai(userId, "cache", "tidak-perlu");

      // Jatah LEBIH DULU, sebelum cache disentuh — lihat kepala berkas.
      const reservasi = deps.aktif ? await pesanJatah(userId) : null;
      const tanpaRerank: StatusRerank = deps.aktif ? "kuota-habis" : "dimatikan";
      if (segar && reservasi === null) return selesai(userId, "cache", tanpaRerank);

      let skor: SkorLowongan[] | null;
      try {
        skor = await deps.hitung(actor);
        if (skor !== null) await repo.gantiAngkatan(userId, skor, saat);
      } catch (err) {
        if (reservasi !== null) await quota.kembalikan(reservasi);
        throw err;
      }

      if (skor === null || skor.length === 0) {
        if (reservasi !== null) await quota.kembalikan(reservasi);
        return selesai(userId, "baru", skor === null ? "profil-belum-siap" : "tanpa-kandidat");
      }
      if (reservasi === null) return selesai(userId, "baru", tanpaRerank);

      try {
        await jobs.enqueue({
          userId,
          computedAt: saat.toISOString(),
          reservasi: {
            hari: reservasi.hari,
            userId: reservasi.userId,
            feature: "rerank",
            tercatat: reservasi.tercatat,
            global: reservasi.global,
          },
        });
      } catch (err) {
        // Feed deterministik sudah tersimpan — pengguna tetap dilayani. Yang
        // hilang hanya re-rank, jadi jatahnya pulang. Tanpa userId di log.
        await quota.kembalikan(reservasi);
        logger.error({ err }, "Gagal mengantre re-rank feed — feed tetap tanpa re-rank");
        return selesai(userId, "baru", "gagal-antre");
      }
      return selesai(userId, "baru", "dijadwalkan");
    },
  };
}

export type FeedCacheService = ReturnType<typeof createFeedCacheService>;
