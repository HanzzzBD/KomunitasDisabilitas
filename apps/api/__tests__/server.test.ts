import { describe, it, expect, vi, afterEach } from "vitest";
import { Writable } from "node:stream";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, registerShutdownHooks, type ApiServer } from "../src/server.js";

function testEnv(): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/incasif",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
    PORT: "0", // port ephemeral — aman paralel
    HOST: "127.0.0.1",
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

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

describe("createServer — boot & shutdown (integration)", () => {
  it("start → melayani request → stop bersih; boot < 3 detik (AC)", async () => {
    const { lines, destination } = captureLines();
    const env = testEnv();
    const api = createServer(env, createLogger(env, { destination }));
    active = api;

    const bootStart = performance.now();
    const { port } = await api.start();
    const bootMs = performance.now() - bootStart;
    expect(bootMs).toBeLessThan(3000); // AC: boot < 3 detik di dev

    const res = await fetch(`http://127.0.0.1:${port}/belum-ada-route`);
    expect(res.status).toBe(404); // route menyusul PR-008 — proses hidup yang diuji

    await api.stop();
    active = null;
    const msgs = lines.map((l) => l.msg);
    expect(msgs).toContain("API siap menerima koneksi");
    expect(msgs).toContain("Server tertutup bersih");
    // stop() kedua kali aman (idempotent)
    await expect(api.stop()).resolves.toBeUndefined();
  });

  it("setiap baris log request-scoped memuat requestId; beda request beda id (AC)", async () => {
    const { lines, destination } = captureLines();
    const env = testEnv();
    const api = createServer(env, createLogger(env, { destination }));
    active = api;
    const { port } = await api.start();

    await fetch(`http://127.0.0.1:${port}/a`);
    await fetch(`http://127.0.0.1:${port}/b`);

    const requestLines = lines.filter((l) => "req" in l);
    expect(requestLines.length).toBeGreaterThanOrEqual(2);
    for (const line of requestLines) {
      expect(line.requestId, `baris tanpa requestId: ${JSON.stringify(line)}`).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
    // Sejak PR-007 satu request bisa menghasilkan >1 baris (completion +
    // warn 404) yang BERBAGI requestId sama — yang unik adalah per request.
    const ids = new Set(requestLines.map((l) => l.requestId));
    expect(ids.size).toBe(2); // 2 request → 2 id berbeda
  });

  it("header Authorization pada request nyata tidak muncul di log (redaction end-to-end)", async () => {
    const { lines, destination } = captureLines();
    const env = testEnv();
    const api = createServer(env, createLogger(env, { destination }));
    active = api;
    const { port } = await api.start();

    await fetch(`http://127.0.0.1:${port}/x`, {
      headers: { authorization: "Bearer token-rahasia-xyz", cookie: "sid=cookie-rahasia" },
    });

    const raw = JSON.stringify(lines);
    expect(raw).not.toContain("token-rahasia-xyz");
    expect(raw).not.toContain("cookie-rahasia");
  });
});

describe("registerShutdownHooks — SIGTERM/SIGINT (AC)", () => {
  it("SIGTERM → stop() dipanggil → exit(0); sinyal ganda tidak double-stop", async () => {
    const env = testEnv();
    const { destination } = captureLines();
    const logger = createLogger(env, { destination });
    const stop = vi.fn().mockResolvedValue(undefined);
    const exitFn = vi.fn();
    const fakeApi = { app: null as never, start: vi.fn(), stop };

    registerShutdownHooks(fakeApi, logger, exitFn);
    process.emit("SIGTERM");
    process.emit("SIGTERM"); // ganda — harus diabaikan
    await vi.waitFor(() => expect(exitFn).toHaveBeenCalledWith(0));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stop() gagal saat SIGINT → exit(1)", async () => {
    const env = testEnv();
    const { destination } = captureLines();
    const logger = createLogger(env, { destination });
    const exitFn = vi.fn();
    const fakeApi = {
      app: null as never,
      start: vi.fn(),
      stop: vi.fn().mockRejectedValue(new Error("gagal tutup")),
    };

    registerShutdownHooks(fakeApi, logger, exitFn);
    process.emit("SIGINT");
    await vi.waitFor(() => expect(exitFn).toHaveBeenCalledWith(1));
  });
});
