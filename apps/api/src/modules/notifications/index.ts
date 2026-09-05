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
import { createNotificationRepository } from "./repositories/notifications.repository.js";
import { createNotificationsService } from "./services/notifications.service.js";
import { createNotificationsController } from "./controllers/notifications.controller.js";
import { createNotificationsRouter } from "./routers/index.js";

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
}

export function createNotificationsModule(deps: NotificationsModuleDeps): Router {
  const service = createNotificationsService({
    notificationRepository: createNotificationRepository(deps.prisma),
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
    await service.terbitkan({
      userId: payload.userId,
      type: "auth.selamat_datang",
      params: {},
      kunciPeristiwa: "akun",
    });
  });

  // Lamaran terkirim → satu bukti terima per lamaran (PR-076).
  deps.events.on("application.submitted", async (payload) => {
    await service.terbitkan({
      userId: payload.userId,
      type: "lamaran.terkirim",
      params: { applicationId: payload.applicationId, jobId: payload.jobId },
      kunciPeristiwa: payload.applicationId,
    });
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
    await service.terbitkan({
      userId: payload.userId,
      type: "lamaran.status_berubah",
      params: {
        applicationId: payload.applicationId,
        jobId: payload.jobId,
        status: payload.to,
      },
      kunciPeristiwa: `${payload.applicationId}:${payload.to}`,
    });
  });

  return createNotificationsRouter(createNotificationsController(service), deps.routes);
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
