// HTTP end-to-end sesi (PR-018b) — server Express NYATA, fetch sungguhan.
// AC: "Cookie web ber-flag lengkap (snapshot header)" + rotasi/reuse lewat HTTP.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { registrarUji } from "./helpers/routes.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import type { OtpRedisLike } from "../src/modules/auth/repositories/otp.repository.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { SESSION_KEYS, fakeRefreshTokenStore } from "./helpers/session.js";

const USER_ID = uuidV7();

function testEnv(): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
  });
}

const fakeRedis = (): OtpRedisLike => ({}) as OtpRedisLike;

function fakePrisma(deleted = false) {
  const store = fakeRefreshTokenStore();
  let tokenVersion = 0;
  const client = {
    user: {
      findFirst: ({ where }: { where: { id?: string } }) =>
        Promise.resolve(
          deleted || where.id !== USER_ID ? null : { id: USER_ID, role: "seeker", tokenVersion },
        ),
      // bumpTokenVersion (logout-all, PR-018c).
      update: ({ where }: { where: { id: string } }) => {
        if (deleted || where.id !== USER_ID) return Promise.reject(bukanDitemukan());
        tokenVersion += 1;
        return Promise.resolve({ tokenVersion });
      },
    },
    ...store.prismaPart,
  };
  return { prisma: client as unknown as PrismaClient, rows: store.rows };
}

/** Meniru P2025 Prisma (baris tidak ditemukan) tanpa meng-import kelasnya. */
function bukanDitemukan(): Error {
  return Object.assign(new Error("P2025"), { code: "P2025" });
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(options: { sessionKeys?: typeof SESSION_KEYS; deleted?: boolean } = {}) {
  const env = testEnv();
  const logger = createLogger(env, {
    destination: new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  });
  const { prisma, rows } = fakePrisma(options.deleted);

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createAuthModule({
          routes: registrarUji("/api/v1"),
          prisma,
          redis: fakeRedis(),
          otpHashSecret: undefined,
          sessionKeys: "sessionKeys" in options ? options.sessionKeys : SESSION_KEYS,
          cookieSecure: true, // nilai produksi — snapshot menguji bentuk sebenarnya
          auditLog: () => {},
          logger,
        }),
      );
    },
  });
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, prisma, rows };
}

/** Terbitkan sesi awal langsung lewat service (login diuji di file lain). */
async function sesiAwal(prisma: PrismaClient) {
  const { createSessionService } = await import("../src/modules/auth/services/session.service.js");
  const { createTokenService } = await import("../src/core/auth/tokens.js");
  const { createRefreshTokenRepository } = await import(
    "../src/modules/auth/repositories/refresh-token.repository.js"
  );
  const { createAuthUserRepository } = await import(
    "../src/modules/auth/repositories/user.repository.js"
  );
  const service = createSessionService({
    tokenService: createTokenService(SESSION_KEYS),
    userRepository: createAuthUserRepository(prisma),
    refreshTokenRepository: createRefreshTokenRepository(prisma),
    auditLog: () => {},
  });
  return service.issue(USER_ID);
}

const refreshWeb = (base: string, cookie: string) =>
  fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: "{}",
  });

const refreshMobile = (base: string, refreshToken: string) =>
  fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

describe("POST /auth/refresh — klien web (cookie)", () => {
  it("cookie sah → 200, access token baru, cookie refresh diganti", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    const res = await refreshWeb(base, `nawasena_refresh=${awal.refreshToken}`);
    const body = (await res.json()) as { data: { accessToken: string; refreshToken?: string } };

    expect(res.status).toBe(200);
    expect(body.data.accessToken).toEqual(expect.any(String));
    // Refresh token web TIDAK pernah masuk body — hanya cookie.
    expect(body.data.refreshToken).toBeUndefined();
    expect(res.headers.get("set-cookie")).toContain("nawasena_refresh=");
  });

  it("cookie ber-flag LENGKAP: HttpOnly, Secure, SameSite=Strict, Path sempit, Max-Age (AC)", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    const res = await refreshWeb(base, `nawasena_refresh=${awal.refreshToken}`);
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/api/v1/auth");
    // 30 hari; toleransi beberapa detik untuk waktu eksekusi.
    const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThan(29 * 24 * 3600);
    expect(maxAge).toBeLessThanOrEqual(30 * 24 * 3600);
  });

  it("token lama tidak berlaku lagi setelah rotasi (rotating)", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    await refreshWeb(base, `nawasena_refresh=${awal.refreshToken}`);
    const ulang = await refreshWeb(base, `nawasena_refresh=${awal.refreshToken}`);

    expect(ulang.status).toBe(401);
    expect((await ulang.json()) as { code: string }).toMatchObject({ code: "SESI_TIDAK_VALID" });
  });

  it("reuse mencabut keluarga: token TERBARU pun ikut mati", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    const kedua = await refreshWeb(base, `nawasena_refresh=${awal.refreshToken}`);
    const cookieBaru = /nawasena_refresh=([^;]+)/.exec(kedua.headers.get("set-cookie") ?? "")?.[1];
    expect(cookieBaru).toBeDefined();

    // Reuse token pertama → seluruh keluarga dicabut.
    await refreshWeb(base, `nawasena_refresh=${awal.refreshToken}`);

    const setelah = await refreshWeb(base, `nawasena_refresh=${cookieBaru as string}`);
    expect(setelah.status).toBe(401);
  });

  it("tanpa cookie & tanpa body → 401 SESI_TIDAK_VALID (bukan 400)", async () => {
    const { base } = await boot();
    const res = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "SESI_TIDAK_VALID" });
  });

  it("cookie ditolak → cookie basi ikut dihapus dari browser", async () => {
    const { base } = await boot();
    const res = await refreshWeb(base, "nawasena_refresh=token-karangan");

    expect(res.status).toBe(401);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("nawasena_refresh=;");
    expect(setCookie).toContain("Path=/api/v1/auth"); // atribut sama = benar-benar terhapus
  });

  it("cookie lain di header tidak mengganggu pembacaan", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    const res = await refreshWeb(
      base,
      `theme=dark; nawasena_refresh=${awal.refreshToken}; lang=id`,
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /auth/refresh — klien mobile (body)", () => {
  it("token di body → 200 dan refresh baru DIKEMBALIKAN di body, tanpa cookie", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    const res = await refreshMobile(base, awal.refreshToken);
    const body = (await res.json()) as { data: { refreshToken?: string } };

    expect(res.status).toBe(200);
    expect(body.data.refreshToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).not.toBe(awal.refreshToken); // benar-benar dirotasi
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("token body salah → 401 tanpa menghapus cookie (mobile tidak punya cookie)", async () => {
    const { base } = await boot();
    const res = await refreshMobile(base, "token-karangan");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("akun dihapus setelah sesi terbit → refresh ditolak", async () => {
    const { prisma } = await boot();
    const awal = await sesiAwal(prisma);
    await active?.stop();

    const { base } = await boot({ deleted: true });
    // Baris refresh ada di store instance lain; yang diuji: user tidak aktif.
    const res = await refreshMobile(base, awal.refreshToken);
    expect(res.status).toBe(401);
  });
});

const keluar = (base: string, jalur: string, init: { cookie?: string; token?: string }) =>
  fetch(`${base}${jalur}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
    },
    body: JSON.stringify(init.token === undefined ? {} : { refreshToken: init.token }),
  });

describe("POST /auth/logout (PR-018c)", () => {
  it("cookie sah → 204, cookie dihapus, sesi tidak bisa diperpanjang lagi", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);
    const cookie = `nawasena_refresh=${awal.refreshToken}`;

    const res = await keluar(base, "/auth/logout", { cookie });

    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie") ?? "").toContain("nawasena_refresh=;");
    expect((await refreshWeb(base, cookie)).status).toBe(401);
  });

  it("mobile: token di body → 204", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    expect((await keluar(base, "/auth/logout", { token: awal.refreshToken })).status).toBe(204);
    expect((await refreshMobile(base, awal.refreshToken)).status).toBe(401);
  });

  it("IDEMPOTEN: tanpa token, token karangan, dan logout kedua kali → tetap 204", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    // Pengguna yang menekan "keluar" tidak boleh melihat kegagalan — dan
    // jawaban yang berbeda akan menjadikan endpoint ini alat penebak token.
    expect((await keluar(base, "/auth/logout", {})).status).toBe(204);
    expect((await keluar(base, "/auth/logout", { token: "karangan" })).status).toBe(204);
    expect((await keluar(base, "/auth/logout", { token: awal.refreshToken })).status).toBe(204);
    expect((await keluar(base, "/auth/logout", { token: awal.refreshToken })).status).toBe(204);
  });

  it("menandai baris dengan sebab `logout`, bukan `reuse`", async () => {
    const { base, prisma, rows } = await boot();
    const awal = await sesiAwal(prisma);
    await keluar(base, "/auth/logout", { token: awal.refreshToken });

    expect(rows[0]?.revokedReason).toBe("logout");
  });
});

describe("POST /auth/logout-all (PR-018c)", () => {
  it("mencabut SELURUH sesi pengguna, bukan hanya perangkat ini", async () => {
    const { base, prisma } = await boot();
    const hp = await sesiAwal(prisma);
    const laptop = await sesiAwal(prisma);

    const res = await keluar(base, "/auth/logout-all", { token: hp.refreshToken });

    expect(res.status).toBe(204);
    expect((await refreshMobile(base, hp.refreshToken)).status).toBe(401);
    expect((await refreshMobile(base, laptop.refreshToken)).status).toBe(401);
  });

  it("logout biasa TIDAK menjatuhkan perangkat lain (pembanding)", async () => {
    const { base, prisma } = await boot();
    const hp = await sesiAwal(prisma);
    const laptop = await sesiAwal(prisma);

    await keluar(base, "/auth/logout", { token: hp.refreshToken });

    expect((await refreshMobile(base, laptop.refreshToken)).status).toBe(200);
  });

  it("idempoten: token karangan → tetap 204", async () => {
    const { base } = await boot();
    expect((await keluar(base, "/auth/logout-all", { token: "karangan" })).status).toBe(204);
  });

  it("logout-all kedua kali → tetap 204 (bukan 401 karena sesi sudah habis)", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    expect((await keluar(base, "/auth/logout-all", { token: awal.refreshToken })).status).toBe(204);
    expect((await keluar(base, "/auth/logout-all", { token: awal.refreshToken })).status).toBe(204);
  });
});

describe("tanpa kunci sesi", () => {
  it.each(["/auth/refresh", "/auth/logout", "/auth/logout-all"])(
    "%s menjawab 503, bukan 404",
    async (jalur) => {
      const { base } = await boot({ sessionKeys: undefined });
      const res = await keluar(base, jalur, { token: "apa saja" });

      expect(res.status).toBe(503);
      expect((await res.json()) as { code: string }).toMatchObject({ code: "BELUM_SIAP" });
    },
  );
});

describe("kerahasiaan", () => {
  it("refresh token tidak pernah muncul di body response klien web", async () => {
    const { base, prisma } = await boot();
    const awal = await sesiAwal(prisma);

    const res = await refreshWeb(base, `nawasena_refresh=${awal.refreshToken}`);
    const teks = await res.text();

    expect(teks).not.toContain(awal.refreshToken);
    // Token baru pun tidak boleh bocor ke body pada jalur web.
    const cookieBaru = /nawasena_refresh=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
    expect(teks).not.toContain(cookieBaru as string);
  });

  it("hash yang tersimpan bukan token mentah", async () => {
    const { prisma, rows } = await boot();
    const awal = await sesiAwal(prisma);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(awal.refreshToken);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
