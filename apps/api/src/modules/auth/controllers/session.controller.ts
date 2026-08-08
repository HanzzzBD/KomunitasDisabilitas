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

    /**
     * POST /auth/logout → 204, keluar dari perangkat ini.
     *
     * SELALU 204, bahkan tanpa token atau dengan token karangan. Dua alasan:
     * pengguna yang menekan "keluar" tidak boleh dihadapkan pada kegagalan
     * (hasil akhirnya sama — ia tidak punya sesi), dan jawaban yang berbeda
     * antara token sah dan token karangan akan menjadikan endpoint ini alat
     * penebak. Cookie tetap dihapus apa pun hasilnya.
     */
    async logout(req: Request, res: Response): Promise<void> {
      const token = (req.body as RefreshSession).refreshToken ?? cookie.read(req);
      if (token !== null && token !== undefined) await service.logout(token);
      cookie.clear(res);
      res.status(204).end();
    },

    /**
     * POST /auth/logout-all → 204, keluar dari SEMUA perangkat.
     *
     * Kredensialnya adalah refresh token, bukan access token: middleware
     * `requireAuth` baru lahir di PR-019, dan menunggunya berarti pengguna
     * tidak punya cara mencabut sesi sama sekali sampai saat itu. Konsekuensi
     * yang diterima sadar: pemegang refresh token curian bisa memaksa logout
     * semua perangkat — sebuah gangguan, bukan pengambilalihan, dan penyerang
     * itu sendiri ikut kehilangan aksesnya.
     */
    async logoutAll(req: Request, res: Response): Promise<void> {
      const token = (req.body as RefreshSession).refreshToken ?? cookie.read(req);
      if (token !== null && token !== undefined) {
        const userId = await service.userIdOf(token);
        // Token tak dikenal → tidak ada yang bisa dicabut; tetap 204 (idempoten).
        if (userId !== null) await service.logoutAll(userId);
      }
      cookie.clear(res);
      res.status(204).end();
    },
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
