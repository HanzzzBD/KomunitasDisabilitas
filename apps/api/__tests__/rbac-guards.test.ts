// Unit penjaga RBAC (PR-019) — requireAuth / requireRole / requireSelf.
//
// Token yang dipakai di sini ditandatangani SUNGGUHAN dengan RS256, bukan
// di-stub: yang sedang diuji adalah jalur verifikasi yang benar-benar berjalan
// di produksi, termasuk penolakan tanda tangan asing.
import { describe, it, expect } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { generateKeyPairSync } from "node:crypto";
import type { UserRole } from "@nawasena/schemas";
import { AppError } from "../src/core/http/index.js";
import {
  access,
  createAccessGuards,
  createTokenService,
  type SessionUserLookup,
} from "../src/core/auth/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const USER_ID = "018f4c1e-0000-7000-8000-000000000001";
const USER_LAIN = "018f4c1e-0000-7000-8000-000000000002";

const tokens = createTokenService(SESSION_KEYS);

/** Lookup yang mencatat berapa kali DB "disentuh" — dipakai membuktikan urutan. */
function lookup(
  user: { id: string; role: UserRole; tokenVersion: number } | null,
): SessionUserLookup & { panggilan: number } {
  const fn = Object.assign(
    () => {
      fn.panggilan += 1;
      return Promise.resolve(user);
    },
    { panggilan: 0 },
  );
  return fn;
}

interface ReqPalsu {
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

/** Jalankan satu middleware; resolve dengan error yang diteruskan ke next(). */
function jalankan(
  handler: RequestHandler,
  opsi: ReqPalsu = {},
): Promise<{ err: unknown; req: Request }> {
  const req = {
    params: opsi.params ?? {},
    header: (nama: string) => opsi.headers?.[nama.toLowerCase()],
  } as unknown as Request;
  return new Promise((resolve) => {
    const next: NextFunction = (err?: unknown) => resolve({ err, req });
    handler(req, {} as Response, next);
  });
}

function bearer(token: string): ReqPalsu {
  return { headers: { authorization: `Bearer ${token}` } };
}

function kodeOf(err: unknown): string {
  return err instanceof AppError ? err.code : `bukan AppError: ${String(err)}`;
}

describe("requireAuth", () => {
  it("tanpa header Authorization → 401 TIDAK_TERAUTENTIKASI", async () => {
    const guards = createAccessGuards({ tokenService: tokens, findSessionUser: lookup(null) });
    const { err } = await jalankan(guards.requireAuth);
    expect(kodeOf(err)).toBe("TIDAK_TERAUTENTIKASI");
    expect((err as AppError).status).toBe(401);
  });

  it("skema selain Bearer ditolak (Basic, token telanjang)", async () => {
    const guards = createAccessGuards({ tokenService: tokens, findSessionUser: lookup(null) });
    for (const authorization of ["Basic abc", "abc", "Bearer "]) {
      const { err } = await jalankan(guards.requireAuth, { headers: { authorization } });
      expect(kodeOf(err)).toBe("TIDAK_TERAUTENTIKASI");
    }
  });

  it("token karangan → 401 SESI_TIDAK_VALID TANPA menyentuh DB", async () => {
    const cari = lookup({ id: USER_ID, role: "seeker", tokenVersion: 0 });
    const guards = createAccessGuards({ tokenService: tokens, findSessionUser: cari });

    const { err } = await jalankan(guards.requireAuth, bearer("bukan.jwt.sama.sekali"));

    expect(kodeOf(err)).toBe("SESI_TIDAK_VALID");
    // Inilah alasan verifikasi tanda tangan didahulukan: lalu lintas tak
    // terautentikasi tidak boleh bisa dipakai membebani database.
    expect(cari.panggilan).toBe(0);
  });

  it("token ditandatangani kunci lain → ditolak", async () => {
    const asing = createTokenService(generateKeyPairSync("rsa", { modulusLength: 2048 }));
    const token = await asing.signAccessToken({ sub: USER_ID, role: "admin", ver: 0 });
    const guards = createAccessGuards({
      tokenService: tokens,
      findSessionUser: lookup({ id: USER_ID, role: "admin", tokenVersion: 0 }),
    });

    const { err } = await jalankan(guards.requireAuth, bearer(token));
    expect(kodeOf(err)).toBe("SESI_TIDAK_VALID");
  });

  it("token sah + akun aktif → req.auth terisi", async () => {
    const token = await tokens.signAccessToken({ sub: USER_ID, role: "seeker", ver: 3 });
    const guards = createAccessGuards({
      tokenService: tokens,
      findSessionUser: lookup({ id: USER_ID, role: "seeker", tokenVersion: 3 }),
    });

    const { err, req } = await jalankan(guards.requireAuth, bearer(token));

    expect(err).toBeUndefined();
    expect(req.auth).toEqual({ userId: USER_ID, role: "seeker", tokenVersion: 3 });
  });

  it("`ver` usang (logout-all) → 401 meski tanda tangan sah dan belum kedaluwarsa", async () => {
    const token = await tokens.signAccessToken({ sub: USER_ID, role: "seeker", ver: 0 });
    const guards = createAccessGuards({
      tokenService: tokens,
      // logout-all sudah menaikkan versi di DB.
      findSessionUser: lookup({ id: USER_ID, role: "seeker", tokenVersion: 1 }),
    });

    const { err } = await jalankan(guards.requireAuth, bearer(token));
    expect(kodeOf(err)).toBe("SESI_TIDAK_VALID");
  });

  it("akun terhapus (lookup null) → 401, tanpa menunggu access token kedaluwarsa", async () => {
    const token = await tokens.signAccessToken({ sub: USER_ID, role: "seeker", ver: 0 });
    const guards = createAccessGuards({ tokenService: tokens, findSessionUser: lookup(null) });

    const { err } = await jalankan(guards.requireAuth, bearer(token));
    expect(kodeOf(err)).toBe("SESI_TIDAK_VALID");
  });

  it("PERAN DIAMBIL DARI DB, bukan dari klaim token", async () => {
    // Token lama menyatakan admin; barisnya sudah diturunkan menjadi seeker.
    const token = await tokens.signAccessToken({ sub: USER_ID, role: "admin", ver: 0 });
    const guards = createAccessGuards({
      tokenService: tokens,
      findSessionUser: lookup({ id: USER_ID, role: "seeker", tokenVersion: 0 }),
    });

    const { err, req } = await jalankan(guards.requireAuth, bearer(token));

    expect(err).toBeUndefined();
    expect(req.auth?.role).toBe("seeker");
  });

  it("tanpa kunci sesi → 503 BELUM_SIAP, bukan 401", async () => {
    const guards = createAccessGuards({ tokenService: undefined, findSessionUser: lookup(null) });
    const { err } = await jalankan(guards.requireAuth, bearer("apa-pun"));
    expect(kodeOf(err)).toBe("BELUM_SIAP");
    expect((err as AppError).status).toBe(503);
  });
});

describe("requireRole", () => {
  const guards = createAccessGuards({ tokenService: tokens, findSessionUser: lookup(null) });

  async function jalankanDenganPeran(role: UserRole, izin: UserRole[]) {
    const handler = guards.requireRole(izin);
    return new Promise<unknown>((resolve) => {
      const req = { auth: { userId: USER_ID, role, tokenVersion: 0 }, params: {} } as Request;
      handler(req, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
    });
  }

  it("peran cocok → lolos", async () => {
    expect(await jalankanDenganPeran("admin", ["admin"])).toBeUndefined();
  });

  it("seeker pada route admin-only → 403 TIDAK_BERHAK", async () => {
    const err = await jalankanDenganPeran("seeker", ["admin"]);
    expect(kodeOf(err)).toBe("TIDAK_BERHAK");
    expect((err as AppError).status).toBe(403);
  });

  it("daftar peran kosong menolak semua orang (deny-by-default)", async () => {
    expect(kodeOf(await jalankanDenganPeran("admin", []))).toBe("TIDAK_BERHAK");
  });
});

describe("requireSelf", () => {
  const guards = createAccessGuards({ tokenService: tokens, findSessionUser: lookup(null) });

  async function jalankanSelf(
    params: Record<string, string>,
    role: UserRole = "seeker",
    alsoRoles: UserRole[] = [],
  ) {
    const handler = guards.requireSelf("userId", alsoRoles);
    return new Promise<unknown>((resolve) => {
      const req = { auth: { userId: USER_ID, role, tokenVersion: 0 }, params } as unknown as Request;
      handler(req, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
    });
  }

  it("pemilik resource == pemilik sesi → lolos", async () => {
    expect(await jalankanSelf({ userId: USER_ID })).toBeUndefined();
  });

  it("resource milik user lain → 403 (mitigasi IDOR)", async () => {
    expect(kodeOf(await jalankanSelf({ userId: USER_LAIN }))).toBe("TIDAK_BERHAK");
  });

  it("param tidak ada di route (deklarasi salah tulis) → 403, BUKAN lolos", async () => {
    expect(kodeOf(await jalankanSelf({ idPengguna: USER_LAIN }))).toBe("TIDAK_BERHAK");
  });

  it("admin hanya lolos bila alsoRoles menyebutkannya secara eksplisit", async () => {
    expect(kodeOf(await jalankanSelf({ userId: USER_LAIN }, "admin"))).toBe("TIDAK_BERHAK");
    expect(await jalankanSelf({ userId: USER_LAIN }, "admin", ["admin"])).toBeUndefined();
  });
});

describe("guardsFor — deklarasi akses → rantai middleware", () => {
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: lookup(null),
    internalGuard: (_req, _res, next) => next(),
  });

  it("public tidak memasang penjaga apa pun", () => {
    expect(guards.guardsFor(access.public("alasan"))).toHaveLength(0);
  });

  it("authenticated/role/self selalu diawali requireAuth", () => {
    expect(guards.guardsFor(access.authenticated())).toEqual([guards.requireAuth]);
    expect(guards.guardsFor(access.role("admin"))[0]).toBe(guards.requireAuth);
    expect(guards.guardsFor(access.self("userId"))[0]).toBe(guards.requireAuth);
    expect(guards.guardsFor(access.role("admin"))).toHaveLength(2);
    expect(guards.guardsFor(access.self("userId"))).toHaveLength(2);
  });

  it("akses internal tanpa internalGuard → GAGAL, bukan terbuka", () => {
    const tanpa = createAccessGuards({ tokenService: tokens, findSessionUser: lookup(null) });
    expect(() => tanpa.guardsFor(access.internal("alasan"))).toThrow(/internalGuard/);
  });
});
