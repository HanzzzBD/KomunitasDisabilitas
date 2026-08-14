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
import { busUji } from "./helpers/events.js";
import { registrarUji } from "./helpers/routes.js";
import { createAuthModule, createOtpSenderFromEnv } from "../src/modules/auth/index.js";
import type { OtpRedisLike } from "../src/modules/auth/repositories/otp.repository.js";
import type { OtpSender } from "../src/modules/auth/services/otp-sender.js";
import type { FetchLike } from "../src/modules/auth/services/fonnte.sender.js";
import { SESSION_KEYS, fakeRefreshTokenStore } from "./helpers/session.js";

const refreshStore = fakeRefreshTokenStore();

const PHONE = "+6281234567890";
const SECRET = "rahasia-uji-otp-minimal-32-karakter!!";

/**
 * Kode dibaca KEMBALI dari isi pesan, bukan dari field terpisah (PR-021b, sejak
 * transport hanya membawa teks jadi). Itu persis yang dilakukan pengguna saat
 * menerima WhatsApp/SMS-nya — jadi pesan yang salah bentuk menggagalkan test,
 * bukan lolos diam-diam karena kodenya masih tersedia lewat pintu belakang.
 */
const kodeDari = (text: string): string => /\b(\d{6})\b/.exec(text)?.[1] ?? "";

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
      // Dua pemanggil: find-or-create by phone (where.phone) dan
      // findActiveSessionUser (where.id) — PR-018b.
      findFirst: ({ where }: { where: { phone?: string; id?: string } }) => {
        const found = users.find(
          (u) =>
            u.deletedAt === null &&
            (where.phone === undefined || u.phone === where.phone) &&
            (where.id === undefined || u.id === where.id),
        );
        if (found === undefined) return Promise.resolve(null);
        return Promise.resolve({ ...found, role: "seeker", tokenVersion: 0 });
      },
      create: ({ data }: { data: { id: string; phone: string } }) => {
        users.push({ id: data.id, phone: data.phone, deletedAt: null });
        return Promise.resolve({ id: data.id });
      },
    },
    ...refreshStore.prismaPart,
  } as unknown as PrismaClient;
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

interface BootOptions {
  otpHashSecret?: string | undefined;
  /** Ganti sender mock bawaan (mis. rantai Fonnte→Twilio dengan fetch palsu). */
  sender?: OtpSender;
  /** undefined eksplisit = uji perilaku tanpa kunci sesi (503). */
  sessionKeys?: typeof SESSION_KEYS | undefined;
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
  const terkirim: Array<{ phone: string; text: string }> = [];
  const sender: OtpSender = {
    name: "uji",
    async send(message) {
      terkirim.push({ ...message });
    },
  };

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createAuthModule({
          routes: registrarUji("/api/v1"),
          prisma: fakePrisma(),
          redis: fakeRedis(),
          otpHashSecret: "otpHashSecret" in options ? options.otpHashSecret : SECRET,
          sender: options.sender ?? sender,
          // Sejak PR-018b login menerbitkan sesi; tanpa kunci semuanya 503.
          sessionKeys: "sessionKeys" in options ? options.sessionKeys : SESSION_KEYS,
          auditLog: () => {},
          events: busUji(),
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
      code: kodeDari(terkirim[0]!.text),
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
      await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code: kodeDari(terkirim[0]!.text) })
    ).json()) as { data: { userId: string } };

    await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const kedua = (await (
      await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code: kodeDari(terkirim[1]!.text) })
    ).json()) as { data: { userId: string; isNewUser: boolean } };

    expect(kedua.data.userId).toBe(pertama.data.userId);
    expect(kedua.data.isNewUser).toBe(false);
  });

  it("kode salah → 401 envelope KODE_OTP_SALAH", async () => {
    const { base, terkirim } = await boot();
    await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    const salah = kodeDari(terkirim[0]!.text) === "000000" ? "111111" : "000000";
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

describe("alur penuh dengan rantai provider (PR-016b)", () => {
  /** fetch palsu: Fonnte membalas 500, Twilio membalas 201. */
  function fetchFonnteMati() {
    const dipanggil: string[] = [];
    let pesanTwilio = "";
    const impl: FetchLike = (url, init) => {
      dipanggil.push(url);
      if (url.includes("fonnte")) return Promise.resolve(new Response("{}", { status: 500 }));
      pesanTwilio = new URLSearchParams(String(init.body)).get("Body") ?? "";
      return Promise.resolve(new Response("{}", { status: 201 }));
    };
    return { impl, dipanggil, pesanTwilio: () => pesanTwilio };
  }

  it("Fonnte gagal → OTP tetap terkirim lewat Twilio dan verify berhasil (AC)", async () => {
    const palsu = fetchFonnteMati();
    const env = loadEnv({
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
      REDIS_URL: "redis://127.0.0.1:9",
      REDIS_QUEUE_URL: "redis://127.0.0.1:9",
      NODE_ENV: "test",
      FONNTE_TOKEN: "token-uji",
      FONNTE_BASE_URL: "https://fonnte.uji",
      TWILIO_ACCOUNT_SID: "ACuji0000000000000000000000000000",
      TWILIO_AUTH_TOKEN: "token-twilio-uji",
      TWILIO_FROM: "+15550000000",
      TWILIO_BASE_URL: "https://twilio.uji",
    });
    const { base } = await boot({
      sender: createOtpSenderFromEnv(env, { warn: () => {} }, palsu.impl),
    });

    const res = await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    expect(res.status).toBe(202);
    expect(palsu.dipanggil.some((url) => url.includes("fonnte"))).toBe(true);
    expect(palsu.dipanggil.some((url) => url.includes("twilio"))).toBe(true);

    // Kode yang benar-benar dikirim Twilio harus diterima endpoint verify.
    const code = /(\d{6})/.exec(palsu.pesanTwilio())?.[1] ?? "";
    const verify = await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code });
    expect(verify.status).toBe(200);
  });

  it("kedua provider mati → 503 dan kode dihanguskan", async () => {
    const impl: FetchLike = () => Promise.resolve(new Response("{}", { status: 500 }));
    const env = loadEnv({
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
      REDIS_URL: "redis://127.0.0.1:9",
      REDIS_QUEUE_URL: "redis://127.0.0.1:9",
      NODE_ENV: "test",
      FONNTE_TOKEN: "token-uji",
      TWILIO_ACCOUNT_SID: "ACuji0000000000000000000000000000",
      TWILIO_AUTH_TOKEN: "token-twilio-uji",
      TWILIO_FROM: "+15550000000",
    });
    const { base } = await boot({
      sender: createOtpSenderFromEnv(env, { warn: () => {} }, impl),
    });

    const res = await kirimJson(`${base}/auth/otp/request`, { phone: PHONE });
    expect(res.status).toBe(503);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "BELUM_SIAP" });
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
    const code = kodeDari(terkirim[0]!.text);
    await kirimJson(`${base}/auth/otp/verify`, { phone: PHONE, code });

    const log = baris.join("\n");
    expect(log.length).toBeGreaterThan(0);
    expect(log).not.toContain(PHONE);
    expect(log).not.toContain("6281234567890");
    expect(log).not.toContain(`"${code}"`);
  });
});
