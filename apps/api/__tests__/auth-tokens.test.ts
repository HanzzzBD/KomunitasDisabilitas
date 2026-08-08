// Unit token service RS256 (PR-018a) — klaim, masa berlaku, `ver`, refresh.
// AC: "Access kedaluwarsa 15 menit; refresh 30 hari (assert klaim)" dan
// "`ver` bump menolak semua access lama".
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { decodeJwt, decodeProtectedHeader, SignJWT } from "jose";
import { createTokenService, SESSION_POLICY } from "../src/core/auth/tokens.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keys = { privateKey, publicKey };

/** Jam beku supaya assert exp/iat tidak bergantung waktu nyata. */
const T0 = new Date("2026-08-04T10:00:00.000Z");
const jam = (waktu: Date) => ({ ...keys, clock: () => waktu });

const klaimUji = { sub: "018a0000-0000-7000-8000-000000000001", role: "seeker" as const, ver: 3 };

describe("access token — klaim & masa berlaku", () => {
  it("memuat sub/role/ver dan exp tepat 15 menit setelah iat", async () => {
    const token = await createTokenService(jam(T0)).signAccessToken(klaimUji);
    const payload = decodeJwt(token);

    expect(payload.sub).toBe(klaimUji.sub);
    expect(payload.role).toBe("seeker");
    expect(payload.ver).toBe(3);
    expect(payload.iss).toBe(SESSION_POLICY.issuer);
    expect(payload.aud).toBe(SESSION_POLICY.audience);
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(15 * 60);
    expect(SESSION_POLICY.accessTtlSeconds).toBe(15 * 60);
  });

  it("ditandatangani RS256", async () => {
    const token = await createTokenService(jam(T0)).signAccessToken(klaimUji);
    expect(decodeProtectedHeader(token).alg).toBe("RS256");
  });

  it("TIDAK memuat PII (nomor HP, email, nama)", async () => {
    const token = await createTokenService(jam(T0)).signAccessToken(klaimUji);
    expect(Object.keys(decodeJwt(token)).sort()).toEqual(
      ["aud", "exp", "iat", "iss", "role", "sub", "ver"].sort(),
    );
  });

  it("verifikasi mengembalikan klaim yang sama", async () => {
    const service = createTokenService(jam(T0));
    const token = await service.signAccessToken(klaimUji);
    expect(await service.verifyAccessToken(token)).toEqual(klaimUji);
  });

  it("masih sah pada menit ke-14, ditolak pada menit ke-16", async () => {
    const token = await createTokenService(jam(T0)).signAccessToken(klaimUji);
    const menitKe = (n: number) => new Date(T0.getTime() + n * 60_000);

    expect(await createTokenService(jam(menitKe(14))).verifyAccessToken(token)).not.toBeNull();
    expect(await createTokenService(jam(menitKe(16))).verifyAccessToken(token)).toBeNull();
  });
});

describe("access token — penolakan", () => {
  const service = createTokenService(jam(T0));

  it("tanda tangan dari kunci lain ditolak", async () => {
    const lain = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = await createTokenService({ ...lain, clock: () => T0 }).signAccessToken(klaimUji);
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it("token cacat / kosong ditolak tanpa melempar", async () => {
    expect(await service.verifyAccessToken("")).toBeNull();
    expect(await service.verifyAccessToken("bukan.jwt.sama.sekali")).toBeNull();
  });

  it("alg: none ditolak (algoritma dikunci RS256)", async () => {
    // Rakit manual: header alg none + payload sah + signature kosong.
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const iat = Math.floor(T0.getTime() / 1000);
    const palsu = `${enc({ alg: "none" })}.${enc({
      sub: klaimUji.sub,
      role: "admin",
      ver: 0,
      iss: SESSION_POLICY.issuer,
      aud: SESSION_POLICY.audience,
      iat,
      exp: iat + 900,
    })}.`;
    expect(await service.verifyAccessToken(palsu)).toBeNull();
  });

  it("issuer/audience yang keliru ditolak", async () => {
    const iat = Math.floor(T0.getTime() / 1000);
    const salahAud = await new SignJWT({ role: "seeker", ver: 1 })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject(klaimUji.sub)
      .setIssuer(SESSION_POLICY.issuer)
      .setAudience("penyerang")
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(privateKey);
    expect(await service.verifyAccessToken(salahAud)).toBeNull();
  });

  it("role di luar enum ditolak meski tanda tangannya sah", async () => {
    const iat = Math.floor(T0.getTime() / 1000);
    const token = await new SignJWT({ role: "superadmin", ver: 1 })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject(klaimUji.sub)
      .setIssuer(SESSION_POLICY.issuer)
      .setAudience(SESSION_POLICY.audience)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(privateKey);
    expect(await service.verifyAccessToken(token)).toBeNull();
  });

  it("ver bukan bilangan bulat ditolak", async () => {
    const iat = Math.floor(T0.getTime() / 1000);
    const token = await new SignJWT({ role: "seeker", ver: "3" })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject(klaimUji.sub)
      .setIssuer(SESSION_POLICY.issuer)
      .setAudience(SESSION_POLICY.audience)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(privateKey);
    expect(await service.verifyAccessToken(token)).toBeNull();
  });
});

describe("`ver` — kill-switch sesi (AC: ver bump menolak semua access lama)", () => {
  it("ver cocok → diterima; ver lebih tua → ditolak meski belum kedaluwarsa", async () => {
    const service = createTokenService(jam(T0));
    const token = await service.signAccessToken({ ...klaimUji, ver: 3 });

    expect(await service.verifyAccessToken(token, { version: 3 })).not.toBeNull();
    // Setelah bump di DB (3 → 4), token lama harus mati SEKARANG.
    expect(await service.verifyAccessToken(token, { version: 4 })).toBeNull();
  });

  it("token ber-ver lebih BARU dari DB juga ditolak (bukan sekadar 'lebih besar lolos')", async () => {
    const service = createTokenService(jam(T0));
    const token = await service.signAccessToken({ ...klaimUji, ver: 9 });
    expect(await service.verifyAccessToken(token, { version: 4 })).toBeNull();
  });
});

describe("refresh token", () => {
  const service = createTokenService(jam(T0));

  it("kedaluwarsa 30 hari setelah diterbitkan", () => {
    const { expiresAt } = service.issueRefreshToken();
    expect(expiresAt.getTime() - T0.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(SESSION_POLICY.refreshTtlSeconds).toBe(30 * 24 * 60 * 60);
  });

  it("BUKAN JWT dan tidak memuat informasi apa pun (opaque)", () => {
    const { token } = service.issueRefreshToken();
    expect(token).not.toContain(".");
    expect(() => decodeJwt(token)).toThrow();
  });

  it("32 byte acak: dua penerbitan tidak pernah sama", () => {
    const a = service.issueRefreshToken();
    const b = service.issueRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(Buffer.from(a.token, "base64url")).toHaveLength(SESSION_POLICY.refreshBytes);
  });

  it("hash stabil, dan token mentah tidak bisa dipulihkan darinya", () => {
    const { token, tokenHash } = service.issueRefreshToken();
    expect(service.hashRefreshToken(token)).toBe(tokenHash);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
  });

  it("token berbeda → hash berbeda", () => {
    expect(service.hashRefreshToken("a")).not.toBe(service.hashRefreshToken("b"));
  });

  it("hashEquals membandingkan tanpa melempar pada panjang berbeda", () => {
    const { token, tokenHash } = service.issueRefreshToken();
    expect(service.hashEquals(service.hashRefreshToken(token), tokenHash)).toBe(true);
    expect(service.hashEquals("pendek", tokenHash)).toBe(false);
  });
});
