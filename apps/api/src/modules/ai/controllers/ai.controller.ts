// modules/ai — controller kuota AI (PR-043).
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari body/query/param.
// Satu-satunya cara controller ini melayani pengguna lain adalah bila deklarasi
// akses di router diubah menjadi publik — dan itu menghasilkan 500 yang berisik,
// bukan kebocoran yang diam.
import type { Request, Response } from "express";
import { authOf } from "../../../core/auth/index.js";
import type { AiQuotaService } from "../services/quota.service.js";

export function createAiController(service: AiQuotaService) {
  return {
    /** GET /api/v1/ai/quota → 200 jatah AI milik pemanggil sendiri. */
    async quotaMe(req: Request, res: Response): Promise<void> {
      const { userId } = authOf(req);
      res.status(200).json({ data: await service.getMe({ userId }) });
    },
  };
}

export type AiController = ReturnType<typeof createAiController>;
