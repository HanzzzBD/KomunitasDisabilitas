// modules/ai — penulisan baris `ai_usage` (PR-043b, SDD §7.2).
//
// Satu-satunya tempat di repo ini yang meng-INSERT jejak biaya AI. Ia tinggal
// di sisi `apps/api` — bukan di dalam processor worker — karena `apps/worker`
// berjalan dengan `--passWithNoTests`: setiap baris keputusan yang tinggal di
// sana adalah baris yang tidak pernah diuji. Yang tersisa di processor hanyalah
// `parse` + panggil + log.
import { Prisma, type AiFeature } from "@prisma/client";
import type { AiUsageRecordJob } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";

/** Pelanggaran primary key — job yang sama diproses dua kali. */
const UNIQUE_VIOLATION = "P2002";
/** Pelanggaran foreign key — pemilik barisnya sudah tidak ada. */
const FOREIGN_KEY_VIOLATION = "P2003";

/**
 * Apa yang terjadi pada satu job. Ketiganya adalah HASIL YANG SAH; kegagalan
 * yang sesungguhnya (DB tak terjangkau, kolom hilang) tetap dilempar supaya job
 * di-retry lalu berakhir di DLQ, terlihat di `GET /internal/queues`.
 */
export type HasilSimpan = "ditulis" | "duplikat" | "pemilik-hilang";

export interface AiUsageRepository {
  simpan(job: AiUsageRecordJob): Promise<HasilSimpan>;
}

export function createAiUsageRepository(prisma: AppPrisma): AiUsageRepository {
  return {
    /**
     * Tulis satu baris. IDEMPOTEN BY CONSTRUCTION: `id` dibuat API dan menjadi
     * primary key, jadi retry BullMQ yang membawa payload sama akan menabrak PK
     * dan ditelan sebagai `duplikat`. Lapisan `jobId` deterministik di antrean
     * hanya berlaku selama job selesai masih tersimpan (`removeOnComplete: 100`)
     * — PK inilah penjaga yang sesungguhnya.
     *
     * `P2003` ditelan bersamanya, dan itu bukan kelonggaran melainkan pengakuan
     * atas urutan yang memang mungkin: `ai_usage.user_id` ber-`ON DELETE
     * CASCADE`, jadi purge PDP (PR-023) atau penghapusan akun yang jatuh di
     * antara panggilan AI dan penulisan barisnya membuat pemiliknya lenyap
     * lebih dulu. Baris untuk pengguna yang sudah tidak ada memang tidak boleh
     * ada; me-retry-nya tiga kali lalu mengirimnya ke DLQ hanya derau.
     */
    async simpan(job) {
      try {
        await prisma.aiUsage.create({
          data: {
            id: job.id,
            userId: job.userId,
            feature: job.feature as AiFeature,
            provider: job.provider,
            tokensIn: job.tokensIn,
            tokensOut: job.tokensOut,
            promptVersion: job.promptVersion ?? null,
            // Waktu PANGGILAN AI, bukan waktu worker menulis — lihat alasannya
            // pada `aiUsageRecordJobSchema`.
            createdAt: new Date(job.createdAt),
          },
        });
        return "ditulis";
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === UNIQUE_VIOLATION) return "duplikat";
          if (err.code === FOREIGN_KEY_VIOLATION) return "pemilik-hilang";
        }
        throw err;
      }
    },
  };
}
