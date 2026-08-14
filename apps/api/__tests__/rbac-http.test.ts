// Matriks authz awal lewat HTTP (PR-019) — server Express nyata, token RS256
// nyata, penjaga dipasang oleh registrar (bukan dirangkai manual di test).
//
// AC yang dijaga file ini: "Seeker akses resource user lain → 403" dan
// "Role admin-only ditolak untuk seeker".
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { UserRole } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import {
  access,
  assertRoutesDeclared,
  authOf,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { busUji } from "./helpers/events.js";
import { registrarUji } from "./helpers/routes.js";

const SEEKER = "018f4c1e-0000-7000-8000-00000000aaaa";
const SEEKER_LAIN = "018f4c1e-0000-7000-8000-00000000bbbb";
const ADMIN = "018f4c1e-0000-7000-8000-00000000cccc";

const tokens = createTokenService(SESSION_KEYS);

/** Tiga akun tetap; tokenVersion dinaikkan test yang menguji `ver`. */
const akun: Record<string, { id: string; role: UserRole; tokenVersion: number }> = {
  [SEEKER]: { id: SEEKER, role: "seeker", tokenVersion: 0 },
  [SEEKER_LAIN]: { id: SEEKER_LAIN, role: "seeker", tokenVersion: 0 },
  [ADMIN]: { id: ADMIN, role: "admin", tokenVersion: 0 },
};

function testEnv(): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
}

const balas = (req: Request, res: Response) => {
  res.status(200).json({ data: { userId: authOf(req).userId } });
};

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

/**
 * Server dengan modul fixture: satu route untuk setiap bentuk deklarasi akses.
 * PR-019 belum menambah endpoint produksi mana pun (PR-020 yang pertama
 * memakainya), jadi matriks awal diuji di atas router contoh — tetapi lewat
 * registrar dan penjaga yang sama persis dengan yang akan dipakai modul nyata.
 */
async function boot() {
  const env = testEnv();
  const logger = createLogger(env, {
    destination: new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  });

  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const routes = registry.forModule("/api/v1");

  routes
    .get("/uji/publik", access.public("halaman terbuka"), (_req, res) => {
      res.status(200).json({ data: { ok: true } });
    })
    .get("/uji/saya", access.authenticated(), balas)
    .get("/uji/pengguna/:userId", access.self("userId"), balas)
    .get("/uji/pengguna-admin/:userId", access.self("userId", { alsoRoles: ["admin"] }), balas)
    .get("/uji/admin", access.role("admin"), balas);

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(routes.router);
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, registry };
}

async function tokenUntuk(userId: string): Promise<string> {
  const user = akun[userId]!;
  return tokens.signAccessToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
}

function ambil(base: string, path: string, token?: string) {
  return fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

describe("matriks awal — requireSelf (anti-IDOR)", () => {
  it("seeker membaca resource USER LAIN → 403 (AC)", async () => {
    const { base } = await boot();
    const res = await ambil(base, `/uji/pengguna/${SEEKER_LAIN}`, await tokenUntuk(SEEKER));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "TIDAK_BERHAK" });
  });

  it("seeker membaca resource MILIKNYA SENDIRI → 200", async () => {
    const { base } = await boot();
    const res = await ambil(base, `/uji/pengguna/${SEEKER}`, await tokenUntuk(SEEKER));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { userId: SEEKER } });
  });

  it("admin hanya menembus requireSelf pada route yang menyatakannya", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(ADMIN);

    expect((await ambil(base, `/uji/pengguna/${SEEKER}`, token)).status).toBe(403);
    expect((await ambil(base, `/uji/pengguna-admin/${SEEKER}`, token)).status).toBe(200);
  });
});

describe("matriks awal — requireRole", () => {
  it("seeker pada route admin-only → 403 (AC)", async () => {
    const { base } = await boot();
    const res = await ambil(base, "/uji/admin", await tokenUntuk(SEEKER));

    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string; hint?: string };
    expect(body.code).toBe("TIDAK_BERHAK");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("admin pada route admin-only → 200", async () => {
    const { base } = await boot();
    expect((await ambil(base, "/uji/admin", await tokenUntuk(ADMIN))).status).toBe(200);
  });
});

describe("matriks awal — requireAuth", () => {
  it("tanpa token: route publik 200, route ber-sesi 401", async () => {
    const { base } = await boot();

    expect((await ambil(base, "/uji/publik")).status).toBe(200);
    for (const path of ["/uji/saya", "/uji/admin", `/uji/pengguna/${SEEKER}`]) {
      const res = await ambil(base, path);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "TIDAK_TERAUTENTIKASI" });
    }
  });

  it("`ver` yang sudah di-bump (logout-all) menolak access token lama", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(SEEKER);
    expect((await ambil(base, "/uji/saya", token)).status).toBe(200);

    akun[SEEKER]!.tokenVersion += 1; // logout-all
    try {
      const res = await ambil(base, "/uji/saya", token);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: "SESI_TIDAK_VALID" });
    } finally {
      akun[SEEKER]!.tokenVersion -= 1;
    }
  });
});

describe("router auth nyata", () => {
  it("seluruh endpoint auth terdeklarasi; hanya hapus akun yang menuntut sesi", () => {
    const registry = createRouteRegistry({ guardsFor: () => [] });
    createAuthModule({
      routes: registry.forModule("/api/v1"),
      prisma: {} as PrismaClient,
      redis: {} as never,
      otpHashSecret: undefined,
      sessionKeys: SESSION_KEYS,
      auditLog: () => {},
      events: busUji(),
      logger: { error: () => {}, warn: () => {} } as never,
    });

    const daftar = registry.list();
    expect(daftar.map((e) => `${e.method} ${e.path}`)).toEqual([
      "DELETE /api/v1/auth/account",
      "ALL /api/v1/auth/google",
      "POST /api/v1/auth/logout",
      "POST /api/v1/auth/logout-all",
      "ALL /api/v1/auth/otp/*",
      "POST /api/v1/auth/refresh",
    ]);

    // Hapus akun (PR-021) adalah SATU-SATUNYA route auth yang bukan pintu
    // masuk. Diperiksa terpisah — bukan dikecualikan dari perulangan di bawah —
    // supaya route baru yang diam-diam ikut menuntut sesi tetap terlihat.
    const [hapusAkun, ...pintuMasuk] = daftar;
    expect(hapusAkun?.path).toBe("/api/v1/auth/account");
    expect(hapusAkun?.access.kind).toBe("authenticated");

    // Keterbukaan pintu masuk harus selalu punya alasan tertulis — itulah yang
    // membuat review PR-106 bisa membedakan "publik karena perlu" dari lupa.
    for (const entry of pintuMasuk) {
      expect(entry.access.kind).toBe("public");
      expect(entry.access).toHaveProperty("reason");
    }
  });

  it("helper registrarUji memakai jalur registry yang sama", () => {
    expect(registrarUji("/api/v1").router).toBeTypeOf("function");
  });
});
