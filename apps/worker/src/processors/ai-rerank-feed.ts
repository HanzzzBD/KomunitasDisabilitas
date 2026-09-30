// apps/worker — processor `ai-rerank-feed` (PR-072, SDD §16).
//
// ADAPTER, pola `ai-extract-resume`: validasi payload, tentukan apakah ini
// percobaan terakhir, panggil service, tulis log. Keputusan — whitelist ref,
// validasi penjelasan, angkatan basi, pengembalian jatah — hidup di
// `modules/matching/services/rerank.service.ts` di sisi api, tempat ia teruji.
//
// Queue `ai-rerank-feed`: 2 percobaan, 30 dtk. Gagal di percobaan terakhir
// BUKAN DLQ: feed tetap berfungsi dengan urutan skor + template (PR-073).
//
// EVENT-DRIVEN: produsernya `createFeedCacheService` di proses API.
import { aiRerankFeedJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { Logger } from "@nawasena/api/core/logger";
import type { RerankService } from "@nawasena/api/modules/matching";

export interface AiRerankFeedProcessorDeps {
  rerank: RerankService;
  /** `attempts` queue ini (konfigurasi runtime) — dasar "percobaan terakhir". */
  attempts: number;
  logger: Pick<Logger, "info">;
}

export function createAiRerankFeedProcessor(deps: AiRerankFeedProcessorDeps): JobProcessor {
  return async (payload, context) => {
    const job = aiRerankFeedJobSchema.parse(payload);
    const percobaanTerakhir = context.attemptsMade + 1 >= deps.attempts;
    const hasil = await deps.rerank.jalankan(job, { percobaanTerakhir });

    // Status saja. Tanpa userId (log job ini akan menjadi daftar siapa membuka
    // feed kapan), tanpa isi prompt maupun penjelasan.
    deps.logger.info({ ...hasil }, "Job re-rank feed selesai");
    return hasil;
  };
}
