import { pdfRenderJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { Logger } from "@nawasena/api/core/logger";
import type { ResumePdfService } from "@nawasena/api/modules/resumes";
import type { NotificationsService } from "@nawasena/api/modules/notifications";

export interface PdfRenderProcessorDeps {
  pdf: ResumePdfService;
  notifications?: Pick<NotificationsService, "terbitkan">;
  logger: Pick<Logger, "info">;
}

export function createPdfRenderProcessor(deps: PdfRenderProcessorDeps): JobProcessor {
  return async (payload) => {
    const job = pdfRenderJobSchema.parse(payload);
    // Error Chromium/storage sengaja tidak ditelan: BullMQ harus melihatnya
    // agar kebijakan 3 attempts dan DLQ benar-benar bekerja.
    const result = await deps.pdf.render(job);

    if (result.status !== "stale" && deps.notifications !== undefined) {
      // Kunci mencakup hash: satu notifikasi per versi isi, idempoten saat job
      // retry setelah PDF sudah tersimpan tetapi penulisan notifikasi gagal.
      await deps.notifications.terbitkan({
        userId: job.userId,
        type: "resume.pdf_siap",
        params: { resumeId: job.resumeId },
        kunciPeristiwa: `${job.resumeId}:${job.contentHash}`,
      });
    }

    // userId tidak pernah masuk log. resumeId dan status cukup untuk operasi.
    deps.logger.info({ resumeId: job.resumeId, status: result.status }, "Job PDF selesai");
    return result;
  };
}
