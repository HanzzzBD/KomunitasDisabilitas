// modules/notifications — controller pendaftaran perangkat (PR-048a).
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari body.
//
// SATU HAL YANG TIDAK BOLEH DITAMBAHKAN DI BERKAS INI: log yang memuat
// `req.body`. Token FCM ada di dalamnya, dan dokumen phase menuntutnya
// diperlakukan rahasia. Ia bukan PII, tetapi siapa pun yang memegangnya bisa
// mengirim notifikasi ke layar kunci perangkat seseorang.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { RegisterDevice } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { DevicesActor, DevicesService } from "../services/devices.service.js";

/** requestId dari pino-http; fallback bila middleware logger tidak terpasang. */
function actorOf(req: Request): DevicesActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createDevicesController(service: DevicesService) {
  return {
    /**
     * POST /api/v1/me/devices → 200 perangkat terdaftar.
     *
     * 200, BUKAN 201 — dan itu keputusan, bukan kelalaian. Endpoint ini idempoten:
     * klien memanggilnya pada setiap peluncuran aplikasi, dan sebagian besar
     * panggilan tidak melahirkan apa pun. 201 pada panggilan yang hanya menggeser
     * `lastSeenAt` akan berbohong kepada klien yang mempercayainya, dan
     * membedakan 200/201 menuntut repository melaporkan "lahir atau tidak" —
     * informasi yang tidak dipakai siapa pun.
     */
    async register(req: Request, res: Response): Promise<void> {
      const body = req.body as RegisterDevice;
      res.status(200).json({ data: await service.register(actorOf(req), body) });
    },
  };
}

export type DevicesController = ReturnType<typeof createDevicesController>;
