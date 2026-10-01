// modules/matching — re-embed massal (PR-069b, utang U-29).
//
// Pipeline PR-069 hanya bereaksi pada event BARU. Yang lahir sebelumnya (data
// seed, profil lama) dan yang job-nya gagal final (Gemini tumbang 4×, kuota
// habis) tidak punya vektor dan tidak akan pernah mendapatkannya sampai
// disunting. Alat ini mencarinya lalu meng-enqueue job `ai-embed` yang SAMA —
// tidak ada jalur embedding kedua: kuota, jejak biaya, pembacaan aman, dan
// coalescing tetap milik pipeline PR-069.
//
// TIGA BATAS YANG DISENGAJA:
//   1. `maks` per jalan, bawaannya 25% pagu global AI (keputusan owner
//      2026-09-30). Pagu itu dibagi dengan chat CV pengguna; backfill besar
//      tidak boleh menghabiskannya dalam satu pagi. Sisanya: jalankan lagi besok.
//   2. LOWONGAN LEBIH DULU. Satu vektor lowongan melayani setiap pencari kerja;
//      satu vektor profil melayani satu orang.
//   3. DIJARAKKAN (`jarakMs`). Tanpa jarak, ratusan job berjalan serentak
//      (concurrency 4) dan menabrak batas per-menit provider — lalu retry,
//      lalu DLQ, lalu kembali ke keadaan semula.
import type { QueueRegistry } from "../../../core/queue/index.js";
import type { EmbeddingsRepository } from "../repositories/embeddings.repository.js";
import { antrekanEmbedding } from "./pemicu-embedding.js";

/** Porsi pagu global harian yang boleh dipakai satu kali jalan (keputusan owner). */
export const PORSI_PAGU_EMBED_ULANG = 0.25;

/**
 * Jarak bawaan antar-job: 60 panggilan/menit, di bawah batas per-menit tier
 * gratis embedding Gemini dengan ruang untuk panggilan embed dari suntingan
 * pengguna yang berjalan bersamaan.
 */
export const JARAK_EMBED_ULANG_MS = 1_000;

export function maksEmbedUlangBawaan(paguGlobalPerHari: number): number {
  return Math.floor(paguGlobalPerHari * PORSI_PAGU_EMBED_ULANG);
}

export type JenisEmbedUlang = "semua" | "profil" | "lowongan";

export interface OpsiEmbedUlang {
  jenis: JenisEmbedUlang;
  /** Batas entitas yang di-enqueue pada jalan ini (lowongan + profil). */
  maks: number;
  /** Hanya melapor, tidak meng-enqueue apa pun. */
  kering: boolean;
  jarakMs: number;
}

/** `dipilih` = di-enqueue, atau pada mode kering: AKAN di-enqueue. */
export interface LaporanEmbedUlang {
  kering: boolean;
  maks: number;
  lowongan: { dipilih: number; tanpaKurator: number };
  profil: { dipilih: number };
  /** `true` = batas tercapai; kemungkinan masih ada yang tertinggal. */
  mungkinMasihAda: boolean;
}

export interface EmbedUlangDeps {
  repo: Pick<
    EmbeddingsRepository,
    "cariProfilTanpaVektor" | "cariLowonganTanpaVektor" | "hitungLowonganTanpaKurator"
  >;
  queues: Pick<QueueRegistry, "enqueue">;
}

export function createEmbedUlangService(deps: EmbedUlangDeps) {
  const { repo, queues } = deps;

  return {
    async jalankan(opsi: OpsiEmbedUlang): Promise<LaporanEmbedUlang> {
      const maks = Math.max(0, Math.trunc(opsi.maks));

      const lowongan =
        opsi.jenis === "profil" || maks === 0 ? [] : await repo.cariLowonganTanpaVektor(maks);
      const tanpaKurator = opsi.jenis === "profil" ? 0 : await repo.hitungLowonganTanpaKurator();

      const sisa = maks - lowongan.length;
      const profil =
        opsi.jenis === "lowongan" || sisa === 0 ? [] : await repo.cariProfilTanpaVektor(sisa);

      if (!opsi.kering) {
        // Berurutan, bukan Promise.all: urutan enqueue = urutan jarak, dan
        // Redis yang tumbang di tengah jalan menghentikan alat dengan jelas
        // alih-alih meninggalkan separuh job tanpa tahu yang mana.
        let urutan = 0;
        for (const jobId of lowongan) {
          await antrekanEmbedding(queues, { jenis: "lowongan", jobId }, urutan * opsi.jarakMs);
          urutan += 1;
        }
        for (const userId of profil) {
          await antrekanEmbedding(queues, { jenis: "profil", userId }, urutan * opsi.jarakMs);
          urutan += 1;
        }
      }

      return {
        kering: opsi.kering,
        maks,
        lowongan: { dipilih: lowongan.length, tanpaKurator },
        profil: { dipilih: profil.length },
        mungkinMasihAda: maks > 0 && lowongan.length + profil.length === maks,
      };
    },
  };
}

export type EmbedUlangService = ReturnType<typeof createEmbedUlangService>;
