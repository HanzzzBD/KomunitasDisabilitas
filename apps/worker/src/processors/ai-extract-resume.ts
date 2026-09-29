// apps/worker — processor `ai-extract-resume` (PR-067, SDD §16).
//
// ADAPTER, sama seperti `ai-usage`: validasi payload, tentukan apakah ini
// percobaan terakhir, panggil service, tulis log. Seluruh keputusan —
// retry-with-feedback, validasi skema CV, idempotensi draft, pengembalian
// jatah — hidup di `modules/ai/services/cv-ekstraksi.service.ts` di sisi api,
// tempat ia teruji. Worker berjalan `--passWithNoTests`.
//
// EVENT-DRIVEN: produsernya `POST /ai/cv-chat/:session/finalize`. Tidak ada
// `jadwalkan()` untuk queue ini.
import { aiExtractResumeJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { Logger } from "@nawasena/api/core/logger";
import type { CvEkstraksiService } from "@nawasena/api/modules/ai";

export interface AiExtractResumeProcessorDeps {
  ekstraksi: CvEkstraksiService;
  /** `attempts` queue ini (konfigurasi runtime) — dasar "percobaan terakhir". */
  attempts: number;
  logger: Pick<Logger, "info">;
}

export function createAiExtractResumeProcessor(deps: AiExtractResumeProcessorDeps): JobProcessor {
  return async (payload, context) => {
    const job = aiExtractResumeJobSchema.parse(payload);
    // `attemptsMade` BullMQ = percobaan yang SUDAH gagal sebelum yang ini.
    const percobaanTerakhir = context.attemptsMade + 1 >= deps.attempts;
    const hasil = await deps.ekstraksi.jalankan(job, { percobaanTerakhir });

    // sessionId + status saja. Tidak ada userId, tidak ada isi transkrip.
    deps.logger.info({ sessionId: job.sessionId, ...hasil }, "Job ekstraksi CV selesai");
    return hasil;
  };
}
