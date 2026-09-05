// modules/notifications — wiring modul (DI manual via factory, ADR-002).
//
// TIGA LANGGANAN EVENT DIPASANG DI SINI, bukan di sub-folder `subscribers/`.
// Alasannya sama dengan `modules/accessibility`: tiap langganan adalah satu
// pemanggilan `service.terbitkan(...)`, dan lapisan tersendiri untuk itu hanya
// menambah berkas yang harus dibaca sebelum seseorang bisa menjawab "notifikasi
// ini lahir dari apa?". Di sini jawabannya terbaca dalam satu layar.
//
// KENAPA `kunciPeristiwa` DITENTUKAN DI SINI, BUKAN DI SERVICE. Ia adalah
// pernyataan tentang PERISTIWANYA — "satu sambutan per akun", "satu kabar per
// perpindahan status" — dan pernyataan itu hanya bisa dibuat oleh yang membaca
// event-nya. Service yang mengarangnya sendiri harus menebak, dan tebakan yang
// salah berarti pengguna menerima kabar yang sama dua kali.
import type { Router } from "express";
import type { AppPrisma } from "../../core/db/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { EventBus } from "../../core/events/index.js";
import { QUEUE_NAME, notifyPushJobSchema } from "@nawasena/schemas";
import { buildJobId, type QueueRegistry } from "../../core/queue/index.js";
import type { Logger } from "../../core/logger/index.js";
import type { DevicesService } from "./services/devices.service.js";
import { createNotificationRepository } from "./repositories/notifications.repository.js";
import { createDeviceRepository } from "./repositories/devices.repository.js";
import { createNotificationsService, idNotifikasi } from "./services/notifications.service.js";
import { createDevicesService } from "./services/devices.service.js";
import { createNotificationsController } from "./controllers/notifications.controller.js";
import { createDevicesController } from "./controllers/devices.controller.js";
import { createNotificationsRouter } from "./routers/index.js";
import { daftarkanRouteDevices } from "./routers/devices.js";
import { createNotificationsExportContributor } from "./services/notifications-export.service.js";

export interface NotificationsModuleDeps {
  prisma: AppPrisma;
  /** Registrar route (PR-019) — prefix `/api/v1` dipegang olehnya. */
  routes: RouteRegistrar;
  /**
   * Bus event PROSES API. Ketiga penerbit yang didengarkan di bawah hidup di
   * proses yang sama (auth lewat HTTP, applications lewat HTTP di Phase 12) —
   * syarat mutlak bus in-process (batas 1 di core/events).
   */
  events: EventBus;
  /**
   * Registry antrean — satu-satunya jalur produser job (core/queue). OPSIONAL:
   * tanpanya notifikasi tetap lahir dan tetap terbaca di layar, hanya push-nya
   * yang tidak diantrekan. Itu keadaan sah untuk test yang tidak sedang menguji
   * push, dan bukan alasan memaksa setiap pemanggil mengarang antrean palsu.
   */
  queues?: Pick<QueueRegistry, "enqueue">;
  logger?: Pick<Logger, "error">;
}

export interface NotificationsModule {
  router: Router;
  /**
   * Perangkat push milik seorang pengguna — untuk jalur pengiriman (PR-048b).
   *
   * DIKEMBALIKAN, bukan dipasang sebagai route, dengan alasan yang sama seperti
   * `sensitiveAccess` di modul profiles: konsumennya sudah bernama (processor
   * `notify-push`) tetapi belum lahir, dan satu-satunya jalan masuk ke sana
   * harus berupa parameter di composition root — bukan repository yang
   * di-import langsung lintas modul.
   */
  devices: DevicesService;
  /**
   * Bagian `notifications` berkas ekspor PDP (utang U-04, dibayar 2026-09-05).
   * Bentuknya sama dengan `profiles.exportContributor` — lihat alasannya di sana.
   */
  exportContributor: ReturnType<typeof createNotificationsExportContributor>;
}

export function createNotificationsModule(deps: NotificationsModuleDeps): NotificationsModule {
  const notificationRepository = createNotificationRepository(deps.prisma);
  const service = createNotificationsService({ notificationRepository });

  /**
   * Antrekan push untuk notifikasi yang BARU SAJA LAHIR.
   *
   * `lahir === false` berarti peristiwanya sudah pernah tercatat (PR-047), jadi
   * push-nya pun sudah pernah diantrekan — dan tidak mengantre lagi adalah
   * seluruh isi AC-3 "idempotent per notification id". Idempotensi push di sini
   * MEWARISI idempotensi notifikasi, bukan mengulanginya: satu penjaga di satu
   * tempat, bukan dua yang bisa menyimpang.
   *
   * `jobId` deterministik menjadi lapisan keduanya — BullMQ menolak job ber-id
   * sama, sehingga dua proses API yang entah bagaimana sama-sama melihat
   * `lahir === true` tetap menghasilkan satu job.
   *
   * TIDAK PERNAH MENOLAK. Notifikasinya sudah tertulis dan sudah terbaca di
   * layar; kegagalan mengantre adalah kepentingan kita (kabar yang tidak sampai
   * ke layar kunci), bukan alasan menjatuhkan pelanggan event yang pekerjaan
   * utamanya sudah selesai. Pola yang sama dengan `ai-usage.service.ts`.
   */
  async function antrekanPush(lahir: boolean, userId: string, notificationId: string): Promise<void> {
    if (!lahir || deps.queues === undefined) return;
    try {
      const job = notifyPushJobSchema.parse({ notificationId, userId });
      await deps.queues.enqueue(QUEUE_NAME.NOTIFY_PUSH, job, {
        jobId: buildJobId("push", notificationId),
      });
    } catch (err) {
      // `notificationId` boleh masuk log — ia id baris kita sendiri. `userId`
      // ditahan di luar pesan agar log kegagalan tidak menjadi tempat baru PII
      // berkumpul (aturan yang sama dengan ai-usage).
      deps.logger?.error(
        { err, notificationId },
        "Gagal mengantrekan push — notifikasinya tetap ada, hanya kabarnya yang tidak dikirim",
      );
    }
  }
  const devices = createDevicesService({
    deviceRepository: createDeviceRepository(deps.prisma),
  });

  // Akun baru → satu sambutan. `kunciPeristiwa` = "akun", bukan `registeredAt`:
  // waktu registrasi yang ikut dihitung akan membuat event yang terbit ulang
  // dengan timestamp berbeda melahirkan sambutan KEDUA — persis yang hendak
  // dicegah. Satu akun berhak atas tepat satu sambutan, selamanya.
  //
  // Kembalian `on` (pembatal langganan) sengaja tidak disimpan: langganan ini
  // hidup selama proses, sama seperti router yang dikembalikan di bawah.
  //
  // Delegasi tipis dengan sengaja, tanpa try/catch: bus sudah menangkap dan
  // mencatat kegagalan pelanggan (core/events), dan menangkapnya lagi di sini
  // hanya akan menelan error yang seharusnya terlihat.
  // `async` + `await`, bukan arrow ekspresi: kembalian `terbitkan` adalah
  // boolean (lahir/sudah ada), sedangkan `EventHandler` menjanjikan `void`.
  // Menyerahkan promise-nya apa adanya tetap membuat bus menangkap kegagalan,
  // tetapi tipenya tidak cocok — dan `void` di depan pemanggilan akan MEMBUANG
  // promise-nya, sehingga kegagalan penulisan menjadi unhandled rejection.
  deps.events.on("auth.user_registered", async (payload) => {
    const lahir = await service.terbitkan({
      userId: payload.userId,
      type: "auth.selamat_datang",
      params: {},
      kunciPeristiwa: "akun",
    });
    await antrekanPush(lahir, payload.userId, idNotifikasi("auth.selamat_datang", payload.userId, "akun"));
  });

  // Lamaran terkirim → satu bukti terima per lamaran (PR-076).
  deps.events.on("application.submitted", async (payload) => {
    const lahir = await service.terbitkan({
      userId: payload.userId,
      type: "lamaran.terkirim",
      params: { applicationId: payload.applicationId, jobId: payload.jobId },
      kunciPeristiwa: payload.applicationId,
    });
    await antrekanPush(
      lahir,
      payload.userId,
      idNotifikasi("lamaran.terkirim", payload.userId, payload.applicationId),
    );
  });

  // Perpindahan status → satu kabar per (lamaran, status tujuan) (PR-078).
  //
  // `to` IKUT KE DALAM KUNCI, dan itu yang membuat idempotensinya benar: dua
  // `emit` untuk perpindahan yang sama diringkas menjadi satu baris, sedangkan
  // perpindahan BERIKUTNYA (in_review → interview) tetap kabar tersendiri.
  //
  // Batasnya jujur: lamaran yang kembali ke status yang pernah dilewatinya
  // (interview → in_review → interview) tidak melahirkan kabar kedua. Itu
  // pilihan sadar — transisi mundur semacam itu belum ada di Phase 12, dan
  // memasukkan `changedAt` ke dalam kunci demi menampungnya akan menghapus
  // seluruh perlindungan terhadap event yang terbit ulang, yang jauh lebih
  // sering terjadi. Bila transisi mundur kelak lahir, yang ditambahkan ke kunci
  // adalah nomor urut riwayat status — bukan waktu.
  deps.events.on("application.status_changed", async (payload) => {
    const kunci = `${payload.applicationId}:${payload.to}`;
    const lahir = await service.terbitkan({
      userId: payload.userId,
      type: "lamaran.status_berubah",
      params: {
        applicationId: payload.applicationId,
        jobId: payload.jobId,
        status: payload.to,
      },
      kunciPeristiwa: kunci,
    });
    await antrekanPush(
      lahir,
      payload.userId,
      idNotifikasi("lamaran.status_berubah", payload.userId, kunci),
    );
  });

  // Kedua router menulis ke registrar — dan karena itu ke Router — yang SAMA.
  // Dipisah sebagai berkas, bukan sebagai router Express kedua: dua router untuk
  // satu modul berarti dua `app.use()` di boot.ts, dan setiap tambahan di sana
  // adalah tempat baru seseorang bisa lupa memasangnya.
  const router = createNotificationsRouter(createNotificationsController(service), deps.routes);
  daftarkanRouteDevices(createDevicesController(devices), deps.routes);

  return {
    router,
    devices,
    // Service yang SAMA dengan yang melayani `/me/notifications` — jadi kalimat
    // di berkas ekspor dirakit renderer yang sama dengan yang melayani layar.
    exportContributor: createNotificationsExportContributor({ notifications: service }),
  };
}

export {
  createNotificationRepository,
  type KursorHalaman,
  type NotificationBaru,
  type NotificationRepository,
  type NotificationRow,
  type OpsiDaftar,
} from "./repositories/notifications.repository.js";
export {
  createNotificationsService,
  idNotifikasi,
  NotifikasiTidakDitemukanError,
  type DaftarOpsi,
  type HasilDaftar,
  type NotificationsActor,
  type NotificationsService,
  type TerbitkanOpsi,
} from "./services/notifications.service.js";
export {
  LABEL_STATUS,
  renderNotifikasi,
  TEMPLATE,
  type TeksNotifikasi,
  type TemplateNotifikasi,
} from "./services/template.service.js";
export { decodeKursor, encodeKursor, KursorTidakValidError } from "./services/kursor.js";
export {
  createNotificationsController,
  type NotificationsController,
} from "./controllers/notifications.controller.js";
export { createNotificationsRouter } from "./routers/index.js";
export {
  createDeviceRepository,
  type DaftarPerangkat,
  type DeviceRepository,
  type DeviceRow,
} from "./repositories/devices.repository.js";
export {
  createDevicesService,
  type DevicesActor,
  type DevicesService,
} from "./services/devices.service.js";
export {
  createDevicesController,
  type DevicesController,
} from "./controllers/devices.controller.js";
export { daftarkanRouteDevices } from "./routers/devices.js";
export {
  createNotificationsExportContributor,
  type NotificationsExportDeps,
} from "./services/notifications-export.service.js";
export {
  createFcmSender,
  createFcmSenderFromEnv,
  createUnavailableFcmSender,
  FcmError,
  pilihVarian,
  type FcmConfig,
  type FcmSender,
  type HasilKirim,
  type PesanPush,
} from "./services/fcm.sender.js";
export {
  createPushService,
  type HasilPush,
  type PushService,
  type PushServiceDeps,
} from "./services/push.service.js";
