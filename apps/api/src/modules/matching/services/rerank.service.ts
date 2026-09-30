// modules/matching — re-rank LLM satu angkatan feed (PR-072, SDD §7.2 langkah 4).
//
// SISI WORKER (processor `ai-rerank-feed`). Dirakit `apps/worker` dengan
// pembaca profil/lowongan yang disuntik composition root — modul ini tidak
// pernah menyentuh repository modul lain (ADR-001).
//
// ALUR: top-20 angkatan dari `match_scores` (whitelist) → profil aman +
// lowongan aktif → SATU panggilan `rerank.v1` → urai (ref sah saja) → tulis
// `rank` + `explanation` ke baris angkatan yang sama.
//
// DATA SENSITIF: tidak ada. Profil dibaca lewat jalur aman (`findSafeByUserId`
// + keahlian/pengalaman) — kolom disabilitas/akomodasi pengguna tidak pernah
// meninggalkan PostgreSQL di jalur ini. Hard filter akomodasi sudah terjadi di
// API (PR-071) sebelum baris-baris ini ditulis.
//
// JATAH: sudah dipotong API saat enqueue (`job.reservasi`). Dikembalikan bila
// pengguna tidak menerima apa pun: angkatan basi, profil/lowongan hilang, atau
// provider gagal pada percobaan terakhir (`kembalikanBila` yang menilai
// kelayakannya). Gagal SEBELUM percobaan terakhir → dilempar, BullMQ mengulang.
import type { AiRerankFeedJob } from "@nawasena/schemas";
import {
  AiProviderError,
  rerankV1,
  type AiClient,
  type AiQuota,
  type PromptTemplate,
  type RerankInput,
  type RerankKeluaran,
} from "../../../core/ai/index.js";
import type { Logger } from "../../../core/logger/index.js";
import type { MatchScoresRepository } from "../repositories/match-scores.repository.js";
import {
  JUMLAH_RERANK,
  susunMasukanRerank,
  uraiHasilRerank,
  type LowonganUntukRerank,
  type ProfilUntukRerank,
} from "./rerank.js";

export type HasilJobRerank =
  | { status: "selesai"; diperbarui: number; berpenjelasan: number }
  | { status: "dilewati"; sebab: "angkatan-basi" | "profil-hilang" | "tanpa-lowongan-aktif" }
  | { status: "gagal"; kode: string };

export interface RerankServiceDeps {
  repo: MatchScoresRepository;
  ai: Pick<AiClient, "prompt">;
  quota: Pick<AiQuota, "kembalikan" | "kembalikanBila">;
  /** Jalur AMAN modul profiles — `null` = profil tidak ada. */
  bacaProfil(userId: string): Promise<ProfilUntukRerank | null>;
  /** Lowongan AKTIF di antara `ids` (modul jobs); urutan tak dijamin. */
  bacaLowongan(ids: readonly string[]): Promise<LowonganUntukRerank[]>;
  /** Disuntik di test; bawaan `rerank.v1`. */
  template?: PromptTemplate<RerankInput, RerankKeluaran>;
  logger: Pick<Logger, "warn">;
}

export function createRerankService(deps: RerankServiceDeps) {
  const { repo, ai, quota, logger } = deps;
  const template = deps.template ?? rerankV1;

  return {
    async jalankan(
      job: AiRerankFeedJob,
      opsi: { percobaanTerakhir: boolean },
    ): Promise<HasilJobRerank> {
      const computedAt = new Date(job.computedAt);
      const lewati = async (
        sebab: Extract<HasilJobRerank, { status: "dilewati" }>["sebab"],
      ): Promise<HasilJobRerank> => {
        await quota.kembalikan(job.reservasi);
        return { status: "dilewati", sebab };
      };

      const top = await repo.topAngkatan(job.userId, computedAt, JUMLAH_RERANK);
      if (top.length === 0) return lewati("angkatan-basi");

      const [profil, lowongan] = await Promise.all([
        deps.bacaProfil(job.userId),
        deps.bacaLowongan(top.map((t) => t.jobId)),
      ]);
      if (profil === null) return lewati("profil-hilang");

      // Urutan skor dipertahankan; lowongan yang sudah tidak aktif dibuang.
      const peta = new Map(lowongan.map((l) => [l.id, l]));
      const aktif = top
        .map((t) => peta.get(t.jobId))
        .filter((l): l is LowonganUntukRerank => l !== undefined);
      if (aktif.length === 0) return lewati("tanpa-lowongan-aktif");

      const masukan = susunMasukanRerank(profil, aktif);
      let keluaran: RerankKeluaran;
      try {
        const jawaban = await ai.prompt(
          { userId: job.userId, feature: "rerank", reservasi: job.reservasi },
          template,
          masukan.input,
        );
        keluaran = jawaban.data;
      } catch (err) {
        if (!opsi.percobaanTerakhir) throw err;
        await quota.kembalikanBila(job.reservasi, err);
        const kode = err instanceof AiProviderError ? err.code : "TERJADI_KESALAHAN";
        // Kode saja — tanpa userId, tanpa isi prompt/jawaban.
        logger.warn({ kode }, "Re-rank feed gagal — feed tetap memakai urutan skor");
        return { status: "gagal", kode };
      }

      const hasil = uraiHasilRerank(
        keluaran,
        masukan.refKeJobId,
        aktif.map((l) => l.id),
      );
      const diperbarui = await repo.terapkanRerank(job.userId, computedAt, hasil);
      return {
        status: "selesai",
        diperbarui,
        berpenjelasan: hasil.filter((h) => h.explanation !== null).length,
      };
    },
  };
}

export type RerankService = ReturnType<typeof createRerankService>;
