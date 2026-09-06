// apps/worker — processor `notify-email` (PR-049a, SDD §16).
//
// ADAPTER, dan sesempit mungkin — aturan yang sama dengan `push.ts`:
// `apps/worker` berjalan tanpa satu pun test (`--passWithNoTests`), jadi setiap
// keputusan yang tinggal di sini adalah keputusan yang tidak pernah diuji. Yang
// tersisa: validasi payload, panggil service, tulis log. Pemilihan alamat,
// penolakan alamat yang belum terbukti, pemilihan varian bahasa, dan
// klasifikasi galat provider semuanya hidup di `modules/notifications` di sisi
// api, tempat mereka teruji.
//
// EVENT-DRIVEN, bukan cron: produsernya modul auth pada setiap penghapusan akun
// yang pemiliknya tidak punya nomor HP. Karena itu tidak ada `jadwalkan()`
// untuk queue ini.
import { notifyEmailJobSchema } from "@nawasena/schemas";
import type { JobProcessor } from "@nawasena/api/core/queue";
import type { Logger } from "@nawasena/api/core/logger";
import type { EmailService } from "@nawasena/api/modules/notifications";

export interface EmailProcessorDeps {
  email: EmailService;
  logger: Pick<Logger, "info">;
}

export function createEmailProcessor(deps: EmailProcessorDeps): JobProcessor {
  return async (payload) => {
    const job = notifyEmailJobSchema.parse(payload);

    // TIDAK dibungkus try/catch. Kegagalan yang pantas diulang dilemparkan
    // service sebagai EmailError, dan melemparkannya kembali ke BullMQ adalah
    // satu-satunya cara retry (4 attempts, backoff 30 dtk) benar-benar terjadi.
    // Menelannya di sini akan membuat setiap job "berhasil" sambil tidak
    // mengirim apa pun — dan pada jalur ini, "tidak mengirim apa pun" berarti
    // seseorang tidak pernah tahu akunnya dihapus.
    const hasil = await deps.email.kirim(job);

    // `jenis` boleh masuk log; `userId` TIDAK, dan alamat email apalagi (lihat
    // aturan di kepala email.sender.ts).
    deps.logger.info({ jenis: job.jenis, ...hasil }, "Job email selesai");
    return hasil;
  };
}
