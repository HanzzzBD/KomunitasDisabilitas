// apps/worker — processor `notify-push` (PR-048b, SDD §16).
//
// ADAPTER, dan sesempit mungkin — aturan yang sama dengan `ai-usage.ts`:
// `apps/worker` berjalan tanpa satu pun test (`--passWithNoTests`), jadi setiap
// keputusan yang tinggal di sini adalah keputusan yang tidak pernah diuji.
// Yang tersisa: validasi payload, panggil service, tulis log. Klasifikasi galat
// FCM, pembersihan token mati, dan pemilihan varian bahasa semuanya hidup di
// `modules/notifications` di sisi api, tempat mereka teruji.
//
// EVENT-DRIVEN, bukan cron: produsernya modul notifications pada setiap
// notifikasi yang BARU lahir. Karena itu tidak ada `jadwalkan()` untuk queue ini.
import { notifyPushJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { Logger } from "@nawasena/api/core/logger";
import type { PushService } from "@nawasena/api/modules/notifications";

export interface PushProcessorDeps {
  push: PushService;
  logger: Pick<Logger, "info" | "warn">;
}

export function createPushProcessor(deps: PushProcessorDeps): JobProcessor {
  return async (payload) => {
    const job = notifyPushJobSchema.parse(payload);

    // TIDAK dibungkus try/catch. Kegagalan yang pantas diulang dilemparkan
    // service sebagai FcmError, dan melemparkannya kembali ke BullMQ adalah
    // satu-satunya cara retry (4 attempts, backoff 30 dtk) benar-benar terjadi.
    // Menelannya di sini akan membuat setiap job "berhasil" sambil tidak
    // mengirim apa pun.
    const hasil = await deps.push.kirim(job.notificationId, job.userId);

    // `notificationId` boleh masuk log — id baris kita sendiri. `userId` TIDAK,
    // dan token perangkat apalagi (lihat aturan di kepala fcm.sender.ts).
    deps.logger.info({ notificationId: job.notificationId, ...hasil }, "Job push selesai");
    return hasil;
  };
}
