// PR-017a — verifikasi id_token Google.
//
// Dua tingkat, sengaja:
// 1. `parseGoogleIdentity` — validator klaim murni, tanpa kunci/jaringan.
// 2. `createGoogleIdTokenVerifier` — jalur verifikasi PENUH terhadap JWKS
//    sungguhan yang dilayani server HTTP lokal, dengan token yang benar-benar
//    ditandatangani RS256. Ini yang membuat "audience salah → 401" berarti
//    sesuatu: kalau kita men-stub librarynya, test itu hanya menguji stub.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import {
  createGoogleIdTokenVerifier,
  parseGoogleIdentity,
  GOOGLE_ISSUERS,
} from "../src/modules/auth/services/google-id-token.js";
import { AppError } from "../src/core/http/index.js";

const CLIENT_ID = "1234567890-uji.apps.googleusercontent.com";
const ISSUER = GOOGLE_ISSUERS[0];

/** Kunci "Google" (dipercaya, terbit di JWKS) dan kunci penyerang (tidak). */
let kunciGoogle: { publicKey: KeyLike; privateKey: KeyLike };
let kunciPenyerang: { publicKey: KeyLike; privateKey: KeyLike };
let jwksServer: Server;
let jwksUrl: string;
/** Berapa kali JWKS diambil — untuk membuktikan kunci di-cache. */
let jwksHit = 0;

beforeAll(async () => {
  kunciGoogle = await generateKeyPair("RS256");
  kunciPenyerang = await generateKeyPair("RS256");

  const jwk: JWK = { ...(await exportJWK(kunciGoogle.publicKey)), kid: "uji-1", alg: "RS256", use: "sig" };

  jwksServer = createServer((_req, res) => {
    jwksHit += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}/certs`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    jwksServer.close((err) => (err ? reject(err) : resolve())),
  );
});

interface OpsiToken {
  audience?: string;
  issuer?: string;
  expiresIn?: string;
  issuedAt?: number;
  privateKey?: KeyLike;
  klaim?: Record<string, unknown>;
}

/** Token id Google tiruan — ditandatangani sungguhan, bukan string palsu. */
async function buatIdToken(opsi: OpsiToken = {}): Promise<string> {
  return new SignJWT({
    email: "rina@contoh.id",
    email_verified: true,
    name: "Rina Pratiwi",
    ...opsi.klaim,
  })
    .setProtectedHeader({ alg: "RS256", kid: "uji-1" })
    .setSubject("google-sub-001")
    .setIssuer(opsi.issuer ?? ISSUER)
    .setAudience(opsi.audience ?? CLIENT_ID)
    .setIssuedAt(opsi.issuedAt)
    .setExpirationTime(opsi.expiresIn ?? "1h")
    .sign(opsi.privateKey ?? kunciGoogle.privateKey);
}

function verifier() {
  return createGoogleIdTokenVerifier({ clientId: CLIENT_ID, jwksUrl, timeoutMs: 5000 });
}

/** Ambil AppError yang dilempar; gagal bila tidak ada yang dilempar. */
async function tangkap(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Diharapkan melempar AppError, tetapi berhasil");
}

describe("parseGoogleIdentity — validator klaim", () => {
  const klaimSah = {
    sub: "google-sub-001",
    email: "Rina@Contoh.id",
    email_verified: true,
    name: "Rina Pratiwi",
  };

  it("mengambil sub/email/name dan menormalkan email jadi huruf kecil", () => {
    expect(parseGoogleIdentity(klaimSah)).toEqual({
      googleId: "google-sub-001",
      email: "rina@contoh.id",
      fullName: "Rina Pratiwi",
    });
  });

  it("nama kosong bila Google tidak mengirim klaim name", () => {
    const { name: _abaikan, ...tanpaNama } = klaimSah;
    expect(parseGoogleIdentity(tanpaNama).fullName).toBe("");
  });

  it('menerima email_verified berbentuk string "true" (varian historis Google)', () => {
    expect(parseGoogleIdentity({ ...klaimSah, email_verified: "true" }).googleId).toBe(
      "google-sub-001",
    );
  });

  it.each([
    ['string "false"', "false"],
    ["boolean false", false],
    ["tidak dikirim sama sekali", undefined],
  ])("menolak linking bila email_verified %s (anti account-takeover)", (_nama, nilai) => {
    const err = (() => {
      try {
        parseGoogleIdentity({ ...klaimSah, email_verified: nilai });
      } catch (e) {
        return e as AppError;
      }
      throw new Error("Diharapkan ditolak");
    })();
    expect(err.code).toBe("EMAIL_GOOGLE_BELUM_TERVERIFIKASI");
    expect(err.status).toBe(403);
  });

  it.each([
    ["sub kosong", { sub: "" }],
    ["email bukan alamat email", { email: "bukan-email" }],
    ["email hilang", { email: undefined }],
  ])("menolak klaim cacat: %s", (_nama, tambalan) => {
    const err = (() => {
      try {
        parseGoogleIdentity({ ...klaimSah, ...tambalan });
      } catch (e) {
        return e as AppError;
      }
      throw new Error("Diharapkan ditolak");
    })();
    expect(err.code).toBe("TOKEN_GOOGLE_TIDAK_VALID");
    expect(err.status).toBe(401);
  });

  it("tidak membocorkan isi klaim (email) di pesan error", () => {
    try {
      parseGoogleIdentity({ sub: "x", email: "bocor@contoh.id" });
    } catch (err) {
      expect(JSON.stringify(err instanceof AppError ? err.envelope : err)).not.toContain(
        "bocor@contoh.id",
      );
      return;
    }
    throw new Error("Diharapkan ditolak");
  });
});

describe("createGoogleIdTokenVerifier — verifikasi penuh lewat JWKS", () => {
  it("menerima id_token sah dan mengembalikan identitas", async () => {
    const identitas = await verifier().verify(await buatIdToken());
    expect(identitas).toEqual({
      googleId: "google-sub-001",
      email: "rina@contoh.id",
      fullName: "Rina Pratiwi",
    });
  });

  it("audience salah → 401 (token untuk aplikasi lain tidak boleh dipakai di sini)", async () => {
    const err = await tangkap(async () =>
      verifier().verify(await buatIdToken({ audience: "aplikasi-lain.apps.googleusercontent.com" })),
    );
    expect(err.code).toBe("TOKEN_GOOGLE_TIDAK_VALID");
    expect(err.status).toBe(401);
  });

  it("issuer salah → 401", async () => {
    const err = await tangkap(async () => verifier().verify(await buatIdToken({ issuer: "https://jahat.example" })));
    expect(err.status).toBe(401);
  });

  it("menerima kedua bentuk issuer sah Google", async () => {
    for (const issuer of GOOGLE_ISSUERS) {
      const identitas = await verifier().verify(await buatIdToken({ issuer }));
      expect(identitas.googleId).toBe("google-sub-001");
    }
  });

  it("token kedaluwarsa → 401", async () => {
    const seJamLalu = Math.floor(Date.now() / 1000) - 3600;
    const err = await tangkap(async () =>
      verifier().verify(await buatIdToken({ issuedAt: seJamLalu, expiresIn: "-10m" })),
    );
    expect(err.status).toBe(401);
  });

  it("ditandatangani kunci yang bukan milik Google → 401", async () => {
    const err = await tangkap(async () =>
      verifier().verify(await buatIdToken({ privateKey: kunciPenyerang.privateKey })),
    );
    expect(err.status).toBe(401);
  });

  it("token tanpa tanda tangan (alg: none) → 401", async () => {
    // Dirakit manual: `jose` menolak menandatangani alg none, dan memang itu
    // intinya — penyerang tidak memakai library kita.
    const b64 = (nilai: unknown) =>
      Buffer.from(JSON.stringify(nilai)).toString("base64url");
    const tokenNone = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      sub: "google-sub-001",
      email: "rina@contoh.id",
      email_verified: true,
      iss: ISSUER,
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;
    expect((await tangkap(async () => verifier().verify(tokenNone))).status).toBe(401);
  });

  it("string sembarang (bukan JWT) → 401, bukan 500", async () => {
    expect((await tangkap(async () => verifier().verify("bukan-token"))).status).toBe(401);
  });

  it("email belum terverifikasi → 403 meski tanda tangannya sah", async () => {
    const err = await tangkap(async () =>
      verifier().verify(await buatIdToken({ klaim: { email_verified: false } })),
    );
    expect(err.code).toBe("EMAIL_GOOGLE_BELUM_TERVERIFIKASI");
  });

  it("JWKS tak terjangkau → 503 (masalah kita), BUKAN 401 (menyalahkan pengguna)", async () => {
    const mati = createGoogleIdTokenVerifier({
      clientId: CLIENT_ID,
      // Port 1 praktis tidak pernah dilayani; koneksi ditolak seketika.
      jwksUrl: "http://127.0.0.1:1/certs",
      timeoutMs: 2000,
    });
    const err = await tangkap(async () => mati.verify(await buatIdToken()));
    expect(err.code).toBe("BELUM_SIAP");
    expect(err.status).toBe(503);
  });

  it("kunci JWKS di-cache: verifikasi berulang tidak memanggil Google tiap kali", async () => {
    const satu = verifier();
    jwksHit = 0;
    await satu.verify(await buatIdToken());
    await satu.verify(await buatIdToken());
    await satu.verify(await buatIdToken());
    expect(jwksHit).toBe(1);
  });
});
