// modules/accessibility — controller preferensi aksesibilitas (PR-034).
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari body/query. Sama
// seperti di `modules/users`: satu-satunya cara controller ini melayani
// pengguna lain adalah bila deklarasi aksesnya di router diubah menjadi publik —
// dan itu akan membuat `authOf` melempar 500, bukan membocorkan data.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { UpdateAccessibilityPreferences } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type {
  AccessibilityActor,
  AccessibilityService,
} from "../services/accessibility.service.js";

/** requestId dari pino-http; fallback bila middleware logger tidak terpasang. */
function actorOf(req: Request): AccessibilityActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createAccessibilityController(service: AccessibilityService) {
  return {
    /** GET /api/v1/me/accessibility → 200 preferensi sendiri. */
    async me(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.getMe(actorOf(req)) });
    },

    /** PUT /api/v1/me/accessibility → 200 preferensi setelah diperbarui. */
    async updateMe(req: Request, res: Response): Promise<void> {
      const body = req.body as UpdateAccessibilityPreferences;
      res.status(200).json({ data: await service.updateMe(actorOf(req), body) });
    },
  };
}

export type AccessibilityController = ReturnType<typeof createAccessibilityController>;
