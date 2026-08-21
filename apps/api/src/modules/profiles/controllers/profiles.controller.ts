// modules/profiles — controller profil pencari kerja (PR-037).
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari body/query. Sama
// seperti di `modules/users` dan `modules/accessibility`: satu-satunya cara
// controller ini melayani pengguna lain adalah bila deklarasi aksesnya di router
// diubah menjadi publik — dan itu akan membuat `authOf` melempar 500, bukan
// membocorkan data disabilitas siapa pun.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { UpdateSeekerProfile } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { ProfilesActor, ProfilesService } from "../services/profiles.service.js";

/**
 * requestId dari pino-http; fallback bila middleware logger tidak terpasang.
 *
 * Diekspor untuk dipakai `career.controller.ts` — satu-satunya cara controller
 * modul ini menyusun identitas pemanggil, dan itu memang harus satu-satunya:
 * fungsi kedua yang "juga" membaca aktor adalah tempat identitas mulai bisa
 * datang dari badan permintaan.
 */
export function actorOf(req: Request): ProfilesActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createProfilesController(service: ProfilesService) {
  return {
    /** GET /api/v1/me/profile → 200 profil sendiri. */
    async me(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.getMe(actorOf(req)) });
    },

    /** PUT /api/v1/me/profile → 200 profil setelah diperbarui. */
    async updateMe(req: Request, res: Response): Promise<void> {
      const body = req.body as UpdateSeekerProfile;
      res.status(200).json({ data: await service.updateMe(actorOf(req), body) });
    },
  };
}

export type ProfilesController = ReturnType<typeof createProfilesController>;
