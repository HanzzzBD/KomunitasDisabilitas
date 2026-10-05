// Integration HTTP Sign in with Google Android (PR-090): nonce → id_token →
// POST /auth/google/mobile lewat server Express nyata, JWKS TIRUAN yang
// dilayani server HTTP lokal, dan id_token RS256 yang ditandatangani sungguhan.
//
// Yang dibuktikan: nonce wajib, sekali pakai, dan hanya terbitan server;
// audience tetap Web Client ID; refresh token selalu di body (tanpa cookie);
// dan id_token tidak pernah muncul di log.
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import type { PrismaClient } from "@prisma/client";
import type { AuditAction } from "@nawasena/schemas";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { busUji } from "./helpers/events.js";
import { registrarUji } from "./helpers/routes.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import type { OtpRedisLike } from "../src/modules/auth/repositories/otp.repository.js";
import { GOOGLE_ISSUERS } from "../src/modules/auth/services/google-id-token.js";
import { SESSION_KEYS, fakeRefreshTokenStore } from "./helpers/session.js";

const CLIENT_ID = "123-uji.apps.googleusercontent.com";
const ANDROID_CLIENT_ID = "456-android.apps.googleusercontent.com";

let kunci: { publicKey: KeyLike; privateKey: KeyLike };
let jwksPalsu: Server;
let jwksUrl = "";

beforeAll(async () => {
  kunci = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(kunci.publicKey)), kid: "uji-1", alg: "RS256" };
  jwksPalsu = createHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwksPalsu.listen(0, "127.0.0.1", resolve));
  jwksUrl = `http://127.0.0.1:${(jwksPalsu.address() as AddressInfo).port}/certs`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => jwksPalsu.close(() => resolve()));
});

/** id_token khas Credential Manager: aud = Web Client ID, azp = client Android. */
async function idTokenUji(opsi: { nonce?: string; audience?: string } = {}): Promise<string> {
  return new SignJWT({
    email: "bayu@contoh.id",
    email_verified: true,
    name: "Bayu Santoso",
    azp: ANDROID_CLIENT_ID,
    ...(opsi.nonce === undefined ? {} : { nonce: opsi.nonce }),
  })
    .setProtectedHeader({ alg: "RS256", kid: "uji-1" })
    .setSubject("google-sub-android-1")
    .setIssuer(GOOGLE_ISSUERS[0])
    .setAudience(opsi.audience ?? CLIENT_ID)
    .setExpirationTime("1h")
    .sign(kunci.privateKey);
}

/** Redis in-memory dengan semantik `DEL` yang sebenarnya (jumlah terhapus). */
function redisMemori(): OtpRedisLike & { isi: Map<string, string> } {
  const isi = new Map<string, string>();
  return {
    isi,
    get: async (k) => isi.get(k) ?? null,
    set: async (k, v) => {
      isi.set(k, v);
      return "OK";
    },
    del: async (...ks) => ks.filter((k) => isi.delete(k)).length,
    incr: async () => 1,
    expire: async () => 1,
    ttl: async () => -2,
  };
}

interface BarisUser {
  id: string;
  googleId: string | null;
  email: string | null;
  fullName: string;
  deletedAt: Date | null;
}

function fakePrisma() {
  const users: BarisUser[] = [];
  const client = {
    user: {
      findFirst: ({ where }: { where: Partial<BarisUser> & { emailVerified?: boolean } }) => {
        const found = users.find(
          (u) =>
            (where.googleId === undefined || u.googleId === where.googleId) &&
            (where.email === undefined || u.email === where.email) &&
            (where.id === undefined || u.id === where.id) &&
            where.emailVerified !== false,
        );
        return Promise.resolve(
          found === undefined
            ? null
            : { ...found, role: "seeker", tokenVersion: 0, suspendedAt: null },
        );
      },
      create: ({ data }: { data: BarisUser }) => {
        users.push({ ...data, deletedAt: null });
        return Promise.resolve({ id: data.id });
      },
      update: () => Promise.resolve(undefined),
    },
    ...fakeRefreshTokenStore().prismaPart,
  };
  return { prisma: client as unknown as PrismaClient, users };
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(opsi: { googleAktif?: boolean } = {}) {
  const env = loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
  const baris: string[] = [];
  const logger = createLogger(env, {
    destination: new Writable({
      write(chunk, _enc, cb) {
        baris.push(String(chunk));
        cb();
      },
    }),
  });
  const { prisma, users } = fakePrisma();
  const redis = redisMemori();
  const audit: Array<{ action: AuditAction; meta: unknown }> = [];

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createAuthModule({
          routes: registrarUji("/api/v1"),
          prisma,
          redis,
          otpHashSecret: undefined,
          sessionKeys: SESSION_KEYS,
          google:
            opsi.googleAktif === false
              ? undefined
              : {
                  clientId: CLIENT_ID,
                  clientSecret: "rahasia-client-uji",
                  jwksUrl,
                  tokenUrl: "http://127.0.0.1:9/token",
                  timeoutMs: 5000,
                },
          auditLog: (_actor, action, _entity, _id, meta) => audit.push({ action, meta }),
          events: busUji(),
          logger,
        }),
      );
    },
  });
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, users, redis, audit, baris };
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function mintaNonce(base: string): Promise<string> {
  const res = await post(`${base}/auth/google/mobile/nonce`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { nonce: string } }).data.nonce;
}

describe("POST /api/v1/auth/google/mobile/nonce", () => {
  it("menerbitkan nonce base64url acak, no-store, disimpan sebagai hash", async () => {
    const { base, redis } = await boot();
    const res = await post(`${base}/auth/google/mobile/nonce`);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = (await res.json()) as { data: { nonce: string; expiresIn: number } };
    expect(data.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.expiresIn).toBe(300);
    // Nonce mentah tidak pernah ada di Redis — hanya SHA-256-nya.
    const kunciRedis = [...redis.isi.keys()];
    expect(kunciRedis).toHaveLength(1);
    expect(kunciRedis[0]).toMatch(/^google:nonce:[0-9a-f]{64}$/);
    expect(kunciRedis[0]).not.toContain(data.nonce);

    expect(await mintaNonce(base)).not.toBe(data.nonce);
  });
});

describe("POST /api/v1/auth/google/mobile — jalur berhasil", () => {
  it("id_token sah + nonce terbitan server → 200, refresh token di body, tanpa cookie", async () => {
    const { base, users, audit, baris } = await boot();
    const idToken = await idTokenUji({ nonce: await mintaNonce(base) });

    const res = await post(`${base}/auth/google/mobile`, { idToken });

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const { data } = (await res.json()) as {
      data: { userId: string; isNewUser: boolean; refreshToken?: string; accessToken: string };
    };
    expect(data.isNewUser).toBe(true);
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(users[0]).toMatchObject({ googleId: "google-sub-android-1", email: "bayu@contoh.id" });
    expect(audit).toEqual([
      { action: "AUTH_LOGIN_SUCCEEDED", meta: { method: "google", isNewUser: true } },
    ]);
    expect(baris.join("")).not.toContain(idToken);
  });
});

describe("POST /api/v1/auth/google/mobile — jalur ditolak", () => {
  it("nonce yang sama dipakai dua kali → kedua ditolak 401 (anti-replay)", async () => {
    const { base, audit } = await boot();
    const idToken = await idTokenUji({ nonce: await mintaNonce(base) });

    expect((await post(`${base}/auth/google/mobile`, { idToken })).status).toBe(200);
    const ulang = await post(`${base}/auth/google/mobile`, { idToken });

    expect(ulang.status).toBe(401);
    expect(await ulang.json()).toMatchObject({ code: "TOKEN_GOOGLE_TIDAK_VALID" });
    expect(audit.at(-1)).toEqual({
      action: "AUTH_LOGIN_FAILED",
      meta: { reason: "googleNonceInvalid" },
    });
  });

  it("dua permintaan bersamaan dengan nonce sama → tepat satu yang berhasil", async () => {
    const { base } = await boot();
    const idToken = await idTokenUji({ nonce: await mintaNonce(base) });

    const hasil = await Promise.all([
      post(`${base}/auth/google/mobile`, { idToken }),
      post(`${base}/auth/google/mobile`, { idToken }),
    ]);

    expect(hasil.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("nonce karangan klien (tidak pernah diterbitkan) → 401", async () => {
    const { base, users } = await boot();
    const idToken = await idTokenUji({ nonce: "nonce-karangan-klien-yang-panjangnya-cukup-43" });

    const res = await post(`${base}/auth/google/mobile`, { idToken });

    expect(res.status).toBe(401);
    expect(users).toHaveLength(0);
  });

  it("id_token tanpa klaim nonce → 401", async () => {
    const { base, audit } = await boot();
    const res = await post(`${base}/auth/google/mobile`, { idToken: await idTokenUji() });

    expect(res.status).toBe(401);
    expect(audit.at(-1)?.meta).toEqual({ reason: "googleNonceInvalid" });
  });

  it("audience = client Android (bukan Web Client ID) → 401, nonce TIDAK terbakar", async () => {
    const { base, redis, audit } = await boot();
    const nonce = await mintaNonce(base);
    const idToken = await idTokenUji({ nonce, audience: ANDROID_CLIENT_ID });

    const res = await post(`${base}/auth/google/mobile`, { idToken });

    expect(res.status).toBe(401);
    expect(audit.at(-1)?.meta).toEqual({ reason: "googleTokenInvalid" });
    // Tanda tangan/audience diperiksa SEBELUM nonce dikonsumsi.
    expect(redis.isi.size).toBe(1);
  });

  it("body tanpa idToken → 400 VALIDATION_ERROR", async () => {
    const { base } = await boot();
    const res = await post(`${base}/auth/google/mobile`, {});
    expect(res.status).toBe(400);
  });

  it("kredensial Google kosong → kedua rute 503 dengan saran OTP", async () => {
    const { base } = await boot({ googleAktif: false });

    for (const path of ["/auth/google/mobile/nonce", "/auth/google/mobile"]) {
      const res = await post(`${base}${path}`, { idToken: "x" });
      expect(res.status).toBe(503);
      expect(((await res.json()) as { hint: string }).hint).toContain("OTP");
    }
  });
});
