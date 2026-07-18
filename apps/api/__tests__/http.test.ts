import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import { z } from "zod";
import { requestOtpSchema } from "@incasif/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { asyncHandler, appError, validate } from "../src/core/http/index.js";
import { createServer, type ApiServer } from "../src/server.js";

function testEnv(overrides: NodeJS.ProcessEnv = {}): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/incasif",
    REDIS_URL: "redis://localhost:6379",
    REDIS_QUEUE_URL: "redis://localhost:6380",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
    CORS_ORIGINS: "http://localhost:5173,https://incasif.id",
    ...overrides,
  });
}

function captureLines() {
  const lines: Array<Record<string, unknown>> = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (line.trim() !== "") lines.push(JSON.parse(line) as Record<string, unknown>);
      }
      cb();
    },
  });
  return { lines, destination };
}

/** Boot server dengan route uji core/http di port ephemeral. */
async function bootTestServer(overrides: NodeJS.ProcessEnv = {}) {
  const { lines, destination } = captureLines();
  const env = testEnv(overrides);
  const api = createServer(env, createLogger(env, { destination }), {
    routes: (app) => {
      app.get(
        "/uji/meledak-async",
        asyncHandler(async () => {
          throw new Error("detail internal SANGAT-RAHASIA jangan bocor");
        }),
      );
      app.get(
        "/uji/dilarang",
        asyncHandler(async () => {
          throw appError("TIDAK_BERHAK");
        }),
      );
      app.post("/uji/validasi", validate({ body: requestOtpSchema }), (req, res) => {
        res.json({ data: req.body });
      });
      app.get(
        "/uji/validasi-query",
        validate({ query: z.object({ limit: z.coerce.number().int().max(100) }) }),
        (req, res) => {
          res.json({ data: req.query });
        },
      );
      app.get("/uji/ok", (_req, res) => {
        res.json({ data: "ok" });
      });
    },
  });
  const { port } = await api.start();
  return { api, port, lines, base: `http://127.0.0.1:${port}` };
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("error handler global (integration)", () => {
  it("throw async → 500 envelope, stack tidak bocor, proses tetap hidup, stack ke log ber-requestId", async () => {
    const { api, base, lines } = await bootTestServer();
    active = api;

    const res = await fetch(`${base}/uji/meledak-async`);
    expect(res.status).toBe(500);
    const body: unknown = await res.json();
    expect(body).toEqual({
      code: "TERJADI_KESALAHAN",
      message: "Terjadi kesalahan pada server",
      hint: "Coba lagi beberapa saat; laporkan bila terus terjadi",
    });
    expect(JSON.stringify(body)).not.toContain("SANGAT-RAHASIA");

    // Proses tetap hidup: request berikutnya dilayani normal.
    const next = await fetch(`${base}/uji/ok`);
    expect(next.status).toBe(200);

    // Stack hanya ke logger — baris error membawa requestId (opsional AC tambahan).
    const errLine = lines.find((l) => l.msg === "Error tidak tertangani");
    expect(errLine).toBeDefined();
    expect(String(errLine?.requestId)).toMatch(UUID_RE);
    expect(JSON.stringify(errLine)).toContain("SANGAT-RAHASIA"); // detail memang di log, bukan di response
  });

  it("AppError TIDAK_BERHAK → 403 envelope katalog", async () => {
    const { api, base } = await bootTestServer();
    active = api;
    const res = await fetch(`${base}/uji/dilarang`);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "TIDAK_BERHAK",
      message: "Anda tidak berhak mengakses ini",
    });
  });

  it("validate body salah → 400 VALIDATION_ERROR + hint menyebut field", async () => {
    const { api, base } = await bootTestServer();
    active = api;
    const res = await fetch(`${base}/uji/validasi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "0812" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; hint?: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.hint).toContain("phone");
  });

  it("validate body benar → controller menerima data typed; query coerce bekerja", async () => {
    const { api, base } = await bootTestServer();
    active = api;
    const ok = await fetch(`${base}/uji/validasi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "+6281234567890" }),
    });
    expect(ok.status).toBe(200);
    const q = await fetch(`${base}/uji/validasi-query?limit=50`);
    expect(await q.json()).toEqual({ data: { limit: 50 } });
  });

  it("JSON body rusak → 400 JSON_TIDAK_VALID (bukan 500)", async () => {
    const { api, base } = await bootTestServer();
    active = api;
    const res = await fetch(`${base}/uji/validasi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{rusak",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("JSON_TIDAK_VALID");
  });

  it("rute tak terdaftar → 404 RUTE_TIDAK_DITEMUKAN", async () => {
    const { api, base } = await bootTestServer();
    active = api;
    const res = await fetch(`${base}/tidak/ada`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("RUTE_TIDAK_DITEMUKAN");
  });
});

describe("security middleware (integration)", () => {
  it("429 setelah limit terlampaui: envelope + Retry-After (AC)", async () => {
    const { api, base } = await bootTestServer({
      RATE_LIMIT_MAX: "3",
      RATE_LIMIT_WINDOW_MS: "60000",
    });
    active = api;
    for (let i = 0; i < 3; i++) {
      expect((await fetch(`${base}/uji/ok`)).status).toBe(200);
    }
    const res = await fetch(`${base}/uji/ok`);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(await res.json()).toMatchObject({
      code: "TERLALU_BANYAK_PERMINTAAN",
      message: "Terlalu banyak permintaan",
    });
  });

  it("helmet: security headers dasar terpasang (AC snapshot)", async () => {
    const { api, base } = await bootTestServer();
    active = api;
    const res = await fetch(`${base}/uji/ok`);
    const pick = (name: string) => res.headers.get(name);
    expect({
      "x-content-type-options": pick("x-content-type-options"),
      "x-frame-options": pick("x-frame-options"),
      "x-dns-prefetch-control": pick("x-dns-prefetch-control"),
      "referrer-policy": pick("referrer-policy"),
      "cross-origin-resource-policy": pick("cross-origin-resource-policy"),
      "x-powered-by": pick("x-powered-by"),
    }).toMatchInlineSnapshot(`
      {
        "cross-origin-resource-policy": "same-origin",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-dns-prefetch-control": "off",
        "x-frame-options": "DENY",
        "x-powered-by": null,
      }
    `);
  });

  it("CORS: origin whitelist dapat header; origin asing tidak", async () => {
    const { api, base } = await bootTestServer();
    active = api;
    const ok = await fetch(`${base}/uji/ok`, { headers: { origin: "https://incasif.id" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://incasif.id");
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");

    const asing = await fetch(`${base}/uji/ok`, { headers: { origin: "https://jahat.example" } });
    expect(asing.headers.get("access-control-allow-origin")).toBeNull();
  });
});
