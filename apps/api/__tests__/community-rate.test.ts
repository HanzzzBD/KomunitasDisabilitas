import { Redis } from "ioredis";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { loadEnv } from "../src/core/config/env.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createCommunityRateRepository } from "../src/modules/community/repositories/rate-limit.repository.js";
import { createCommunityService } from "../src/modules/community/services/community.service.js";
import type { CommunityRepository } from "../src/modules/community/repositories/community.repository.js";
import { busUji } from "./helpers/events.js";

describe("Community limiter", () => {
  it("invalid limits fail configuration rather than disabling protection", () => {
    const env = {
      DATABASE_URL: "postgresql://localhost/test",
      REDIS_URL: "redis://localhost",
      REDIS_QUEUE_URL: "redis://localhost",
    };
    for (const key of ["COMMUNITY_READ_MAX", "COMMUNITY_WRITE_MAX", "COMMUNITY_RATE_WINDOW_MS"]) {
      expect(() => loadEnv({ ...env, [key]: "0" })).toThrow();
      expect(() => loadEnv({ ...env, [key]: "1.5" })).toThrow();
    }
  });
  it("Redis errors fail closed with a retry hint", async () => {
    const service = createCommunityService({
      repository: {} as CommunityRepository,
      events: busUji(),
      auditLog: () => {},
      rate: {
        bump: async () => {
          throw new Error("unavailable");
        },
      },
    });
    await expect(service.checkRate("write", uuidV7())).rejects.toMatchObject({
      code: "BELUM_SIAP",
      retryAfterSeconds: 5,
    });
  });
  it("malformed Redis responses do not let a request through", async () => {
    const repo = createCommunityRateRepository({ eval: async () => ["one", 60_000] });
    await expect(repo.bump("read", uuidV7(), 60_000)).rejects.toThrow(
      "Penghitung Community tidak valid",
    );
  });
});

const redisUrl = process.env.REDIS_QUEUE_URL;
const redis = new Redis(redisUrl ?? "redis://127.0.0.1:6380", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
  connectTimeout: 2000,
});
redis.on("error", () => {});
const user = uuidV7();
const keys = ["read", "write"].map((bucket) => `community:rate:${bucket}:${user}`);
let available = false;
beforeAll(async () => {
  if (!redisUrl) return;
  try {
    await redis.connect();
    available = true;
  } catch (error) {
    if (process.env.CI) throw error;
  }
});
afterAll(async () => {
  if (available) await redis.del(...keys);
  redis.disconnect();
});

describe("Community limiter — actual Redis", () => {
  it("atomic concurrent counts, positive expiry, separate read/write and shared replica keys", async (ctx) => {
    if (!available) return ctx.skip();
    const a = createCommunityRateRepository(redis),
      b = createCommunityRateRepository(redis);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).bump("write", user, 1000)),
    );
    expect(results.map((v) => v.value).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(results.every((v) => v.retryAfterSeconds === 1)).toBe(true);
    expect(await redis.pttl(keys[1]!)).toBeGreaterThan(0);
    expect((await a.bump("read", user, 1000)).value).toBe(1);
    // Expire this test's exact key to prove the next window starts at one.
    await redis.pexpire(keys[1]!, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await b.bump("write", user, 1000)).value).toBe(1);
  });
});
