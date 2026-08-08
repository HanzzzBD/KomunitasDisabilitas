// Unit gerbang kunci sesi RS256 (PR-018a). Tanpa DB, tanpa jaringan.
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { parseSessionKeys, SessionKeyError } from "../src/core/auth/keys.js";

/** Pasangan RSA asli — dibuat sekali, dipakai banyak test (2048 bit lambat). */
function pasanganRsa(bits = 2048) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: bits });
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

const b64 = (pem: string) => Buffer.from(pem, "utf8").toString("base64");
const rsa = pasanganRsa();

describe("parseSessionKeys — fitur mati vs boot gagal", () => {
  it("kedua variabel kosong → undefined (fitur sesi mati, BUKAN error)", () => {
    expect(parseSessionKeys({})).toBeUndefined();
  });

  it("hanya privat terisi → SessionKeyError menyebut variabel yang hilang", () => {
    try {
      parseSessionKeys({ JWT_PRIVATE_KEY: b64(rsa.privatePem) });
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      expect(err).toBeInstanceOf(SessionKeyError);
      expect((err as SessionKeyError).issues.map(([nama]) => nama)).toEqual(["JWT_PUBLIC_KEY"]);
    }
  });

  it("hanya publik terisi → SessionKeyError menyebut JWT_PRIVATE_KEY", () => {
    expect(() => parseSessionKeys({ JWT_PUBLIC_KEY: b64(rsa.publicPem) })).toThrow(SessionKeyError);
  });

  it("pasangan sah → KeyObject RSA privat + publik", () => {
    const keys = parseSessionKeys({
      JWT_PRIVATE_KEY: b64(rsa.privatePem),
      JWT_PUBLIC_KEY: b64(rsa.publicPem),
    });
    expect(keys?.privateKey.type).toBe("private");
    expect(keys?.publicKey.type).toBe("public");
    expect(keys?.privateKey.asymmetricKeyType).toBe("rsa");
  });

  it("spasi/baris baru di sekeliling nilai env dimaafkan", () => {
    expect(() =>
      parseSessionKeys({
        JWT_PRIVATE_KEY: `  ${b64(rsa.privatePem)}\n`,
        JWT_PUBLIC_KEY: `\t${b64(rsa.publicPem)}  `,
      }),
    ).not.toThrow();
  });
});

describe("parseSessionKeys — bentuk yang ditolak", () => {
  it("base64 rusak ditolak (round-trip guard), bukan lolos jadi sampah", () => {
    expect(() =>
      parseSessionKeys({ JWT_PRIVATE_KEY: "bukan base64 !!!", JWT_PUBLIC_KEY: b64(rsa.publicPem) }),
    ).toThrow(SessionKeyError);
  });

  it("base64 valid tetapi bukan PEM ditolak", () => {
    expect(() =>
      parseSessionKeys({
        JWT_PRIVATE_KEY: b64("halo, saya bukan kunci"),
        JWT_PUBLIC_KEY: b64(rsa.publicPem),
      }),
    ).toThrow(SessionKeyError);
  });

  it("kunci publik ditaruh di slot privat ditolak", () => {
    expect(() =>
      parseSessionKeys({ JWT_PRIVATE_KEY: b64(rsa.publicPem), JWT_PUBLIC_KEY: b64(rsa.publicPem) }),
    ).toThrow(SessionKeyError);
  });

  it("RSA 1024 bit ditolak (minimal 2048)", () => {
    const lemah = pasanganRsa(1024);
    try {
      parseSessionKeys({
        JWT_PRIVATE_KEY: b64(lemah.privatePem),
        JWT_PUBLIC_KEY: b64(lemah.publicPem),
      });
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      expect((err as SessionKeyError).issues[0]?.[1]).toContain("terlalu pendek");
    }
  });

  it("kunci EC ditolak — RS256 saja", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    expect(() =>
      parseSessionKeys({
        JWT_PRIVATE_KEY: b64(ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString()),
        JWT_PUBLIC_KEY: b64(ec.publicKey.export({ type: "spki", format: "pem" }).toString()),
      }),
    ).toThrow(SessionKeyError);
  });

  it("publik BUKAN pasangan privat ditolak saat boot, bukan saat login", () => {
    const lain = pasanganRsa();
    try {
      parseSessionKeys({
        JWT_PRIVATE_KEY: b64(rsa.privatePem),
        JWT_PUBLIC_KEY: b64(lain.publicPem),
      });
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      expect((err as SessionKeyError).issues[0]?.[1]).toContain("bukan pasangan");
    }
  });

  it("pesan error TIDAK memuat material kunci", () => {
    try {
      parseSessionKeys({ JWT_PRIVATE_KEY: b64(rsa.privatePem), JWT_PUBLIC_KEY: b64("rusak") });
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      const pesan = (err as Error).message;
      expect(pesan).not.toContain("BEGIN");
      expect(pesan).not.toContain(b64(rsa.privatePem));
    }
  });
});
