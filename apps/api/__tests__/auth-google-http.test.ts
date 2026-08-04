// Integration HTTP login Google (PR-017b): alur penuh POST /auth/google lewat
// server Express nyata, dengan token endpoint Google TIRUAN + JWKS TIRUAN yang
// dilayani server HTTP lokal dan token RS256 yang ditandatangani sungguhan.
//
// Yang dibuktikan di sini dan tidak bisa dibuktikan unit test: status & envelope
// yang benar-benar sampai ke klien, audit yang benar-benar terpanggil, bahwa
// `code`/`code_verifier`/token Google tidak pernah muncul di log, dan bahwa
// token Google selain id_token tidak pernah keluar dari lapisan penukaran.
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import type { PrismaClient } from "@prisma/client";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import type { OtpRedisLike } from "../src/modules/auth/repositories/otp.repository.js";
import type { AuditAction } from "@nawasena/schemas";
import { GOOGLE_ISSUERS } from "../src/modules/auth/services/google-id-token.js";
import { SESSION_KEYS, fakeRefreshTokenStore } from "./helpers/session.js";

const CLIENT_ID = "123-uji.apps.googleusercontent.com";
const CLIENT_SECRET = "rahasia-client-uji";
const CODE = "4/kode-otorisasi-uji-dari-google";
const VERIFIER = "a".repeat(64); // 43–128 karakter unreserved (RFC 7636)
const REDIRECT_URI = "http://localhost:5173/masuk/google";

let kunci: { publicKey: KeyLike; privateKey: KeyLike };
let googlePalsu: Server;
let jwksUrl = "";
let tokenUrl = "";

/** Diatur tiap test: bagaimana token endpoint Google tiruan harus menjawab. */
let balasanToken: { status: number; body: unknown } = { status: 200, body: {} };
/** Body form yang diterima token endpoint — untuk memeriksa PKCE ikut dikirim. */
let formDiterima: URLSearchParams | null = null;

beforeAll(async () => {
  kunci = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(kunci.publicKey)), kid: "uji-1", alg: "RS256", use: "sig" };

  googlePalsu = createHttpServer((req, res) => {
    if (req.url?.startsWith("/certs") === true) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    // /token — kumpulkan body lalu jawab sesuai skenario test.
    const potongan: Buffer[] = [];
    req.on("data", (c: Buffer) => potongan.push(c));
    req.on("end", () => {
      formDiterima = new URLSearchParams(Buffer.concat(potongan).toString());
      res.writeHead(balasanToken.status, { "content-type": "application/json" });
      res.end(JSON.stringify(balasanToken.body));
    });
  });
  await new Promise<void>((resolve) => googlePalsu.listen(0, "127.0.0.1", resolve));
  const { port } = googlePalsu.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${port}/certs`;
  tokenUrl = `http://127.0.0.1:${port}/token`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    googlePalsu.close((err) => (err ? reject(err) : resolve())),
  );
});

interface OpsiToken {
  audience?: string;
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

async function idTokenUji(opsi: OpsiToken = {}): Promise<string> {
  return new SignJWT({
    email: opsi.email ?? "rina@contoh.id",
    email_verified: opsi.emailVerified ?? true,
    name: opsi.name ?? "Rina Pratiwi",
  })
    .setProtectedHeader({ alg: "RS256", kid: "uji-1" })
    .setSubject(opsi.sub ?? "google-sub-uji-1")
    .setIssuer(GOOGLE_ISSUERS[0])
    .setAudience(opsi.audience ?? CLIENT_ID)
    .setExpirationTime("1h")
    .sign(kunci.privateKey);
}

/**
 * Balasan sukses khas Google: id_token DITEMANI access_token & refresh_token.
 * Sengaja disertakan supaya test bisa membuktikan keduanya tidak pernah
 * merembes ke response API maupun ke log.
 */
const ACCESS_TOKEN = "ya29.access-token-google-rahasia";
const REFRESH_TOKEN = "1//refresh-token-google-rahasia";

async function balasanSukses(opsi: OpsiToken = {}) {
  return {
    status: 200,
    body: {
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
      expires_in: 3599,
      scope: "openid email profile",
      token_type: "Bearer",
      id_token: await idTokenUji(opsi),
    },
  };
}

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

/** Redis fake — tidak dipakai jalur Google, hanya melengkapi wiring modul. */
function fakeRedis(): OtpRedisLike {
  return {
    async get() {
      return null;
    },
    async set() {
      return "OK";
    },
    async del() {
      return 0;
    },
    async incr() {
      return 1;
    },
    async expire() {
      return 1;
    },
    async ttl() {
      return -2;
    },
  };
}

interface BarisUser {
  id: string;
  googleId: string | null;
  email: string | null;
  fullName: string;
  deletedAt: Date | null;
}

/** Prisma palsu: satu tabel users in-memory, cukup untuk find-or-create/link. */
function fakePrisma(awal: BarisUser[] = []) {
  const users = [...awal];
  const refreshStore = fakeRefreshTokenStore();
  const client = {
    user: {
      findFirst: ({ where }: { where: Partial<BarisUser> & { id?: string } }) => {
        const found = users.find(
          (u) =>
            u.deletedAt === null &&
            (where.googleId === undefined || u.googleId === where.googleId) &&
            (where.email === undefined || u.email === where.email) &&
            // findActiveSessionUser (PR-018b) mencari lewat id.
            (where.id === undefined || u.id === where.id),
        );
        if (found === undefined) return Promise.resolve(null);
        return Promise.resolve({ ...found, role: "seeker", tokenVersion: 0 });
      },
      create: ({ data }: { data: BarisUser }) => {
        users.push({ ...data, deletedAt: null });
        return Promise.resolve({ id: data.id });
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<BarisUser> }) => {
        const baris = users.find((u) => u.id === where.id);
        if (baris !== undefined) Object.assign(baris, data);
        return Promise.resolve(baris);
      },
    },
    ...refreshStore.prismaPart,
  };
  return { prisma: client as unknown as PrismaClient, users, refreshRows: refreshStore.rows };
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
  formDiterima = null;
});

interface BootOptions {
  users?: BarisUser[];
  /** false = kredensial Google kosong (fitur dimatikan). */
  googleAktif?: boolean;
}

async function boot(options: BootOptions = {}) {
  const env = testEnv();
  const baris: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      baris.push(String(chunk));
      cb();
    },
  });
  const logger = createLogger(env, { destination });
  const { prisma, users } = fakePrisma(options.users);
  const audit: Array<{ action: AuditAction; entityId: string | null; meta: unknown }> = [];

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        "/api/v1",
        createAuthModule({
          prisma,
          redis: fakeRedis(),
          otpHashSecret: undefined, // jalur OTP tidak diuji di file ini
          sessionKeys: SESSION_KEYS, // sejak PR-018b login menerbitkan sesi
          google:
            options.googleAktif === false
              ? undefined
              : {
                  clientId: CLIENT_ID,
                  clientSecret: CLIENT_SECRET,
                  jwksUrl,
                  tokenUrl,
                  timeoutMs: 5000,
                },
          auditLog: (_actor, action, _entity, entityId, meta) => {
            audit.push({ action, entityId, meta });
          },
          logger,
        }),
      );
    },
  });
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, users, audit, baris };
}

const masuk = (base: string, body: unknown = { code: CODE, codeVerifier: VERIFIER, redirectUri: REDIRECT_URI }) =>
  fetch(`${base}/auth/google`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/v1/auth/google — jalur berhasil", () => {
  it("code + verifier sah → 200, akun baru dibuat dengan google_id (AC)", async () => {
    balasanToken = await balasanSukses();
    const { base, users, audit } = await boot();

    const res = await masuk(base);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { userId: string; isNewUser: boolean } };
    expect(body.data.isNewUser).toBe(true);

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      googleId: "google-sub-uji-1",
      email: "rina@contoh.id",
      fullName: "Rina Pratiwi",
    });
    expect(audit).toEqual([
      {
        action: "AUTH_LOGIN_SUCCEEDED",
        entityId: body.data.userId,
        meta: { method: "google", isNewUser: true },
      },
    ]);
  });

  it("PKCE benar-benar dikirim ke Google (grant_type, code_verifier, redirect_uri)", async () => {
    balasanToken = await balasanSukses();
    const { base } = await boot();
    await masuk(base);

    expect(formDiterima?.get("grant_type")).toBe("authorization_code");
    expect(formDiterima?.get("code")).toBe(CODE);
    expect(formDiterima?.get("code_verifier")).toBe(VERIFIER);
    expect(formDiterima?.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(formDiterima?.get("client_id")).toBe(CLIENT_ID);
    expect(formDiterima?.get("client_secret")).toBe(CLIENT_SECRET);
  });

  it("login ulang mendarat di akun yang SAMA, bukan akun baru (AC)", async () => {
    balasanToken = await balasanSukses();
    const { base, users, audit } = await boot();

    const pertama = (await (await masuk(base)).json()) as { data: { userId: string } };
    balasanToken = await balasanSukses();
    const kedua = (await (await masuk(base)).json()) as {
      data: { userId: string; isNewUser: boolean };
    };

    expect(kedua.data.userId).toBe(pertama.data.userId);
    expect(kedua.data.isNewUser).toBe(false);
    expect(users).toHaveLength(1);
    expect(audit.at(-1)?.meta).toEqual({ method: "google", isNewUser: false });
  });

  it("akun lama dengan email sama ditautkan, bukan diduplikasi", async () => {
    balasanToken = await balasanSukses();
    const { base, users } = await boot({
      users: [
        {
          id: "01912345-89ab-7def-8123-000000000009",
          googleId: null,
          email: "rina@contoh.id",
          fullName: "",
          deletedAt: null,
        },
      ],
    });

    const res = await masuk(base);
    const body = (await res.json()) as { data: { userId: string; isNewUser: boolean } };
    expect(body.data.isNewUser).toBe(false);
    expect(body.data.userId).toBe("01912345-89ab-7def-8123-000000000009");
    expect(users).toHaveLength(1);
    expect(users[0]?.googleId).toBe("google-sub-uji-1");
  });
});

describe("POST /api/v1/auth/google — jalur ditolak", () => {
  it("verifier PKCE salah → Google balas invalid_grant → 401 + audit gagal (AC)", async () => {
    balasanToken = {
      status: 400,
      body: { error: "invalid_grant", error_description: "code_verifier does not match" },
    };
    const { base, users, audit } = await boot();

    const res = await masuk(base);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "GOOGLE_EXCHANGE_GAGAL" });
    expect(users).toHaveLength(0); // tidak ada akun lahir dari penukaran gagal
    expect(audit).toEqual([
      {
        action: "AUTH_LOGIN_FAILED",
        entityId: null,
        meta: { reason: "googleExchangeFailed" },
      },
    ]);
  });

  it("id_token untuk audience lain → 401 + audit gagal (AC)", async () => {
    balasanToken = await balasanSukses({ audience: "aplikasi-lain.apps.googleusercontent.com" });
    const { base, users, audit } = await boot();

    const res = await masuk(base);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "TOKEN_GOOGLE_TIDAK_VALID" });
    expect(users).toHaveLength(0);
    expect(audit[0]?.meta).toEqual({ reason: "googleTokenInvalid" });
  });

  it("email Google belum terverifikasi → 403 + audit gagal (anti account-takeover)", async () => {
    balasanToken = await balasanSukses({ emailVerified: false });
    const { base, users, audit } = await boot();

    const res = await masuk(base);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "EMAIL_GOOGLE_BELUM_TERVERIFIKASI" });
    expect(users).toHaveLength(0);
    expect(audit[0]?.meta).toEqual({ reason: "googleEmailNotVerified" });
  });

  it("balasan 200 tanpa id_token (scope openid lupa diminta) → 401", async () => {
    balasanToken = { status: 200, body: { access_token: ACCESS_TOKEN, token_type: "Bearer" } };
    const { base } = await boot();
    expect((await masuk(base)).status).toBe(401);
  });

  it.each([
    ["verifier terlalu pendek", { code: CODE, codeVerifier: "pendek", redirectUri: REDIRECT_URI }],
    ["verifier berisi karakter terlarang", { code: CODE, codeVerifier: `${"a".repeat(50)} spasi`, redirectUri: REDIRECT_URI }],
    ["code kosong", { code: "", codeVerifier: VERIFIER, redirectUri: REDIRECT_URI }],
    ["redirectUri bukan URL", { code: CODE, codeVerifier: VERIFIER, redirectUri: "bukan-url" }],
    ["body kosong", {}],
  ])("input cacat ditolak sebelum menyentuh Google: %s", async (_nama, body) => {
    balasanToken = await balasanSukses();
    const { base, audit } = await boot();

    const res = await masuk(base, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(formDiterima).toBeNull(); // Google tidak pernah dihubungi
    expect(audit).toHaveLength(0);
  });

  it("kredensial Google belum di-set → 503 dengan saran masuk lewat OTP", async () => {
    const { base } = await boot({ googleAktif: false });
    const res = await masuk(base);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string; hint?: string };
    expect(body.code).toBe("BELUM_SIAP");
    expect(body.hint).toContain("OTP"); // pengguna diberi jalan keluar
  });
});

describe("kerahasiaan (AC: tidak ada token Google tersimpan permanen)", () => {
  it("response sukses hanya memuat identitas + sesi KITA — tanpa token Google apa pun", async () => {
    balasanToken = await balasanSukses();
    const { base } = await boot();

    const teks = await (await masuk(base)).text();
    // Sejak PR-018b response ikut membawa sesi kita sendiri. Kunci-kunci di
    // bawah di-assert EKSPLISIT (bukan objectContaining) supaya field baru
    // apa pun yang kelak menyelinap ke envelope ini terlihat di test.
    expect(JSON.parse(teks)).toEqual({
      data: {
        userId: expect.any(String),
        isNewUser: true,
        accessToken: expect.any(String),
        expiresIn: 900,
        // refreshToken TIDAK ada: klien web menerimanya sebagai cookie.
      },
    });
    expect(teks).not.toContain(ACCESS_TOKEN);
    expect(teks).not.toContain(REFRESH_TOKEN);
    expect(teks).not.toContain("id_token");
  });

  it("baris user yang disimpan tidak memuat token Google apa pun", async () => {
    balasanToken = await balasanSukses();
    const { base, users } = await boot();
    await masuk(base);

    const tersimpan = JSON.stringify(users);
    for (const rahasia of [ACCESS_TOKEN, REFRESH_TOKEN, CODE, VERIFIER, CLIENT_SECRET]) {
      expect(tersimpan).not.toContain(rahasia);
    }
    // Yang BOLEH tersimpan hanyalah tiga hal ini.
    expect(Object.keys(users[0] ?? {}).sort()).toEqual([
      "deletedAt",
      "email",
      "fullName",
      "googleId",
      "id",
    ]);
  });

  it("log tidak pernah memuat code, verifier, client_secret, atau token Google", async () => {
    balasanToken = await balasanSukses();
    const { base, baris } = await boot();
    await masuk(base);

    const log = baris.join("\n");
    for (const rahasia of [CODE, VERIFIER, CLIENT_SECRET, ACCESS_TOKEN, REFRESH_TOKEN]) {
      expect(log).not.toContain(rahasia);
    }
  });

  it("log penolakan menyebut JENIS kegagalan, bukan isi kredensial", async () => {
    balasanToken = {
      status: 400,
      body: { error: "invalid_grant", error_description: `verifier ${VERIFIER} salah` },
    };
    const { base, baris } = await boot();
    await masuk(base);

    const log = baris.join("\n");
    expect(log).toContain("invalid_grant"); // jenis kegagalan berguna untuk operasi
    expect(log).not.toContain(VERIFIER); // isi error_description tidak ikut
    expect(log).not.toContain(CODE);
  });
});
