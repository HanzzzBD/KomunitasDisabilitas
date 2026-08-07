// Integration HTTP hapus akun (PR-021): server Express nyata, token RS256
// nyata, guard sesi dari registrar PR-019, repository OTP sungguhan di atas
// Redis tiruan, dan Google tiruan (JWKS + token endpoint) yang dilayani server
// HTTP lokal.
//
// Yang HANYA bisa dibuktikan di sini: status & envelope yang benar-benar sampai
// ke klien, bahwa cookie refresh benar-benar dibuang, bahwa akses SETELAH
// penghapusan benar-benar ditolak oleh guard, dan bahwa kode OTP maupun
// authorization code Google tidak pernah muncul di log.
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuditAction } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import { createOtpRepository, type OtpRedisLike } from "../src/modules/auth/repositories/otp.repository.js";
import { GOOGLE_ISSUERS } from "../src/modules/auth/services/google-id-token.js";
import { createTokenService } from "../src/core/auth/index.js";
import { registrarUji } from "./helpers/routes.js";
import { SESSION_KEYS, fakeRefreshTokenStore } from "./helpers/session.js";

const USER_OTP = "018f4c1e-0000-7000-8000-0000000000a1";
const USER_GOOGLE = "018f4c1e-0000-7000-8000-0000000000a2";
const PHONE = "+6281234567890";
const GOOGLE_SUB = "google-sub-pemilik";
const KODE_OTP = "482913";
const OTP_SECRET = "rahasia-pepper-otp-untuk-test-32-karakter";

const CLIENT_ID = "123-uji.apps.googleusercontent.com";
const CODE = "4/kode-otorisasi-uji";
const VERIFIER = "a".repeat(64);
const REDIRECT_URI = "http://localhost:5173/masuk/google";

const tokens = createTokenService(SESSION_KEYS);

let kunciGoogle: { publicKey: KeyLike; privateKey: KeyLike };
let googlePalsu: Server;
let jwksUrl = "";
let tokenUrl = "";
/** `sub` yang akan dikembalikan id_token Google tiruan pada test berjalan. */
let subDikembalikan = GOOGLE_SUB;

beforeAll(async () => {
  kunciGoogle = await generateKeyPair("RS256");
  const jwk: JWK = {
    ...(await exportJWK(kunciGoogle.publicKey)),
    kid: "uji-1",
    alg: "RS256",
    use: "sig",
  };

  googlePalsu = createHttpServer((req, res) => {
    if (req.url?.startsWith("/certs") === true) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    const potongan: Buffer[] = [];
    req.on("data", (c: Buffer) => potongan.push(c));
    req.on("end", () => {
      void (async () => {
        const idToken = await new SignJWT({ email: "pemilik@contoh.id", email_verified: true, name: "Pemilik" })
          .setProtectedHeader({ alg: "RS256", kid: "uji-1" })
          .setSubject(subDikembalikan)
          .setIssuer(GOOGLE_ISSUERS[0])
          .setAudience(CLIENT_ID)
          .setExpirationTime("1h")
          .sign(kunciGoogle.privateKey);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id_token: idToken, token_type: "Bearer", expires_in: 3599 }));
      })();
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

/** Redis in-memory seukuran kebutuhan repository OTP. */
function fakeRedis(): OtpRedisLike & { simpanan: Map<string, string> } {
  const simpanan = new Map<string, string>();
  return {
    simpanan,
    async get(key) {
      return simpanan.get(key) ?? null;
    },
    async set(key, value) {
      simpanan.set(key, value);
      return "OK";
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) if (simpanan.delete(k)) n += 1;
      return n;
    },
    async incr(key) {
      const next = Number(simpanan.get(key) ?? "0") + 1;
      simpanan.set(key, String(next));
      return next;
    },
    async expire() {
      return 1;
    },
    async ttl(key) {
      return simpanan.has(key) ? 300 : -2;
    },
  };
}

interface BarisUser {
  id: string;
  phone: string | null;
  googleId: string | null;
  role: "seeker";
  tokenVersion: number;
  deletedAt: Date | null;
}

function userAwal(): BarisUser[] {
  return [
    { id: USER_OTP, phone: PHONE, googleId: null, role: "seeker", tokenVersion: 0, deletedAt: null },
    { id: USER_GOOGLE, phone: null, googleId: GOOGLE_SUB, role: "seeker", tokenVersion: 0, deletedAt: null },
  ];
}

/**
 * Prisma palsu. Dua sifat ditiru dengan sengaja karena di situlah letak
 * kebenarannya: `deletedAt: null` di klausa where DIHORMATI (tanpa itu,
 * penghapusan tampak berhasil dua kali), dan `$transaction` menyerahkan klien
 * yang sama sehingga update users + pencabutan sesi terlihat sebagai satu
 * rangkaian. Atomisitas SUNGGUHAN hanya terbukti di auth-account-db.test.ts.
 */
function fakePrisma(rows: BarisUser[]) {
  const refreshStore = fakeRefreshTokenStore();
  const { refreshToken } = refreshStore.prismaPart;

  const user = {
    findFirst: ({ where }: { where: { id?: string; deletedAt?: null } }) => {
      const found = rows.find(
        (u) => u.id === where.id && (where.deletedAt !== null || u.deletedAt === null),
      );
      return Promise.resolve(found === undefined ? null : { ...found });
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string; deletedAt?: null };
      data: { deletedAt?: Date; tokenVersion?: { increment: number } };
    }) => {
      const baris = rows.find((u) => u.id === where.id && u.deletedAt === null);
      if (baris === undefined) {
        // Kelas error Prisma yang SUNGGUHAN. Repository membedakan P2025 lewat
        // `instanceof`, jadi tiruan berbentuk `Error & { code }` akan lolos ke
        // 500 — dan test yang memakainya lulus atas jalur yang tidak pernah
        // dijalankan produksi (pelajaran dari PR-020).
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError("Record to update not found", {
            code: "P2025",
            clientVersion: "5.22.0",
          }),
        );
      }
      if (data.deletedAt !== undefined) baris.deletedAt = data.deletedAt;
      if (data.tokenVersion !== undefined) baris.tokenVersion += data.tokenVersion.increment;
      return Promise.resolve({ ...baris });
    },
  };

  const client = {
    user,
    refreshToken,
    $transaction: <T>(fn: (tx: { user: typeof user; refreshToken: typeof refreshToken }) => Promise<T>) =>
      fn({ user, refreshToken }),
  };
  return { prisma: client as unknown as PrismaClient, refreshRows: refreshStore.rows };
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

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
  subDikembalikan = GOOGLE_SUB;
});

interface BootOptions {
  /** false = OTP_HASH_SECRET kosong (jalur OTP tertutup). */
  otpAktif?: boolean;
  /** false = kredensial Google kosong (jalur Google tertutup). */
  googleAktif?: boolean;
  /** Kode OTP yang sudah "terkirim" ke nomor pengguna. */
  kodeTersimpan?: string;
}

async function boot(options: BootOptions = {}) {
  const env = testEnv();
  const rows = userAwal();
  const logSink: string[] = [];
  const logger = createLogger(env, {
    destination: new Writable({
      write(chunk, _e, cb) {
        logSink.push(String(chunk));
        cb();
      },
    }),
  });
  const audit: Array<{ action: AuditAction; entityId: string | null; meta: unknown }> = [];
  const { prisma, refreshRows } = fakePrisma(rows);
  const redis = fakeRedis();

  // Kode "terkirim" ditanam lewat repository yang SAMA dengan yang dipakai
  // produksi — bukan dengan menulis kunci Redis dengan tangan. Hash ber-pepper
  // dan sidik nomor jadi ikut teruji; kalau salah satunya berubah, test ini
  // gagal alih-alih diam-diam mencocokkan bentuk yang sudah tidak dipakai.
  if (options.kodeTersimpan !== undefined) {
    await createOtpRepository({ redis, secret: OTP_SECRET }).saveCode(
      PHONE,
      options.kodeTersimpan,
      300,
    );
  }

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createAuthModule({
          routes: registrarUji("/api/v1", {
            tokenService: tokens,
            findSessionUser: (id) => {
              const u = rows.find((r) => r.deletedAt === null && r.id === id);
              return Promise.resolve(
                u === undefined ? null : { id: u.id, role: u.role, tokenVersion: u.tokenVersion },
              );
            },
          }),
          prisma,
          redis,
          otpHashSecret: options.otpAktif === false ? undefined : OTP_SECRET,
          sessionKeys: SESSION_KEYS,
          google:
            options.googleAktif === false
              ? undefined
              : { clientId: CLIENT_ID, clientSecret: "rahasia", jwksUrl, tokenUrl, timeoutMs: 5000 },
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
  return { base: `http://127.0.0.1:${port}/api/v1`, rows, refreshRows, audit, logSink };
}

async function tokenUntuk(userId: string, ver = 0): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role: "seeker", ver });
}

function hapus(base: string, token: string | undefined, body: unknown) {
  return fetch(`${base}/auth/account`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

/** Sesi hidup milik `userId` di tabel refresh_tokens palsu. */
function sesiHidup(refreshRows: ReturnType<typeof fakePrisma>["refreshRows"], userId: string) {
  return refreshRows.filter((r) => r.userId === userId && r.revokedAt === null);
}

function tanamSesi(refreshRows: ReturnType<typeof fakePrisma>["refreshRows"], userId: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    refreshRows.push({
      id: `refresh-${userId}-${i}`,
      userId,
      tokenHash: `hash-${userId}-${i}`,
      familyId: `family-${userId}-${i}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      revokedReason: null,
    });
  }
}

describe("DELETE /api/v1/auth/account — konfirmasi kode OTP", () => {
  it("kode benar → 204, akun ditandai terhapus, seluruh sesi dicabut", async () => {
    const { base, rows, refreshRows, audit } = await boot({ kodeTersimpan: KODE_OTP });
    tanamSesi(refreshRows, USER_OTP, 3);

    const res = await hapus(base, await tokenUntuk(USER_OTP), { otpCode: KODE_OTP });

    expect(res.status).toBe(204);
    const baris = rows.find((u) => u.id === USER_OTP);
    expect(baris?.deletedAt).toBeInstanceOf(Date);
    // `ver` naik: seluruh access token yang beredar langsung ditolak, tanpa
    // menunggu 15 menit sisa umurnya.
    expect(baris?.tokenVersion).toBe(1);
    expect(sesiHidup(refreshRows, USER_OTP)).toHaveLength(0);
    expect(refreshRows.every((r) => r.revokedReason === "account_deleted")).toBe(true);
    expect(audit.map((a) => (a.meta as { stage: string }).stage)).toEqual([
      "requested",
      "completed",
    ]);
  });

  it("baris tetap ADA di tabel — menunggu purge ≤ 30 hari (AC)", async () => {
    // Hak hapus PDP diwujudkan sebagai soft delete justru supaya penghapusan
    // keliru masih bisa dibatalkan lewat dukungan pelanggan sebelum PR-023
    // membuangnya. Kalau baris ini benar-benar hilang sekarang, janji itu bohong.
    const { base, rows } = await boot({ kodeTersimpan: KODE_OTP });

    await hapus(base, await tokenUntuk(USER_OTP), { otpCode: KODE_OTP });

    expect(rows.some((u) => u.id === USER_OTP)).toBe(true);
  });

  it("cookie refresh dibuang bersama sesinya", async () => {
    const { base } = await boot({ kodeTersimpan: KODE_OTP });

    const res = await hapus(base, await tokenUntuk(USER_OTP), { otpCode: KODE_OTP });

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("nawasena_refresh=");
    // Atribut harus sama persis dengan saat dipasang, terutama Path — cookie
    // yang "dihapus" dengan path berbeda akan tetap hidup di browser.
    expect(cookie).toContain("Path=/api/v1/auth");
  });

  it("setelah dihapus, permintaan berikutnya ditolak guard (AC: akses pasca-hapus)", async () => {
    const { base } = await boot({ kodeTersimpan: KODE_OTP });
    const token = await tokenUntuk(USER_OTP);

    expect((await hapus(base, token, { otpCode: KODE_OTP })).status).toBe(204);

    // Token yang sama, akun sudah tidak aktif: findSessionUser tidak menemukan
    // baris hidup, jadi requireAuth menolak sebelum controller mana pun jalan.
    const kedua = await hapus(base, token, { otpCode: KODE_OTP });
    expect(kedua.status).toBe(401);
    expect(((await kedua.json()) as { code: string }).code).toBe("SESI_TIDAK_VALID");
  });

  it("kode salah → 401 dan akun TIDAK tersentuh", async () => {
    const { base, rows, refreshRows, audit } = await boot({ kodeTersimpan: KODE_OTP });
    tanamSesi(refreshRows, USER_OTP, 2);

    const res = await hapus(base, await tokenUntuk(USER_OTP), { otpCode: "000000" });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("KODE_OTP_SALAH");
    expect(rows.find((u) => u.id === USER_OTP)?.deletedAt).toBeNull();
    expect(sesiHidup(refreshRows, USER_OTP)).toHaveLength(2);
    expect(audit.map((a) => (a.meta as { stage?: string }).stage)).toContain("rejected");
  });

  it("belum minta kode → 410, dengan arahan meminta kode baru", async () => {
    const { base } = await boot();

    const res = await hapus(base, await tokenUntuk(USER_OTP), { otpCode: KODE_OTP });

    expect(res.status).toBe(410);
    const body = (await res.json()) as { code: string; hint: string };
    expect(body.code).toBe("KODE_OTP_HANGUS");
    expect(body.hint.length).toBeGreaterThan(0);
  });

  it("akun tanpa nomor memakai jalur OTP → 400 dengan saran yang benar", async () => {
    const { base } = await boot({ kodeTersimpan: KODE_OTP });

    const res = await hapus(base, await tokenUntuk(USER_GOOGLE), { otpCode: KODE_OTP });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; hint: string };
    expect(body.code).toBe("CARA_KONFIRMASI_TIDAK_COCOK");
    expect(body.hint).toContain("Google");
  });
});

describe("DELETE /api/v1/auth/account — konfirmasi Google", () => {
  const bodyGoogle = { google: { code: CODE, codeVerifier: VERIFIER, redirectUri: REDIRECT_URI } };

  it("consent dari akun Google yang sama → 204", async () => {
    const { base, rows, refreshRows } = await boot();
    tanamSesi(refreshRows, USER_GOOGLE, 1);

    const res = await hapus(base, await tokenUntuk(USER_GOOGLE), bodyGoogle);

    expect(res.status).toBe(204);
    expect(rows.find((u) => u.id === USER_GOOGLE)?.deletedAt).toBeInstanceOf(Date);
    expect(sesiHidup(refreshRows, USER_GOOGLE)).toHaveLength(0);
  });

  it("consent dari akun Google LAIN → 403 dan akun tidak tersentuh", async () => {
    subDikembalikan = "google-sub-orang-lain";
    const { base, rows } = await boot();

    const res = await hapus(base, await tokenUntuk(USER_GOOGLE), bodyGoogle);

    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("KONFIRMASI_GOOGLE_BEDA_AKUN");
    expect(rows.find((u) => u.id === USER_GOOGLE)?.deletedAt).toBeNull();
  });

  it("kredensial Google kosong di server → 503, bukan penghapusan tanpa bukti", async () => {
    const { base, rows } = await boot({ googleAktif: false });

    const res = await hapus(base, await tokenUntuk(USER_GOOGLE), bodyGoogle);

    expect(res.status).toBe(503);
    expect(rows.find((u) => u.id === USER_GOOGLE)?.deletedAt).toBeNull();
  });
});

describe("DELETE /api/v1/auth/account — penjagaan dan validasi", () => {
  it("tanpa token → 401, tanpa menyentuh apa pun", async () => {
    const { base, rows } = await boot({ kodeTersimpan: KODE_OTP });

    const res = await hapus(base, undefined, { otpCode: KODE_OTP });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("TIDAK_TERAUTENTIKASI");
    expect(rows.every((u) => u.deletedAt === null)).toBe(true);
  });

  it("`ver` usang (sudah logout semua perangkat) → 401", async () => {
    const { base } = await boot({ kodeTersimpan: KODE_OTP });

    const res = await hapus(base, await tokenUntuk(USER_OTP, 99), { otpCode: KODE_OTP });

    expect(res.status).toBe(401);
  });

  it("tanpa cara konfirmasi → 400 dengan pesan yang menyebut apa yang kurang", async () => {
    const { base } = await boot();

    const res = await hapus(base, await tokenUntuk(USER_OTP), {});

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; hint: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    // Pesan dibacakan screen reader apa adanya — ia harus menyebut jalan
    // keluarnya, bukan sekadar menyatakan bahwa input salah.
    expect(body.hint).toMatch(/OTP/i);
  });

  it("dua cara sekaligus → 400, bukan salah satu dipilihkan diam-diam", async () => {
    const { base } = await boot({ kodeTersimpan: KODE_OTP });

    const res = await hapus(base, await tokenUntuk(USER_OTP), {
      otpCode: KODE_OTP,
      google: { code: CODE, codeVerifier: VERIFIER, redirectUri: REDIRECT_URI },
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("kode OTP dan authorization code tidak pernah muncul di log", async () => {
    const { base, logSink } = await boot({ kodeTersimpan: KODE_OTP });

    await hapus(base, await tokenUntuk(USER_OTP), { otpCode: KODE_OTP });
    await hapus(base, await tokenUntuk(USER_GOOGLE), {
      google: { code: CODE, codeVerifier: VERIFIER, redirectUri: REDIRECT_URI },
    });

    const semua = logSink.join("");
    expect(semua).not.toContain(KODE_OTP);
    expect(semua).not.toContain(CODE);
    expect(semua).not.toContain(VERIFIER);
    expect(semua).not.toContain(PHONE);
  });
});
