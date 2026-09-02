// modules/ai — recorder `ai_usage` (PR-043b, SDD §7.1 langkah 5).
//
// Implementasi port `AiUsageRecorder` milik `core/ai`. Ia menerjemahkan satu
// peristiwa pemakaian menjadi satu job antrean; penulisan barisnya sendiri
// terjadi di worker (`ai-usage-record`), jauh dari permintaan HTTP yang sedang
// ditunggu pengguna.
//
// KONTRAK YANG DIJAGA BERKAS INI: **`catat` TIDAK PERNAH menolak.** Seluruh
// badannya dibungkus satu try/catch yang berakhir dengan resolve normal. Bukan
// karena kegagalannya tidak penting — ia dicatat `error` dan menaikkan metrik —
// melainkan karena jejak biaya adalah kepentingan kita, bukan kepentingan
// pengguna yang jawabannya sudah jadi dan tokennya sudah terbakar.
import { QUEUE_NAME, aiUsageRecordJobSchema } from "@nawasena/schemas";
import type { AiUsagePeristiwa, AiUsageRecorder } from "../../../core/ai/index.js";
import type { Logger } from "../../../core/logger/index.js";
import { buildJobId, type QueueRegistry } from "../../../core/queue/index.js";

/**
 * Nama metrik kegagalan enqueue. Konstanta karena ia dipakai di dua tempat yang
 * tidak boleh melenceng: pemanggil `increment` di sini, dan penjaganya di test.
 */
export const METRIK_ENQUEUE_GAGAL = "ai_usage.enqueue_gagal";

export interface AiUsageRecorderDeps {
  /** Registry antrean — satu-satunya jalur produser job (core/queue). */
  queues: Pick<QueueRegistry, "enqueue">;
  logger: Pick<Logger, "error">;
  /**
   * Backend metrik produksi belum ada (ADR-017); pola repo hari ini adalah
   * `logger.warn({ metric })` yang dirakit di composition root. Opsional supaya
   * pemanggil yang tidak punya sink tidak dipaksa mengarang satu.
   */
  metrics?: { increment(name: string): void };
}

export function createAiUsageRecorder(deps: AiUsageRecorderDeps): AiUsageRecorder {
  return {
    async catat(peristiwa: AiUsagePeristiwa): Promise<void> {
      try {
        // Divalidasi DI SISI PRODUSEN, bukan hanya di worker. Payload cacat yang
        // baru ketahuan di konsumen sudah terlanjur melintasi batas proses dan
        // hanya bisa dilihat sebagai job DLQ tanpa konteks pemanggilnya.
        const job = aiUsageRecordJobSchema.parse({
          id: peristiwa.id,
          userId: peristiwa.userId,
          feature: peristiwa.feature,
          provider: peristiwa.provider,
          tokensIn: peristiwa.tokensIn,
          tokensOut: peristiwa.tokensOut,
          ...(peristiwa.promptVersion === undefined
            ? {}
            : { promptVersion: peristiwa.promptVersion }),
          createdAt: peristiwa.createdAt.toISOString(),
        });

        // `jobId` deterministik = lapisan anti-duplikat PERTAMA (BullMQ menolak
        // job berid sama). Lapisan kedua, dan yang sesungguhnya, adalah primary
        // key `ai_usage.id` — lihat repository.
        await deps.queues.enqueue(QUEUE_NAME.AI_USAGE_RECORD, job, {
          jobId: buildJobId("ai-usage", job.id),
        });
      } catch (err) {
        // Yang dicatat: identitas job dan fiturnya. TIDAK ADA isi prompt di
        // peristiwa ini sejak awal, jadi tidak ada yang perlu disaring — tetapi
        // `userId` tetap ditahan di luar pesan agar log kegagalan tidak menjadi
        // tempat baru PII berkumpul.
        deps.logger.error(
          { err, feature: peristiwa.feature, provider: peristiwa.provider },
          "Gagal mengantrekan pencatatan pemakaian AI — jejak biaya panggilan ini hilang",
        );
        deps.metrics?.increment(METRIK_ENQUEUE_GAGAL);
      }
    },
  };
}
