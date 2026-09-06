// modules/notifications — kontributor ekspor PDP (utang U-04, dibayar 2026-09-05).
//
// UTANG YANG DILAHIRKAN PR-047 DAN TIDAK DIBAYAR DI SANA. Penjaga ekspor
// menempatkan `notifications` di DITUNDA dengan alasan "menunggu modul
// notifications (Phase 07)" — dan modul itu lahir di PR-047, yang berarti sejak
// hari itu riwayat notifikasi seorang pengguna ADA dan tidak ikut terekspor.
// Ditemukan lewat rekonsiliasi utang, bukan lewat laporan pengguna.
//
// KALIMATNYA DIRENDER, BUKAN DISALIN. Berkas ekspor memuat judul dan isi dalam
// KEDUA varian bahasa, dirakit oleh renderer yang sama dengan yang melayani
// layar. Alasannya sama dengan keputusan induk PR-047: yang disimpan sistem ini
// adalah `type` + referensi, bukan kalimat. Menyalin kalimat dari suatu tempat
// lain akan berarti berkas ekspor punya sumber kebenaran keduanya sendiri.
//
// Akibat yang disengaja: notifikasi lama ikut membawa kalimat versi TERBARU.
// Itu benar, bukan cacat — kalimat lama yang buruk bagi screen reader tidak
// pantas diabadikan ke dalam berkas yang dibawa pengguna.
import type { Notification } from "@nawasena/schemas";
import type { ExportContributor } from "../../users/services/export.service.js";
import type { NotificationsService } from "./notifications.service.js";

export interface NotificationsExportDeps {
  /**
   * Service yang SAMA dengan yang melayani `/me/notifications` — bukan salinan
   * kedua, dengan alasan yang sama seperti kontributor profil (PR-038).
   */
  notifications: Pick<NotificationsService, "semuaUntukEkspor">;
}

export function createNotificationsExportContributor(
  deps: NotificationsExportDeps,
): ExportContributor {
  return {
    bagian: "notifications",
    kumpulkan(userId): Promise<Notification[]> {
      return deps.notifications.semuaUntukEkspor(userId);
    },
  };
}
