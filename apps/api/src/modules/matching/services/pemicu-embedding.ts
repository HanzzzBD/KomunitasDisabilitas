// modules/matching — pelanggan event yang memicu embedding ulang (PR-069).
//
// HANDLER HANYA MENG-ENQUEUE. Perhitungannya milik worker, karena dua alasan
// yang tertulis di `core/events`: bus ini tanpa retry (kegagalan Gemini di
// dalam handler hilang begitu saja), dan tanpa persistensi (proses yang mati
// di tengah panggilan AI membawa pekerjaannya ikut mati). Dengan hanya satu
// panggilan Redis di dalam handler, jendela kehilangannya sesempit mungkin.
//
// COALESCING, BUKAN SATU JOB PER EVENT. Satu sesi menyunting profil bisa
// menerbitkan puluhan `profile.updated` (setiap keahlian, setiap riwayat
// kerja). Kuncinya satu per entitas (`coalesceId`) dan job-nya ditunda
// `jedaMs`: selama jeda itu event berikutnya diringkas ke job yang sama, jadi
// 50 event beruntun = satu panggilan embed. Event yang tiba saat job sedang
// berjalan menjadwalkan tepat satu job susulan (lihat `EnqueueOptions`).
import { QUEUE_NAME, type AiEmbedJob } from "@nawasena/schemas";
import type { EventBus } from "../../../core/events/index.js";
import { buildJobId, type QueueRegistry } from "../../../core/queue/index.js";

/**
 * Jeda bawaan sebelum embedding berjalan. Cukup panjang untuk meringkas satu
 * sesi penyuntingan formulir, cukup pendek untuk tidak terasa: feed baru
 * dihitung ulang setelah skornya dibuang, dan skor dibuang di awal job.
 */
export const JEDA_EMBED_MS = 5_000;

export interface PemicuEmbeddingDeps {
  events: EventBus;
  queues: Pick<QueueRegistry, "enqueue">;
  jedaMs?: number;
}

/** Kunci coalescing per entitas. Deterministik: entitas sama → kunci sama. */
export function kunciEmbedding(job: AiEmbedJob): string {
  return job.jenis === "profil"
    ? buildJobId("embed", "profil", job.userId)
    : buildJobId("embed", "lowongan", job.jobId);
}

/**
 * Satu-satunya cara meng-enqueue `ai-embed` — dipakai pemicu event DAN alat
 * re-embed massal (PR-069b). Keduanya WAJIB berbagi kunci coalescing: job
 * massal yang tiba bersamaan dengan suntingan pengguna harus diringkas menjadi
 * satu, bukan dua panggilan embed untuk entitas yang sama.
 */
export async function antrekanEmbedding(
  queues: Pick<QueueRegistry, "enqueue">,
  job: AiEmbedJob,
  delayMs: number,
): Promise<void> {
  await queues.enqueue(QUEUE_NAME.AI_EMBED, job, { delayMs, coalesceId: kunciEmbedding(job) });
}

export function daftarkanPemicuEmbedding(deps: PemicuEmbeddingDeps): void {
  const jedaMs = deps.jedaMs ?? JEDA_EMBED_MS;

  // `async` + `await` agar kegagalan enqueue (Redis tumbang) sampai ke bus dan
  // tercatat `error` di sana, bukan menjadi unhandled rejection.
  const antrekan = async (job: AiEmbedJob): Promise<void> => {
    await antrekanEmbedding(deps.queues, job, jedaMs);
  };

  deps.events.on("profile.updated", (p) => antrekan({ jenis: "profil", userId: p.userId }));
  deps.events.on("job.published", (p) => antrekan({ jenis: "lowongan", jobId: p.jobId }));
  deps.events.on("job.updated", (p) => antrekan({ jenis: "lowongan", jobId: p.jobId }));
}
