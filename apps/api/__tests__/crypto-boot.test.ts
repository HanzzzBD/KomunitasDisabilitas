import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { createLogger, REDACTED } from "../src/core/logger/index.js";

// Boot integration: menjalankan entry point NYATA (src/index.ts) via tsx pada
// child process, mengontrol env, lalu memeriksa exit code + output. Ini bukti
// fail-fast kunci enkripsi terjadi SEBELUM server listen / koneksi DB dibuka
// (AC PR-013: boot gagal bila kunci salah panjang/format).
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BASE_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/nawasena",
  REDIS_URL: "redis://localhost:6379",
  REDIS_QUEUE_URL: "redis://localhost:6380",
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "0", // port ephemeral — tidak bentrok bila boot berhasil
  LOG_LEVEL: "info",
};

interface BootResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Spawn entry point dengan env kustom. `expectExit`=true menunggu proses mati
 * (kasus fail-fast). `expectExit`=false: boot diharapkan sukses → kita tunggu
 * baris "API siap" lalu bunuh proses (proses server hidup terus).
 */
function bootApi(env: NodeJS.ProcessEnv, expectExit: boolean): Promise<BootResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    // node --import tsx: jalankan TS langsung tanpa bergantung pada .bin shim
    // (lintas OS; hindari masalah resolusi .cmd di Windows).
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: apiDir,
      // Env BERSIH: hanya yang kita berikan (jangan wariskan FIELD_KEY_* host).
      env: { PATH: process.env.PATH, ...env },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error(`boot timeout\nstdout:${stdout}\nstderr:${stderr}`));
    }, 20_000);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
      if (!expectExit && stdout.includes("API siap menerima koneksi")) {
        clearTimeout(timer);
        child.kill("SIGKILL"); // boot sukses terbukti — hentikan server hidup
        resolvePromise({ code: null, stdout, stderr });
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
    child.on("error", rejectPromise);
  });
}

describe("fail-fast kunci enkripsi saat boot (AC PR-013)", () => {
  it("tanpa FIELD_KEY_V* → exit ≠ 0, pesan menyebut FIELD_KEY_V1, server TIDAK start", async () => {
    const r = await bootApi({ ...BASE_ENV }, true);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("FIELD_KEY_V1");
    // Bukti ordering: listener tidak pernah dibuat.
    expect(r.stdout).not.toContain("API siap menerima koneksi");
  }, 25_000);

  it("FIELD_KEY_V1 salah panjang → exit ≠ 0 sebelum server start", async () => {
    const short = Buffer.alloc(16, 7).toString("base64");
    const r = await bootApi({ ...BASE_ENV, FIELD_KEY_V1: short }, true);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("FIELD_KEY_V1");
    expect(r.stdout).not.toContain("API siap menerima koneksi");
  }, 25_000);

  it("FIELD_KEY_V1 valid → boot berhasil (server listen)", async () => {
    const key = Buffer.alloc(32, 3).toString("base64");
    const r = await bootApi({ ...BASE_ENV, FIELD_KEY_V1: key }, false);
    expect(r.stdout).toContain("API siap menerima koneksi");
    // Material kunci TIDAK muncul di output apa pun (stdout/stderr).
    expect(r.stdout).not.toContain(key);
    expect(r.stderr).not.toContain(key);
  }, 25_000);
});

// Redaction (lapisan kedua, AC PR-013: kunci tidak muncul di log). core/crypto
// tidak menyentuh logger; bila material kunci tanpa sengaja masuk objek log via
// field `fieldKey`, deny list PR-006 me-redaksinya.
function captureLogger() {
  const lines: Array<Record<string, unknown>> = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (line.trim() !== "") lines.push(JSON.parse(line) as Record<string, unknown>);
      }
      cb();
    },
  });
  return { logger: createLogger({ LOG_LEVEL: "info" }, { destination }), lines };
}

describe("redaction material kunci di log (AC PR-013)", () => {
  it("field `fieldKey` di objek log di-redact (level atas & bersarang)", () => {
    const { logger, lines } = captureLogger();
    const key = Buffer.alloc(32, 5).toString("base64");
    logger.info({ fieldKey: key, cfg: { fieldKey: key } }, "uji redaction kunci");
    const raw = JSON.stringify(lines);
    expect(raw).not.toContain(key);
    expect(lines[0]?.fieldKey).toBe(REDACTED);
  });
});
