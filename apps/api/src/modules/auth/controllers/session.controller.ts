// modules/auth — controller sesi (PR-018b): perpanjangan token + penyerahan
// pasangan token ke klien.
//
// SATU aturan yang mengikat seluruh file ini: refresh token web TIDAK PERNAH
// masuk body response. Ia hanya keluar lewat cookie HttpOnly. Mobile sebaliknya
// menerimanya di body karena tidak punya cookie jar yang bisa diandalkan.
// `serahkan()` adalah satu-satunya tempat pilihan itu dibuat — jangan
// menuliskan pasangan token ke response dari tempat lain.
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { RefreshSession, SessionClient, SessionTokens } from "@nawasena/schemas";
import { appError } from "../../../core/http/index.js";
import type { SessionActor, SessionService } from "../services/session.service.js";
import type { SessionCookie } from "./session-cookie.js";
import type { SessionTokens as ServiceTokens } from "../services/session.service.js";

/** requestId dari pino-http; fallback bila middleware logger tidak terpasang. */
function actorOf(req: Request): SessionActor {
  return { requestId: typeof req.id === "string" ? req.id : randomUUID() };
}

export function createSessionController(deps: {
  service: SessionService;
  cookie: SessionCookie;
}) {
  const { service, cookie } = deps;

  /**
   * Bentuk pasangan token untuk response + pasang/hapus cookie sesuai klien.
   * Dipakai juga oleh controller OTP & Google supaya kedua metode login
   * menyerahkan sesi dengan cara yang persis sama.
   */
  function serahkan(res: Response, tokens: ServiceTokens, client: SessionClient): SessionTokens {
    if (client === "mobile") {
      // Mobile menyimpan sendiri di SecureStore; tidak ada cookie yang dipasang.
      return {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        refreshToken: tokens.refreshToken,
      };
    }
    cookie.set(res, tokens.refreshToken, tokens.refreshExpiresAt);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  return {
    serahkan,

    /**
     * POST /auth/refresh → 200 dengan pasangan token baru.
     *
     * Sumber token menentukan jenis klien: body = mobile, cookie = web. Tidak
     * ada field `client` di sini karena keberadaan tokennya sudah menjawabnya.
     */
    async refresh(req: Request, res: Response): Promise<void> {
      const body = req.body as RefreshSession;
      const dariBody = body.refreshToken;
      const dariCookie = cookie.read(req);
      const token = dariBody ?? dariCookie;

      if (token === undefined || token === null) {
        // Tidak ada token sama sekali: perlakukan seperti sesi tidak valid,
        // bukan VALIDATION_ERROR. Bagi pengguna keduanya sama saja ("masuk
        // lagi"), dan membedakannya hanya memberi tahu penyerang bentuk
        // permintaan yang benar.
        cookie.clear(res);
        throw appError("SESI_TIDAK_VALID");
      }

      let tokens;
      try {
        tokens = await service.refresh(token, actorOf(req));
      } catch (err) {
        // Sesi ditolak → cookie basi ikut dibuang, supaya browser tidak
        // mengirimkannya lagi pada percobaan berikutnya.
        if (dariBody === undefined) cookie.clear(res);
        throw err;
      }

      res.status(200).json({ data: serahkan(res, tokens, dariBody === undefined ? "web" : "mobile") });
    },
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
