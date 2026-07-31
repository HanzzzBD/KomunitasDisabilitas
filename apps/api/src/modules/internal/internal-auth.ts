// modules/internal — penjaga akses endpoint internal.
//
// Endpoint /internal/* hanya untuk operator (Uptime Kuma, dashboard admin di
// jaringan internal), bukan klien publik. Dua lapis sesuai SDD §16:
// jaringan internal + token. Lapis token ada di sini.
//
// DENY-BY-DEFAULT: bila INTERNAL_TOKEN tidak di-set, SEMUA permintaan ditolak.
// Alternatifnya (endpoint terbuka saat token lupa diisi) adalah kebocoran
// informasi operasional — jadi konfigurasi yang hilang berarti tertutup,
// bukan terbuka.
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { appError } from "../../core/http/index.js";

/** Nama header pembawa token internal. */
export const INTERNAL_TOKEN_HEADER = "x-internal-token";

/**
 * Bandingkan dua token dalam waktu konstan. Keduanya di-hash dulu supaya
 * panjang buffer selalu sama — `timingSafeEqual` melempar bila panjang beda,
 * dan panjang token itu sendiri tidak boleh menjadi kebocoran.
 */
function tokenCocok(diberikan: string, diharapkan: string): boolean {
  const a = createHash("sha256").update(diberikan).digest();
  const b = createHash("sha256").update(diharapkan).digest();
  return timingSafeEqual(a, b);
}

export function createInternalAuth(expectedToken: string | undefined) {
  return function internalAuth(req: Request, _res: Response, next: NextFunction): void {
    const diberikan = req.header(INTERNAL_TOKEN_HEADER);

    if (
      expectedToken === undefined ||
      expectedToken === "" ||
      diberikan === undefined ||
      diberikan === "" ||
      !tokenCocok(diberikan, expectedToken)
    ) {
      // Alasan penolakan sengaja tidak dibedakan (token salah vs belum
      // dikonfigurasi) agar tidak memberi petunjuk ke pemanggil.
      next(appError("TIDAK_TERAUTENTIKASI"));
      return;
    }

    next();
  };
}
