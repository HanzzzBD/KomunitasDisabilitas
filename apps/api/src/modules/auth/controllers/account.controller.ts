// modules/auth — controller hapus akun (PR-021).
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { DeleteAccount } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { AccountActor, AccountService } from "../services/account.service.js";
import type { SessionCookie } from "./session-cookie.js";

/** Identitas dari sesi + requestId pino-http (fallback bila logger tak terpasang). */
function actorOf(req: Request): AccountActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
  };
}

export function createAccountController(deps: {
  service: AccountService;
  cookie: SessionCookie;
}) {
  const { service, cookie } = deps;

  return {
    /**
     * DELETE /auth/account → 204 tanpa body.
     *
     * Tidak ada yang dikembalikan dengan sengaja: jumlah sesi yang ikut dicabut
     * berguna bagi audit, tidak bagi pengguna — dan halaman yang menampilkannya
     * hanya akan menambah teks yang harus dibacakan screen reader tepat pada
     * momen ketika pengguna sudah selesai dan ingin pergi.
     *
     * Cookie refresh dihapus SETELAH penghapusan berhasil. Bila service
     * melempar, cookie sengaja dibiarkan: sesinya masih sah, dan membuang
     * cookie akan mengeluarkan pengguna dari akun yang justru batal dihapus.
     */
    async deleteAccount(req: Request, res: Response): Promise<void> {
      await service.deleteAccount(actorOf(req), req.body as DeleteAccount);
      cookie.clear(res);
      res.status(204).end();
    },
  };
}

export type AccountController = ReturnType<typeof createAccountController>;
