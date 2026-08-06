import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createDbClient } from "../src/core/db/index.js";
import { createRedisClients } from "../src/core/redis/index.js";
import { createHealthService } from "../src/modules/health/index.js";
import { createHealthModule } from "../src/modules/health/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { registrarUji } from "./helpers/routes.js";
import type { DbClient } from "../src/core/db/index.js";
import type { RedisClients } from "../src/core/redis/index.js";

// ---- Unit: service dengan ping fake ----

function fakeDb(ok: boolean, delayMs = 0): DbClient {
  return {
    ping: () => new Promise((resolve) => setTimeout(() => resolve(ok), delayMs)),
    end: async () => {},
  };
}

function fakeRedis(cacheOk: boolean, queueOk: boolean): RedisClients {
  const marker = { cache: "cache", queue: "queue" };
  return {
    cache: marker.cache as never,
    queue: marker.queue as never,
    ping: async (client) => ((client as never) === marker.cache ? cacheOk : queueOk),
    end: async () => {},
  };
}

describe("health service (unit)", () => {
  it("liveness selalu hidup tanpa menyentuh dependensi", () => {
    const service = createHealthService(fakeDb(false), fakeRedis(false, false));
    expect(service.liveness()).toEqual({ status: "hidup" });
  });

  it("readiness siap hanya bila SEMUA dependensi ok", async () => {
    expect((await createHealthService(fakeDb(true), fakeRedis(true, true)).readiness()).siap).toBe(
      true,
    );
    expect((await createHealthService(fakeDb(false), fakeRedis(true, true)).readiness()).siap).toBe(
      false,
    );
    expect((await createHealthService(fakeDb(true), fakeRedis(false, true)).readiness()).siap).toBe(
      false,
    );
    expect((await createHealthService(fakeDb(true), fakeRedis(true, false)).readiness()).siap).toBe(
      false,
    );
  });

  it("detail menyebut dependensi mana yang gagal", async () => {
    const { detail } = await createHealthService(fakeDb(true), fakeRedis(false, true)).readiness();
    expect(detail).toEqual({ db: true, redisCache: false, redisQueue: true });
  });

  it("ping menggantung dianggap gagal setelah timeout (2s)", async () => {
    const service = createHealthService(fakeDb(true, 10_000), fakeRedis(true, true));
    const start = performance.now();
    const { siap, detail } = await service.readiness();
    expect(performance.now() - start).toBeLessThan(5000);
    expect(siap).toBe(false);
    expect(detail.db).toBe(false);
  });
});

// ---- Integration: endpoint nyata dengan dependensi MATI (Testing Checklist) ----

function testEnv(): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9", // port discard — pasti mati
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
}

let active: ApiServer | null = null;
let cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  await active?.stop();
  active = null;
  await Promise.allSettled(cleanup.map((fn) => fn()));
  cleanup = [];
});

async function bootWithDeadDeps() {
  const env = testEnv();
  const destination = new Writable({ write: (_c, _e, cb) => cb() });
  const logger = createLogger(env, { destination });
  const db = createDbClient(env);
  const redis = createRedisClients(env);
  cleanup.push(
    () => db.end(),
    () => redis.end(),
  );
  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(createHealthModule(db, redis, registrarUji()));
    },
  });
  const { port } = await api.start();
  return { api, base: `http://127.0.0.1:${port}` };
}

describe("health endpoints (integration, dependensi mati)", () => {
  it("/healthz tetap 200 meski DB/Redis mati (liveness murni)", async () => {
    const { api, base } = await bootWithDeadDeps();
    active = api;
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "hidup" } });
  });

  it("/readyz → 503 envelope BELUM_SIAP saat dependensi mati (AC)", async () => {
    const { api, base } = await bootWithDeadDeps();
    active = api;
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: "BELUM_SIAP",
      message: "Layanan sedang tidak siap",
      hint: "Tunggu sebentar, lalu coba lagi",
    });
  });
});
