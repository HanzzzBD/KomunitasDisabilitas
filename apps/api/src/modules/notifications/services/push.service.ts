// modules/notifications — pengiriman push satu notifikasi (PR-048b).
//
// Hidup di `modules/notifications` DAN BUKAN di `apps/worker`, meski satu-satunya
// pemanggilnya adalah processor di sana. Alasannya tertulis di kepala
// `processors/ai-usage.ts`: `apps/worker` berjalan tanpa satu pun test
// (`--passWithNoTests`), jadi setiap keputusan yang tinggal di sana adalah
// keputusan yang tidak pernah diuji. Yang boleh tinggal di processor hanyalah
// validasi payload dan log; klasifikasi galat, pembersihan token, dan pemilihan
// varian bahasa semuanya ada di sini, tempat mereka teruji.
//
// SATU PERANGKAT GAGAL TIDAK BOLEH MENJATUHKAN SISANYA. Pengguna dengan ponsel
// dan tablet yang tokennya sudah mati di salah satunya tetap harus menerima
// kabarnya di yang lain — jadi setiap perangkat dikirimi sendiri, kegagalannya
// dikumpulkan, dan keputusan "ulangi atau tidak" diambil SETELAH semuanya
// dicoba.
import type { NotificationType } from "@nawasena/schemas";
import { NOTIFICATION_PARAM_SCHEMAS } from "@nawasena/schemas";
import type { Logger } from "../../../core/logger/index.js";
import type { NotificationRepository } from "../repositories/notifications.repository.js";
import type { DevicesService } from "./devices.service.js";
import { FcmError, pilihVarian, type FcmSender } from "./fcm.sender.js";
import { renderNotifikasi } from "./template.service.js";

export interface PushServiceDeps {
  notificationRepository: Pick<NotificationRepository, "findById">;
  devices: Pick<DevicesService, "milik"> & { hapusToken(fcmToken: string): Promise<boolean> };
  fcm: FcmSender;
  /**
   * Preferensi aksesibilitas pemilik notifikasi — untuk memilih varian bahasa.
   * Impor LINTAS MODUL yang sah: service → service (aturan boundaries PR-002).
   */
  accessibility: { getMe(actor: { userId: string; requestId: string }): Promise<{ simpleLanguage: boolean | null }> };
  logger: Pick<Logger, "info" | "warn" | "error">;
}

export interface HasilPush {
  terkirim: number;
  tokenDihapus: number;
  gagal: number;
  /** `true` bila notifikasinya sudah tidak ada — job selesai, bukan gagal. */
  dilewati?: "notifikasi-hilang" | "tanpa-perangkat" | "fcm-mati";
}

export function createPushService(deps: PushServiceDeps) {
  const { notificationRepository, devices, fcm, accessibility, logger } = deps;

  return {
    /**
     * Kirim satu notifikasi ke seluruh perangkat pemiliknya.
     *
     * MELEMPAR bila ada kegagalan yang pantas diulang — itulah cara memberi tahu
     * BullMQ untuk mencoba lagi (4 attempts, backoff 30 dtk, SDD §16). Yang
     * TIDAK melempar: notifikasi yang sudah tidak ada, pengguna tanpa perangkat,
     * FCM yang belum dikonfigurasi, dan token mati. Keempatnya keadaan sah yang
     * tidak akan membaik bila diulang; melemparkannya hanya akan mengisi DLQ
     * dengan job yang tidak bisa diperbaiki siapa pun.
     */
    async kirim(notificationId: string, userId: string): Promise<HasilPush> {
      const kosong: HasilPush = { terkirim: 0, tokenDihapus: 0, gagal: 0 };

      if (!fcm.tersedia) {
        // Berisik sekali per job, bukan diam: push yang mati diam-diam adalah
        // kabar yang tidak sampai tanpa satu pun jejak.
        logger.warn({ notificationId }, "Kredensial FCM belum diatur — push dilewati");
        return { ...kosong, dilewati: "fcm-mati" };
      }

      const row = await notificationRepository.findById(userId, notificationId);
      if (row === null) {
        // Bisa terjadi wajar: akun dihapus (cascade) antara enqueue dan
        // eksekusi. Job SELESAI, bukan gagal — tidak ada yang bisa diperbaiki
        // dengan mengulang.
        logger.info({ notificationId }, "Notifikasi sudah tidak ada saat push dijalankan");
        return { ...kosong, dilewati: "notifikasi-hilang" };
      }

      const daftar = await devices.milik(userId);
      if (daftar.length === 0) return { ...kosong, dilewati: "tanpa-perangkat" };

      const type = row.type as NotificationType;
      const params = NOTIFICATION_PARAM_SCHEMAS[type].parse(row.payload ?? {}) as Record<
        string,
        string
      >;
      const teks = renderNotifikasi(type, params);

      // VARIAN BAHASA MENGIKUTI PREFERENSI PEMILIKNYA (ADR-008). Push adalah
      // permukaan UI seperti yang lain: pengguna yang menyalakan teks sederhana
      // karena ia memang lebih mudah ia pahami tidak boleh menerima kalimat
      // formal hanya karena kalimat itu datang lewat layar kunci.
      //
      // Kegagalan membacanya TIDAK menggagalkan push: kabar dalam varian baku
      // jauh lebih baik daripada tidak ada kabar sama sekali.
      let sederhana = false;
      try {
        const preferensi = await accessibility.getMe({ userId, requestId: `push:${notificationId}` });
        sederhana = preferensi.simpleLanguage === true;
      } catch (err) {
        logger.warn({ err, notificationId }, "Preferensi bahasa tak terbaca — push memakai varian baku");
      }

      let terkirim = 0;
      let tokenDihapus = 0;
      const kegagalan: FcmError[] = [];

      for (const perangkat of daftar) {
        try {
          const hasil = await fcm.kirim({
            fcmToken: perangkat.fcmToken,
            title: pilihVarian(teks.title, sederhana),
            body: pilihVarian(teks.body, sederhana),
            // Hanya referensi — aturan yang sama dengan payload notifikasi
            // (PR-047). Data push mendarat di perangkat dan bisa terbaca alat
            // lain di sana; ia tempat terakhir yang pantas memuat data pribadi.
            data: { notificationId: row.id, type, ...params },
          });

          if (hasil.hasil === "terkirim") {
            terkirim += 1;
            continue;
          }

          // Token mati → hapus barisnya. Inilah AC-2, dan ia berjalan pada
          // jalur pengiriman yang normal — bukan lewat job pembersihan
          // terpisah yang harus dijadwalkan dan bisa lupa dijalankan.
          if (await devices.hapusToken(perangkat.fcmToken)) tokenDihapus += 1;
          logger.info(
            { notificationId, deviceId: perangkat.id, alasan: hasil.alasan },
            "Token perangkat sudah tidak terdaftar — barisnya dihapus",
          );
        } catch (err) {
          if (err instanceof FcmError) {
            kegagalan.push(err);
            // `deviceId`, BUKAN tokennya. Lihat aturan di kepala fcm.sender.ts.
            logger.warn(
              { notificationId, deviceId: perangkat.id, code: err.code },
              "Pengiriman push ke satu perangkat gagal",
            );
            continue;
          }
          throw err;
        }
      }

      const hasil: HasilPush = { terkirim, tokenDihapus, gagal: kegagalan.length };

      if (kegagalan.length > 0) {
        // Kredensial salah tidak akan membaik dengan diulang, tetapi ia JUGA
        // tidak boleh diam: dilempar supaya job masuk DLQ dan terlihat, sebab
        // ia mematikan push bagi SEMUA orang, bukan satu perangkat.
        const pertama = kegagalan[0] as FcmError;
        throw new FcmError(
          pertama.code,
          `Push gagal untuk ${kegagalan.length} dari ${daftar.length} perangkat (${pertama.message})`,
          pertama.status,
        );
      }

      logger.info({ notificationId, ...hasil }, "Push notifikasi selesai");
      return hasil;
    },
  };
}

export type PushService = ReturnType<typeof createPushService>;
