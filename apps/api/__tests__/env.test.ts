import { describe, it, expect } from "vitest";
import { loadEnv, EnvError } from "../src/core/config/env.js";

const VALID: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/incasif",
  REDIS_URL: "redis://localhost:6379",
};

describe("loadEnv — fail-fast (AC PR-006)", () => {
  it("env kosong → EnvError menyebut DATABASE_URL dan REDIS_URL", () => {
    let caught: unknown;
    try {
      loadEnv({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvError);
    const envErr = caught as EnvError;
    const variables = envErr.issues.map(([nama]) => nama);
    expect(variables).toContain("DATABASE_URL");
    expect(variables).toContain("REDIS_URL");
    // Pesan siap-cetak menyebut nama variabel + rujukan .env.example.
    expect(envErr.message).toContain("DATABASE_URL");
    expect(envErr.message).toContain(".env.example");
  });

  it("hanya wajib terisi → default melengkapi (NODE_ENV/HOST/PORT/LOG_LEVEL)", () => {
    const env = loadEnv({ ...VALID });
    expect(env).toMatchObject({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: 3000,
      LOG_LEVEL: "info",
    });
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL);
  });

  it("PORT di-coerce dari string; nilai bukan angka/di luar rentang ditolak", () => {
    expect(loadEnv({ ...VALID, PORT: "8080" }).PORT).toBe(8080);
    expect(() => loadEnv({ ...VALID, PORT: "bukan-angka" })).toThrow(EnvError);
    expect(() => loadEnv({ ...VALID, PORT: "70000" })).toThrow(/PORT/);
  });

  it("URL tidak valid → error menyebut variabel + contoh format", () => {
    let caught: unknown;
    try {
      loadEnv({ ...VALID, DATABASE_URL: "bukan url" });
    } catch (err) {
      caught = err;
    }
    const envErr = caught as EnvError;
    expect(envErr.issues).toEqual([["DATABASE_URL", expect.stringContaining("postgresql://")]]);
  });

  it("NODE_ENV / LOG_LEVEL di luar enum → ditolak", () => {
    expect(() => loadEnv({ ...VALID, NODE_ENV: "staging" })).toThrow(EnvError);
    expect(() => loadEnv({ ...VALID, LOG_LEVEL: "verbose" })).toThrow(EnvError);
  });

  it("variabel env lain diabaikan (tidak strict terhadap key asing)", () => {
    expect(() => loadEnv({ ...VALID, PATH: "/usr/bin", RANDOM_TOOL_VAR: "x" })).not.toThrow();
  });
});
