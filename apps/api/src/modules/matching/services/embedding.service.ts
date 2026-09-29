// modules/matching — satu job `ai-embed`: baca keadaan terkini → teks → vektor (PR-069).
//
// Dipanggil processor worker; seluruh keputusan hidup DI SINI, tempat ia teruji
// (pola `cv-ekstraksi.service.ts`). Worker hanya adapter.
//
// URUTAN YANG DISENGAJA:
//   1. INVALIDASI DULU. `match_scores` entitas ini dihapus sebelum AI disentuh.
//      Bila Gemini tumbang dan job ini akhirnya gagal, skor lama TIDAK boleh
//      bertahan 24 jam seolah profilnya tidak pernah berubah — pengguna yang
//      baru mengganti kotanya harus melihat feed dihitung ulang, bukan feed lama.
//   2. BACA ULANG, bukan percaya payload. Job hanya membawa referensi; isi yang
//      di-embed adalah keadaan SAAT JOB BERJALAN (syarat coalescing).
//   3. EMBED lewat `AiClient` — kuota → provider → jejak biaya. Gagal = LEMPAR.
//      Tidak ada fallback provider (ADR-005: Groq tidak punya embedding, dan
//      vektor dari model lain tidak sebanding), tidak ada vektor pengganti.
//      BullMQ yang mengulang dengan backoff eksponensial (queue `ai-embed`).
//   4. TULIS vektor + hapus skor lagi, dalam satu transaksi.
//
// Vektor lama TIDAK dikosongkan saat embedding gagal: vektor yang sedikit basi
// masih jauh lebih berguna bagi pencocokan daripada tidak ada vektor sama sekali.
import type { AiEmbedJob } from "@nawasena/schemas";
import type { AiClient } from "../../../core/ai/index.js";
import type { Logger } from "../../../core/logger/index.js";
import type { EmbeddingsRepository } from "../repositories/embeddings.repository.js";
import {
  teksLowongan,
  teksProfil,
  type LowonganUntukEmbedding,
  type ProfilUntukEmbedding,
} from "./teks-embedding.js";

/** Lowongan beserta pemilik atribusi kuota AI-nya. */
export interface SumberLowongan extends LowonganUntukEmbedding {
  /** Kurator pembuat — `ai_usage.user_id` (keputusan owner 2026-09-30). */
  createdBy: string | null;
}

export interface EmbeddingServiceDeps {
  repo: Pick<
    EmbeddingsRepository,
    "simpanVektorProfil" | "simpanVektorLowongan" | "hapusSkorPengguna" | "hapusSkorLowongan"
  >;
  ai: Pick<AiClient, "embed">;
  /**
   * Port pembaca — dirakit composition root dari modul `profiles`/`jobs`
   * (antar-modul lewat service, ADR-001). `null` = tidak ada / tidak aktif.
   * Pembaca profil WAJIB jalur aman (`findSafeByUserId`) — lihat teks-embedding.
   */
  bacaProfil(userId: string): Promise<ProfilUntukEmbedding | null>;
  bacaLowongan(jobId: string): Promise<SumberLowongan | null>;
  logger: Pick<Logger, "error">;
}

export type HasilEmbedding =
  | { status: "tersimpan" }
  /** Tidak ada teks bermakna — vektor dikosongkan tanpa memanggil AI. */
  | { status: "dikosongkan" }
  | { status: "dilewati"; alasan: "tidak-ada" | "tidak-aktif" | "tanpa-pemilik" };

export function createEmbeddingService(deps: EmbeddingServiceDeps) {
  const { repo, ai } = deps;

  async function embed(pemilik: string, teks: string): Promise<number[]> {
    const { vector } = await ai.embed({ userId: pemilik, feature: "embed" }, { text: teks });
    return vector;
  }

  async function profil(userId: string): Promise<HasilEmbedding> {
    await repo.hapusSkorPengguna(userId);

    const bahan = await deps.bacaProfil(userId);
    if (bahan === null) return { status: "dilewati", alasan: "tidak-ada" };

    const teks = teksProfil(bahan);
    if (teks === "") {
      // Profil yang dikosongkan pemiliknya tidak boleh terus dicocokkan dengan
      // vektor dari isi yang sudah ia hapus.
      await repo.simpanVektorProfil(userId, null);
      return { status: "dikosongkan" };
    }

    // Pengguna sendiri yang membayar kuota embed profilnya (jatah `embed`).
    const vektor = await embed(userId, teks);
    const ada = await repo.simpanVektorProfil(userId, vektor);
    return ada ? { status: "tersimpan" } : { status: "dilewati", alasan: "tidak-ada" };
  }

  async function lowongan(jobId: string): Promise<HasilEmbedding> {
    await repo.hapusSkorLowongan(jobId);

    const bahan = await deps.bacaLowongan(jobId);
    if (bahan === null) return { status: "dilewati", alasan: "tidak-aktif" };
    if (bahan.createdBy === null) {
      // `ai_usage.user_id` NOT NULL: tanpa kurator tidak ada yang bisa memikul
      // jatahnya. `error`, bukan `warn` — lowongan tayang tanpa vektor tidak
      // akan pernah muncul di feed matching, dan tidak ada yang akan mencoba
      // lagi sampai lowongannya disunting.
      deps.logger.error(
        { jobId },
        "Lowongan tanpa kurator (createdBy kosong) — embedding dilewati, lowongan tidak masuk feed",
      );
      return { status: "dilewati", alasan: "tanpa-pemilik" };
    }

    const teks = teksLowongan(bahan);
    if (teks === "") {
      await repo.simpanVektorLowongan(jobId, null);
      return { status: "dikosongkan" };
    }

    const vektor = await embed(bahan.createdBy, teks);
    const ada = await repo.simpanVektorLowongan(jobId, vektor);
    return ada ? { status: "tersimpan" } : { status: "dilewati", alasan: "tidak-ada" };
  }

  return {
    /** Jalankan satu job. Melempar bila AI gagal — BullMQ yang mengulang. */
    jalankan(job: AiEmbedJob): Promise<HasilEmbedding> {
      return job.jenis === "profil" ? profil(job.userId) : lowongan(job.jobId);
    },
  };
}

export type EmbeddingService = ReturnType<typeof createEmbeddingService>;
