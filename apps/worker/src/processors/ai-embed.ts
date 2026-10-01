// apps/worker — processor `ai-embed` (PR-069, SDD §16).
//
// ADAPTER, pola `ai-extract-resume`: validasi payload, panggil service, tulis
// log. Keputusan — invalidasi skor, pembacaan aman, atribusi kuota, tanpa
// fallback provider — hidup di `modules/matching/services/embedding.service.ts`
// di sisi api, tempat ia teruji.
//
// Kegagalan AI DILEMPAR apa adanya: BullMQ mengulang dengan backoff eksponensial
// (queue `ai-embed`: 4 percobaan, 10 dtk), lalu DLQ. Tidak ada jalur cadangan.
//
// EVENT-DRIVEN: produsernya modul matching di proses API (pelanggan
// `profile.updated`/`job.published`/`job.updated`). Tidak ada `jadwalkan()`.
import { aiEmbedJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { Logger } from "@nawasena/api/core/logger";
import type { EmbeddingService } from "@nawasena/api/modules/matching";

export interface AiEmbedProcessorDeps {
  embedding: EmbeddingService;
  logger: Pick<Logger, "info">;
}

export function createAiEmbedProcessor(deps: AiEmbedProcessorDeps): JobProcessor {
  return async (payload) => {
    const job = aiEmbedJobSchema.parse(payload);
    const hasil = await deps.embedding.jalankan(job);

    // `jobId` lowongan boleh (data publik); `userId` TIDAK — log job ini akan
    // menjadi daftar siapa menyunting profilnya kapan.
    deps.logger.info(
      { jenis: job.jenis, ...(job.jenis === "lowongan" ? { jobId: job.jobId } : {}), ...hasil },
      "Job embedding selesai",
    );
    return hasil;
  };
}
