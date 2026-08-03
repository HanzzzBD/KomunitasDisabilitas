// Integration HTTP login OTP (PR-016a): alur penuh request → verify lewat
// server Express nyata, dengan Redis fake dan sender mock (tidak ada pesan
// keluar). Membuktikan envelope, status, header Retry-After, dan bahwa log
// request tidak pernah memuat nomor HP atau kode OTP.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createAuthModule } from "../src/modules/auth/index.js";
import type { OtpRedisLike } from "../src/modules/auth/repositories/otp.repository.js";
import type { OtpSender } from "../src/modules/auth/services/otp-sender.js";

const PHONE = "+6281234567890";
const SECRET = "rahasia-uji-otp-minimal-32-karakter!!";

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

/** Redis fake seminimal kontrak OtpRedisLike (tanpa kedaluwarsa otomatis). */
function fakeRedis(): OtpRedisLike {
  const nilai = new Map<string, string>();
  return {
    async get(key) {
      return nilai.get(key) ?? null;
    },
    async set(key, value) {
      nilai.set(key, value);
      return "OK";
    },
    async del(...keys) {
      let n = 0;
      for (const key of keys) if (nilai.delete(key)) n += 1;
      return n;
    },
    async incr(key) {
      const next = Number(nilai.get(key) ?? "0") + 1;
      nilai.set(key, String(next));
      return next;
    },
    async expire() {
      return 1;
    },
    async ttl(key) {
      return nilai.has(key) ? 3600 : -2;
    },
  };
}

/** Prisma palsu: satu tabel users in-memory, cukup untuk find-or-create. */
function fakePrisma(): PrismaClient {
  const users: Array<{ id: string; phone: string | null; deletedAt: Date | null }> = [];
  return {
    user: {
      findFirst: ({ where }: { where: { phone: string } }) =>
        Promise.resolve(
          users.find((u) => u.phone === where.phone && u.deletedAt === null) ?? null,
        ),
      create: ({ data }: { data: { id: string; phone: string } }) => {
        users.push({ id: data.id, phone: data.phone, deletedAt: null });
        return Promise.resolve({ id: data.id });
      },
    },
  } as unknown as PrismaClient;
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

interface BootOptions {
  otpHashSecret?: string | undefined;
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
  const terkirim: Array<{ phone: string; code: string }> = [];
  const sender: OtpSender = {
    name: "uji",
    async send(message) {
      terkirim.push({ ...message });
    },
  };

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        "/api/v1",
        createAuthModule({
          prisma: fakePrisma(),
          redis: fakeRedis(),
          otpHashSecret: "otpHashSecret" in options ? options.otpHashSecret : SECRET,
          sender,
          auditLog: () => {},
          logger,
        }),
      );
    },
  });
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, terkirim, baris };
}

const kirimJson = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/v1/auth/otp/request", () => {
  it("nomor valid → 202 dengan retryAfterSeconds", async () => {
    const { base, terkirim } = await boot();
    const res = await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ data: { retryAfterSeconds: 0 } });
    expect(terkirim).toHaveLength(1);
  });

  it("nomor bukan E.164 Indonesia → 400 envelope Bahasa Indonesia", async () => {
    const { base, terkirim } = await boot();
    const res = await kirimJson(`${base}/auth/otp/request`, { phone: "08123456789" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; hint?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.hint).toContain("+62");
    expect(terkirim).toHaveLength(0);
  });

  it("kirim ke-4 dalam 1 jam → 429 dengan header Retry-After (AC)", async () => {
    const { base } = await boot();
    for (let i = 0; i < 3; i += 1) await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const res = await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "TERLALU_BANYAK_PERMINTAAN",
    });
  });
});

describe("POST /api/v1/auth/otp/verify", () => {
  it("kode benar → 200 dan user baru dibuat (AC find-or-create)", async () => {
    const { base, terkirim } = await boot();
    await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const res = await kirimJson(`${base}/auth/otp/verify`, {
      phone: PHONE,
      code: terkirim[0]!.code,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { userId: string; isNewUser: boolean } };
    expect(body.data.isNewUser).toBe(true);
    expect(body.data.userId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("verifikasi kedua untuk nomor sama memakai akun yang sudah ada", async () => {
    const { base, terkirim } = await boot();
    await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const pertama = (await (
      await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code: terkirim[0]!.code })
    ).json()) as { data: { userId: string } };

    await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const kedua = (await (
      await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code: terkirim[1]!.code })
    ).json()) as { data: { userId: string; isNewUser: boolean } };

    expect(kedua.data.userId).toBe(pertama.data.userId);
    expect(kedua.data.isNewUser).toBe(false);
  });

  it("kode salah → 401 envelope KODE_OTP_SALAH", async () => {
    const { base, terkirim } = await boot();
    await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const salah = terkirim[0]!.code === "000000" ? "111111" : "000000";
    const res = await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code: salah });
    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "KODE_OTP_SALAH" });
  });

  it("kode bukan 6 angka → 400 sebelum menyentuh service", async () => {
    const { base } = await boot();
    const res = await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code: "12ab" });
    expect(res.status).toBe(400);
  });
});

describe("gerbang konfigurasi & kebersihan log", () => {
  it("tanpa OTP_HASH_SECRET seluruh endpoint OTP menjawab 503", async () => {
    const { base } = await boot({ otpHashSecret: undefined });
    for (const path of ["/auth/otp/request", "/auth/otp/verify"]) {
      const res = await kirimJson(`${base}${path}`, { phone: PHONE, code: "123456" });
      expect(res.status).toBe(503);
      expect((await res.json()) as { code: string }).toMatchObject({ code: "BELUM_SIAP" });
    }
  });

  it("log request tidak memuat nomor HP maupun kode OTP (AC)", async () => {
    const { base, terkirim, baris } = await boot();
    await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const code = terkirim[0]!.code;
    await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code });

    const log = baris.join("\n");
    expect(log.length).toBeGreaterThan(0);
    expect(log).not.toContain(PHONE);
    expect(log).not.toContain("6281234567890");
    expect(log).not.toContain(`"${code}"`);
  });
});
