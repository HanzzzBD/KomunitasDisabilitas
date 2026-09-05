// modules/notifications — controller (PR-047).
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari query/params. Sama
// seperti `modules/accessibility`: satu-satunya cara controller ini melayani
// notifikasi orang lain adalah bila deklarasi aksesnya di router diubah menjadi
// publik — dan itu akan membuat `authOf` melempar 500, bukan membocorkan data.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { NotificationIdParams, NotificationListQuery } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { appError } from "../../../core/http/index.js";
import { KursorTidakValidError } from "../services/kursor.js";
import {
  NotifikasiTidakDitemukanError,
  type NotificationsActor,
  type NotificationsService,
} from "../services/notifications.service.js";

/** requestId dari pino-http; fallback bila middleware logger tidak terpasang. */
function actorOf(req: Request): NotificationsActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createNotificationsController(service: NotificationsService) {
  return {
    /** GET /api/v1/me/notifications → 200 halaman notifikasi sendiri. */
    async list(req: Request, res: Response): Promise<void> {
      const query = req.query as unknown as NotificationListQuery;
      try {
        res.status(200).json(
          await service.list(actorOf(req), {
            limit: query.limit,
            unreadOnly: query.unreadOnly,
            cursor: query.cursor,
          }),
        );
      } catch (err) {
        // Cursor rusak adalah kesalahan INPUT, bukan kegagalan server. Tanpa
        // penerjemahan ini ia lolos ke error handler global sebagai 500 —
        // halaman yang tidak bisa dibuka, dengan pesan yang tidak memberi tahu
        // pengguna bahwa cukup memuat ulang dari awal.
        if (err instanceof KursorTidakValidError) {
          throw appError("VALIDATION_ERROR", {
            hint: "Muat ulang daftar notifikasi dari awal",
          });
        }
        throw err;
      }
    },

    /** POST /api/v1/me/notifications/:id/read → 200 notifikasi setelah dibaca. */
    async markRead(req: Request, res: Response): Promise<void> {
      const params = req.params as unknown as NotificationIdParams;
      try {
        res.status(200).json(await service.markRead(actorOf(req), params.id));
      } catch (err) {
        // 404 yang SAMA untuk "tidak ada" dan "milik orang lain" — lihat
        // alasannya di service. Kode katalognya `RUTE_TIDAK_DITEMUKAN`, yang
        // pesannya memang sudah mencakup data ("Halaman atau data tidak
        // ditemukan"), jadi tidak perlu kode baru yang membedakan keduanya di
        // mata penyerang.
        if (err instanceof NotifikasiTidakDitemukanError) {
          throw appError("RUTE_TIDAK_DITEMUKAN", {
            hint: "Notifikasi mungkin sudah terhapus; muat ulang daftarnya",
          });
        }
        throw err;
      }
    },
  };
}

export type NotificationsController = ReturnType<typeof createNotificationsController>;
