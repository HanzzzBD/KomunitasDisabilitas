// modules/users — controller profil akun (PR-020).
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari body/query. Itu bukan
// kebetulan: satu-satunya cara controller ini melayani pengguna lain adalah
// bila deklarasi aksesnya di router diubah menjadi publik — dan itu akan
// membuat `authOf` melempar 500, bukan membocorkan data.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { UpdateMe } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { UsersActor, UsersService } from "../services/users.service.js";

/** requestId dari pino-http; fallback bila middleware logger tidak terpasang. */
function actorOf(req: Request): UsersActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createUsersController(service: UsersService) {
  return {
    /** GET /api/v1/me → 200 profil sendiri. */
    async me(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.getMe(actorOf(req)) });
    },

    /** PUT /api/v1/me → 200 profil setelah diperbarui. */
    async updateMe(req: Request, res: Response): Promise<void> {
      const body = req.body as UpdateMe;
      res.status(200).json({ data: await service.updateMe(actorOf(req), body) });
    },
  };
}

export type UsersController = ReturnType<typeof createUsersController>;
