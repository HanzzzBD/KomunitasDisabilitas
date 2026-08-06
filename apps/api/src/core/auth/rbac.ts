// core/auth — penjaga akses per-permintaan (PR-019, SDD §8.2).
//
// Tiga penjaga, dipasang oleh registrar (registry.ts) berdasarkan deklarasi
// akses route — bukan dipanggil manual di router, supaya tidak ada route yang
// bisa berjalan tanpa melewatinya.
//
//   requireAuth  — ada sesi yang sah. 401 bila tidak.
//   requireRole  — perannya termasuk yang diizinkan. 403 bila tidak.
//   requireSelf  — pemilik resource == pemilik sesi. 403 bila tidak (anti-IDOR).
//
// DUA KEPUTUSAN YANG MENENTUKAN BENTUK FILE INI:
//
// 1. `users.token_version` DIBACA DARI DB SETIAP PERMINTAAN terautentikasi.
//    Klaim `ver` di dalam access token tidak berarti apa-apa sampai ia
//    dibandingkan dengan nilai terkini — tanpa perbandingan itu, logout-semua-
//    perangkat (PR-018c) tidak mematikan apa pun selama 15 menit ke depan.
//    Biayanya satu lookup primary key per permintaan; pada skala MVP (~500 DAU)
//    itu tidak terasa, dan sebagai bonus akun terhapus langsung kehilangan akses
//    tanpa menunggu access token-nya kedaluwarsa. Cache Redis dicatat sebagai
//    follow-up, bukan kebutuhan sekarang.
//
// 2. PERAN DIAMBIL DARI DB, BUKAN DARI KLAIM TOKEN. Token hanya membuktikan
//    "siapa"; "boleh apa" dijawab baris user saat ini. Kalau tidak, penurunan
//    hak (admin → seeker) baru berlaku setelah `ver` di-bump — dan tidak ada
//    yang otomatis mem-bump saat peran berubah.
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@nawasena/schemas";
import { appError, asyncHandler } from "../http/index.js";
import type { TokenService } from "./tokens.js";
import type { GuardsFor, RouteAccess } from "./registry.js";

/** Identitas pemanggil setelah sesi terverifikasi. TIDAK memuat PII. */
export interface AuthContext {
  userId: string;
  role: UserRole;
  tokenVersion: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Diisi requireAuth; undefined pada route publik. Baca lewat authOf(). */
      auth?: AuthContext;
    }
  }
}

/** Sumber data user untuk verifikasi sesi; disuntik dari repository modul auth. */
export type SessionUserLookup = (
  userId: string,
) => Promise<{ id: string; role: UserRole; tokenVersion: number } | null>;

export interface AccessGuardDeps {
  /**
   * undefined = kunci RS256 belum di-set. Route ber-sesi menjawab 503, bukan
   * 401: masalahnya ada di server, dan "silakan masuk" akan menyuruh pengguna
   * mengulangi sesuatu yang memang belum bisa berhasil.
   */
  tokenService?: TokenService;
  findSessionUser: SessionUserLookup;
  /** Penjaga endpoint operator (/internal/*). Tanpa ini, akses "internal" gagal boot. */
  internalGuard?: RequestHandler;
}

/**
 * Ambil konteks sesi yang dijamin ada. Dipakai controller di route ber-guard.
 *
 * Ketiadaannya BUKAN kondisi yang boleh ditangani: itu berarti controller
 * dipasang pada route yang deklarasi aksesnya publik — bug pemrograman, dan
 * yang benar adalah 500 yang berisik, bukan 401 yang terlihat wajar.
 */
export function authOf(req: Request): AuthContext {
  if (req.auth === undefined) {
    throw new Error("authOf() dipanggil pada route tanpa requireAuth — periksa deklarasi aksesnya");
  }
  return req.auth;
}

/** Penjaga siap pasang + penerjemah deklarasi → middleware. */
export interface AccessGuards {
  requireAuth: RequestHandler;
  requireRole(roles: readonly UserRole[]): RequestHandler;
  requireSelf(param: string, alsoRoles: readonly UserRole[]): RequestHandler;
  guardsFor: GuardsFor;
}

export function createAccessGuards(deps: AccessGuardDeps): AccessGuards {
  const { tokenService, findSessionUser, internalGuard } = deps;

  /** Ambil bearer token; null bila header tidak ada atau bentuknya salah. */
  function bearerOf(req: Request): string | null {
    const header = req.header("authorization");
    if (header === undefined) return null;
    const [skema, ...sisa] = header.split(" ");
    if (skema?.toLowerCase() !== "bearer") return null;
    const token = sisa.join(" ").trim();
    return token === "" ? null : token;
  }

  const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
    if (tokenService === undefined) {
      throw appError("BELUM_SIAP", {
        message: "Layanan sesi belum tersedia",
        hint: "Coba lagi beberapa saat; laporkan bila terus terjadi",
      });
    }

    const token = bearerOf(req);
    if (token === null) throw appError("TIDAK_TERAUTENTIKASI");

    // Tanda tangan diperiksa DULU, baru DB disentuh: token karangan ditolak
    // tanpa pernah menghasilkan query, jadi lalu lintas tak terautentikasi
    // tidak bisa dipakai membebani database.
    const claims = await tokenService.verifyAccessToken(token);
    const user = claims === null ? null : await findSessionUser(claims.sub);

    // Satu kode untuk SEMUA bentuk penolakan token — kedaluwarsa, tanda tangan
    // salah, `ver` usang (logout-all), akun terhapus. Membedakannya kepada
    // klien hanya berguna bagi penebak; bagi pengguna jawabannya sama.
    if (claims === null || user === null || user.tokenVersion !== claims.ver) {
      throw appError("SESI_TIDAK_VALID");
    }

    req.auth = { userId: user.id, role: user.role, tokenVersion: user.tokenVersion };
    next();
  });

  /** Peran pemanggil harus termasuk daftar. Dipasang SETELAH requireAuth. */
  function requireRole(roles: readonly UserRole[]): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!roles.includes(authOf(req).role)) {
        next(appError("TIDAK_BERHAK"));
        return;
      }
      next();
    };
  }

  /**
   * Pemilik resource harus pemilik sesi (mitigasi IDOR). `param` adalah nama
   * route param yang memuat userId, mis. "userId" pada /users/:userId.
   *
   * Param yang tidak ada di route → 403, bukan lolos. Deklarasi yang salah tulis
   * tidak boleh berubah menjadi endpoint terbuka.
   */
  function requireSelf(param: string, alsoRoles: readonly UserRole[]): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction): void => {
      const auth = authOf(req);
      const pemilik = req.params[param];
      if (pemilik !== undefined && pemilik === auth.userId) {
        next();
        return;
      }
      if (alsoRoles.includes(auth.role)) {
        next();
        return;
      }
      // 403, bukan 404: pemanggil sudah terautentikasi, dan menyamarkan
      // keberadaan resource orang lain di sini tidak menambah keamanan apa pun
      // (id-nya sudah ia pegang) selain membingungkan pengguna yang salah tautan.
      next(appError("TIDAK_BERHAK"));
    };
  }

  /** Deklarasi akses → rantai middleware. Dipakai registrar saat mendaftarkan route. */
  const guardsFor: GuardsFor = (akses: RouteAccess): RequestHandler[] => {
    switch (akses.kind) {
      case "public":
        return [];
      case "internal":
        if (internalGuard === undefined) {
          // Boot gagal, bukan endpoint yang terbuka: route internal tanpa
          // penjaga adalah kebocoran informasi operasional.
          throw new Error("Akses 'internal' dideklarasikan tetapi internalGuard tidak disuntikkan");
        }
        return [internalGuard];
      case "authenticated":
        return [requireAuth];
      case "role":
        return [requireAuth, requireRole(akses.roles)];
      case "self":
        return [requireAuth, requireSelf(akses.param, akses.alsoRoles)];
    }
  };

  return { requireAuth, requireRole, requireSelf, guardsFor };
}
