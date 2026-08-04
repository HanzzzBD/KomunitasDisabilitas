import { describe, it, expect } from "vitest";
import { loadEnv, EnvError } from "../src/core/config/env.js";

const VALID: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/nawasena",
  REDIS_URL: "redis://localhost:6379",
  REDIS_QUEUE_URL: "redis://localhost:6380",
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

describe("kredensial Google OAuth (PR-017)", () => {
  const GOOGLE = {
    GOOGLE_CLIENT_ID: "123-uji.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "rahasia-uji",
  };

  it("tanpa kredensial → boot tetap jalan (fitur dimatikan, bukan boot gagal)", () => {
    const env = loadEnv({ ...VALID });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it("pasangan lengkap → diterima", () => {
    expect(loadEnv({ ...VALID, ...GOOGLE })).toMatchObject(GOOGLE);
  });

  it.each([
    ["GOOGLE_CLIENT_ID saja", { GOOGLE_CLIENT_ID: GOOGLE.GOOGLE_CLIENT_ID }, "GOOGLE_CLIENT_SECRET"],
    [
      "GOOGLE_CLIENT_SECRET saja",
      { GOOGLE_CLIENT_SECRET: GOOGLE.GOOGLE_CLIENT_SECRET },
      "GOOGLE_CLIENT_ID",
    ],
  ])("%s → boot GAGAL menyebut variabel yang hilang", (_nama, separuh, hilang) => {
    let caught: unknown;
    try {
      loadEnv({ ...VALID, ...separuh });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as EnvError).issues.map(([nama]) => nama)).toContain(hilang);
  });

  it("kelengkapan Twilio tetap ditegakkan setelah aturan grup dipakai bersama", () => {
    expect(() => loadEnv({ ...VALID, TWILIO_ACCOUNT_SID: "AC0" })).toThrow(EnvError);
    // Grup lain yang kosong tidak ikut terseret jadi error.
    expect(() => loadEnv({ ...VALID, ...GOOGLE, TWILIO_ACCOUNT_SID: "AC0" })).toThrow(
      /TWILIO_AUTH_TOKEN/,
    );
  });

  it("URL Google & timeout punya default yang masuk akal", () => {
    const env = loadEnv({ ...VALID });
    expect(env.GOOGLE_JWKS_URL).toBe("https://www.googleapis.com/oauth2/v3/certs");
    expect(env.GOOGLE_TOKEN_URL).toBe("https://oauth2.googleapis.com/token");
    expect(env.GOOGLE_HTTP_TIMEOUT_MS).toBe(10_000);
  });
});

// core/config hanya menegakkan KELENGKAPAN pasangan; bentuk kuncinya (base64
// PEM, RSA ≥ 2048, benar-benar berpasangan) milik core/auth — lihat
// auth-session-keys.test.ts. Pembagian yang sama seperti FIELD_KEY_V*.
describe("kunci sesi JWT RS256 (PR-018)", () => {
  const JWT = { JWT_PRIVATE_KEY: "cHJpdmF0ZS11ammk", JWT_PUBLIC_KEY: "cHVibGljLXVqaQ==" };

  it("tanpa kunci → boot tetap jalan (sesi dimatikan, bukan boot gagal)", () => {
    const env = loadEnv({ ...VALID });
    expect(env.JWT_PRIVATE_KEY).toBeUndefined();
    expect(env.JWT_PUBLIC_KEY).toBeUndefined();
  });

  it("pasangan lengkap → diterima (isinya divalidasi core/auth)", () => {
    expect(loadEnv({ ...VALID, ...JWT })).toMatchObject(JWT);
  });

  it.each([
    ["JWT_PRIVATE_KEY saja", { JWT_PRIVATE_KEY: JWT.JWT_PRIVATE_KEY }, "JWT_PUBLIC_KEY"],
    ["JWT_PUBLIC_KEY saja", { JWT_PUBLIC_KEY: JWT.JWT_PUBLIC_KEY }, "JWT_PRIVATE_KEY"],
  ])("%s → boot GAGAL menyebut variabel yang hilang", (_nama, separuh, hilang) => {
    let caught: unknown;
    try {
      loadEnv({ ...VALID, ...separuh });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as EnvError).issues.map(([nama]) => nama)).toContain(hilang);
  });
});
