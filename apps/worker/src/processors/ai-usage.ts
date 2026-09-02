// apps/worker — processor `ai-usage-record` (PR-043b, SDD §7.1 langkah 5).
//
// ADAPTER, dan sesempit mungkin. `apps/worker` berjalan tanpa satu pun test
// (`--passWithNoTests`), jadi setiap keputusan yang tinggal di sini adalah
// keputusan yang tidak pernah diuji. Yang tersisa: validasi payload, panggil
// repository, tulis log. Idempotensi, pemetaan kode error Prisma, dan bentuk
// barisnya semuanya hidup di `modules/ai` di sisi api, tempat mereka teruji.
//
// EVENT-DRIVEN, bukan cron: produsernya adalah `AiClient` pada setiap panggilan
// AI yang berhasil. Karena itu tidak ada `jadwalkan()` untuk queue ini.
import { aiUsageRecordJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { AppPrisma } from "@nawasena/api/core/db";
import type { Logger } from "@nawasena/api/core/logger";
import { createAiUsageRepository } from "@nawasena/api/modules/ai";

export interface AiUsageProcessorDeps {
  prisma: AppPrisma;
  logger: Pick<Logger, "info" | "warn">;
}

export function createAiUsageProcessor(deps: AiUsageProcessorDeps): JobProcessor {
  const repository = createAiUsageRepository(deps.prisma);

  return async (payload) => {
    const job = aiUsageRecordJobSchema.parse(payload);
    const hasil = await repository.simpan(job);

    // Yang dicatat hanya metadata biaya — id baris, fitur, provider. Payload ini
    // memang tidak pernah memuat isi prompt atau jawaban (skema `.strict()`),
    // dan log ini tidak boleh menjadi tempat pertama yang mengubahnya.
    if (hasil === "pemilik-hilang") {
      deps.logger.warn(
        { id: job.id, feature: job.feature, provider: job.provider },
        "Pemilik baris ai_usage sudah dihapus sebelum jejaknya tertulis — job diselesaikan",
      );
    } else {
      deps.logger.info(
        { id: job.id, feature: job.feature, provider: job.provider, hasil },
        hasil === "duplikat"
          ? "Pemakaian AI sudah pernah tercatat — job duplikat diabaikan"
          : "Pemakaian AI tercatat",
      );
    }

    return { hasil };
  };
}
