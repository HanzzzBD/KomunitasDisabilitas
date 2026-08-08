import { describe, it, expect, vi, afterEach } from "vitest";
import { Writable } from "node:stream";
import { QUEUE_NAME, QUEUE_NAMES, dlqNameOf, internalQueuesResponseSchema } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { QUEUE_DEFAULTS, type QueueLike, type QueueRegistry } from "../src/core/queue/index.js";
import {
  createInternalAuth,
  createInternalModule,
  INTERNAL_TOKEN_HEADER,
} from "../src/modules/internal/index.js";
import { registrarUji } from "./helpers/routes.js";
import { createQueuesService } from "../src/modules/internal/services/queues.service.js";
import { createServer, type ApiServer } from "../src/server.js";

const TOKEN = "token-internal-dev";

function testEnv(overrides: NodeJS.ProcessEnv = {}): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/nawasena",
    REDIS_URL: "redis://localhost:6379",
    REDIS_QUEUE_URL: "redis://localhost:6380",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
    ...overrides,
  });
}

function queueDenganCacah(counts: Record<string, number>): QueueLike {
  return {
    add: vi.fn(() => Promise.resolve({ id: "j-1" })),
    getJobCounts: vi.fn(() => Promise.resolve(counts)),
    close: vi.fn(() => Promise.resolve()),
  } as unknown as QueueLike;
}

function registryPalsu(counts: Record<string, number> = {}): QueueRegistry {
  return {
    configOf: (name: keyof typeof QUEUE_DEFAULTS) => QUEUE_DEFAULTS[name],
    queueOf: () => queueDenganCacah(counts),
    enqueue: vi.fn(),
    close: vi.fn(),
  } as unknown as QueueRegistry;
}

async function bootTestServer(
  options: { token?: string; queueCounts?: Record<string, number>; dlqCounts?: Record<string, number> } = {},
) {
  const destination = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const env = testEnv();
  const api = createServer(env, createLogger(env, { destination }), {
    routes: (app) => {
      app.use(
        createInternalModule({
          registry: registryPalsu(
            options.queueCounts ?? { waiting: 2, active: 1, delayed: 0, failed: 3, completed: 10 },
          ),
          dlqQueueOf: () => queueDenganCacah(options.dlqCounts ?? {}),
          // Penjaga token internal kini datang dari deklarasi access.internal
          // (PR-019) — registrar yang memasangnya, bukan router.
          routes: registrarUji("", { internalGuard: createInternalAuth(options.token) }),
        }),
      );
    },
  });
  const { port } = await api.start();
  return { api, base: `http://127.0.0.1:${port}` };
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

describe("GET /internal/queues — penjaga token internal", () => {
  it("tanpa header token → 401 envelope Bahasa Indonesia", async () => {
    const { api, base } = await bootTestServer({ token: TOKEN });
    active = api;

    const res = await fetch(`${base}/internal/queues`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("TIDAK_TERAUTENTIKASI");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("token salah → 401", async () => {
    const { api, base } = await bootTestServer({ token: TOKEN });
    active = api;

    const res = await fetch(`${base}/internal/queues`, {
      headers: { [INTERNAL_TOKEN_HEADER]: "token-keliru" },
    });
    expect(res.status).toBe(401);
  });

  it("INTERNAL_TOKEN tidak dikonfigurasi → tertutup, BUKAN terbuka", async () => {
    const { api, base } = await bootTestServer({ token: undefined });
    active = api;

    const res = await fetch(`${base}/internal/queues`, {
      headers: { [INTERNAL_TOKEN_HEADER]: "tebakan-apa-pun" },
    });
    expect(res.status).toBe(401);
  });

  it("token benar → 200", async () => {
    const { api, base } = await bootTestServer({ token: TOKEN });
    active = api;

    const res = await fetch(`${base}/internal/queues`, {
      headers: { [INTERNAL_TOKEN_HEADER]: TOKEN },
    });
    expect(res.status).toBe(200);
  });

  it("respons penolakan identik apakah token dikonfigurasi atau tidak (tanpa petunjuk)", async () => {
    const tanpaConfig = await bootTestServer({ token: undefined });
    const bodyA = await (await fetch(`${tanpaConfig.base}/internal/queues`)).json();
    await tanpaConfig.api.stop();

    const adaConfig = await bootTestServer({ token: TOKEN });
    const bodyB = await (
      await fetch(`${adaConfig.base}/internal/queues`, {
        headers: { [INTERNAL_TOKEN_HEADER]: "salah" },
      })
    ).json();
    await adaConfig.api.stop();

    expect(bodyA).toEqual(bodyB);
  });
});

describe("GET /internal/queues — isi respons", () => {
  it("mengembalikan seluruh queue sesuai kontrak zod", async () => {
    const { api, base } = await bootTestServer({ token: TOKEN });
    active = api;

    const res = await fetch(`${base}/internal/queues`, {
      headers: { [INTERNAL_TOKEN_HEADER]: TOKEN },
    });
    const body = (await res.json()) as { data: unknown };

    const parsed = internalQueuesResponseSchema.safeParse(body.data);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.queues).toHaveLength(QUEUE_NAMES.length);
  });

  it("cacah per state dan concurrency queue ikut terbawa", async () => {
    const { api, base } = await bootTestServer({ token: TOKEN });
    active = api;

    const res = await fetch(`${base}/internal/queues`, {
      headers: { [INTERNAL_TOKEN_HEADER]: TOKEN },
    });
    const body = (await res.json()) as {
      data: { queues: Array<{ name: string; counts: unknown; concurrency: number }> };
    };

    const pdf = body.data.queues.find((q) => q.name === QUEUE_NAME.PDF_RENDER);
    expect(pdf?.counts).toEqual({ waiting: 2, active: 1, delayed: 0, failed: 3, completed: 10 });
    expect(pdf?.concurrency).toBe(QUEUE_DEFAULTS[QUEUE_NAME.PDF_RENDER].concurrency);
  });

  it("DLQ kosong → dlqTotal 0 (sinyal alert SDD §17 tidak menyala palsu)", async () => {
    const { api, base } = await bootTestServer({ token: TOKEN, dlqCounts: {} });
    active = api;

    const res = await fetch(`${base}/internal/queues`, {
      headers: { [INTERNAL_TOKEN_HEADER]: TOKEN },
    });
    const body = (await res.json()) as { data: { dlqTotal: number } };
    expect(body.data.dlqTotal).toBe(0);
  });

  it("job gagal-final di DLQ terlihat lewat dlqDepth & dlqTotal", async () => {
    const { api, base } = await bootTestServer({
      token: TOKEN,
      dlqCounts: { waiting: 2, delayed: 1 },
    });
    active = api;

    const res = await fetch(`${base}/internal/queues`, {
      headers: { [INTERNAL_TOKEN_HEADER]: TOKEN },
    });
    const body = (await res.json()) as {
      data: { queues: Array<{ dlqDepth: number }>; dlqTotal: number };
    };

    expect(body.data.queues[0]?.dlqDepth).toBe(3);
    expect(body.data.dlqTotal).toBe(3 * QUEUE_NAMES.length);
  });
});

describe("createQueuesService", () => {
  it("membaca DLQ dari nama <queue>-dlq untuk setiap queue", async () => {
    const diminta: string[] = [];
    const service = createQueuesService({
      registry: registryPalsu(),
      dlqQueueOf: (nama) => {
        diminta.push(nama);
        return queueDenganCacah({});
      },
    });

    await service.status();

    expect(diminta).toContain(dlqNameOf(QUEUE_NAME.AI_EMBED));
    expect(diminta).toHaveLength(QUEUE_NAMES.length);
  });

  it("state yang tidak dilaporkan Redis dianggap 0, bukan undefined", async () => {
    const service = createQueuesService({
      registry: registryPalsu({ waiting: 5 }),
      dlqQueueOf: () => queueDenganCacah({}),
    });

    const hasil = await service.status();
    expect(hasil.queues[0]?.counts).toEqual({
      waiting: 5,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    });
  });
});
