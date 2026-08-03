// Integration OTP–Redis (PR-016a) — Redis NYATA, pola skip-anggun seperti
// test DB/queue lain. Membuktikan yang tidak bisa dibuktikan fake in-memory:
// klien ioredis memenuhi kontrak OtpRedisLike dan TTL benar-benar berlaku.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Redis } from "ioredis";
import {
  createOtpRepository,
  type OtpRedisLike,
} from "../src/modules/auth/repositories/otp.repository.js";

const REDIS_URL = process.env.REDIS_URL ?? process.env.REDIS_QUEUE_URL ?? "redis://localhost:6380";
const SECRET = "rahasia-uji-otp-minimal-32-karakter!!";
/** Nomor uji khusus test — kunci Redis-nya dihapus di afterAll. */
const PHONE = "+6285700000016";

let redis: Redis | null = null;
let tersedia = false;

beforeAll(async () => {
  const client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.ping();
    redis = client;
    tersedia = true;
  } catch {
    client.disconnect();
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("Redis tidak terjangkau — integration test OTP dilewati.");
  }
});

afterAll(async () => {
  if (redis !== null) {
    const repo = createOtpRepository({ redis, secret: SECRET });
    const id = repo.fingerprint(PHONE);
    await redis.del(
      `otp:code:${id}`,
      `otp:try:${id}`,
      `otp:send:${id}`,
      `otp:strike:${id}`,
      `otp:lock:${id}`,
    );
    redis.disconnect();
  }
});

describe("repository OTP di Redis nyata", () => {
  it("klien ioredis memenuhi kontrak OtpRedisLike (kompilasi + runtime)", async (ctx) => {
    if (!tersedia || redis === null) return ctx.skip();
    const klien: OtpRedisLike = redis; // gagal typecheck bila kontrak melenceng
    expect(await klien.ttl("kunci-yang-tidak-ada-016")).toBe(-2);
  });

  it("kode tersimpan sebagai hash, cocok lewat matches(), dan hilang setelah drop", async (ctx) => {
    if (!tersedia || redis === null) return ctx.skip();
    const repo = createOtpRepository({ redis, secret: SECRET });

    await repo.saveCode(PHONE, "482913", 60);
    const hash = await repo.readCodeHash(PHONE);
    expect(hash).not.toBeNull();
    expect(hash).not.toContain("482913");
    expect(repo.matches(PHONE, "482913", hash!)).toBe(true);
    expect(repo.matches(PHONE, "482914", hash!)).toBe(false);

    await repo.dropCode(PHONE);
    expect(await repo.readCodeHash(PHONE)).toBeNull();
  });

  it("kode punya TTL (tidak abadi) dan pencacah kirim melaporkan sisa jendela", async (ctx) => {
    if (!tersedia || redis === null) return ctx.skip();
    const repo = createOtpRepository({ redis, secret: SECRET });

    await repo.saveCode(PHONE, "111111", 60);
    const sisaKode = await redis.ttl(`otp:code:${repo.fingerprint(PHONE)}`);
    expect(sisaKode).toBeGreaterThan(0);
    expect(sisaKode).toBeLessThanOrEqual(60);

    const pertama = await repo.bumpSend(PHONE, 120);
    const kedua = await repo.bumpSend(PHONE, 120);
    expect(pertama.value).toBe(1);
    expect(kedua.value).toBe(2);
    expect(kedua.resetInSeconds).toBeGreaterThan(0);
    expect(kedua.resetInSeconds).toBeLessThanOrEqual(120);
  });

  it("lock berumur pendek terbaca sebagai sisa detik, lalu nol setelah dihapus", async (ctx) => {
    if (!tersedia || redis === null) return ctx.skip();
    const repo = createOtpRepository({ redis, secret: SECRET });

    await repo.lock(PHONE, 30);
    expect(await repo.lockRemainingSeconds(PHONE)).toBeGreaterThan(0);

    await repo.clearAfterSuccess(PHONE);
    expect(await repo.lockRemainingSeconds(PHONE)).toBe(0);
  });
});
