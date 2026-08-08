// core/auth — penerbitan & verifikasi token sesi (PR-018, SDD §8.1, ADR-015).
//
// SATU-SATUNYA pintu tanda tangan/verifikasi JWT. Modul lain memakai service
// ini, tidak pernah memanggil `jose` langsung — sama seperti core/crypto adalah
// satu-satunya pintu enkripsi field.
//
// DUA JENIS TOKEN, dua sifat yang berbeda:
//
//   access  — JWT RS256 berumur 15 menit, klaim (sub, role, ver). TIDAK
//             disimpan di mana pun: nilainya justru pada kemampuan diverifikasi
//             tanpa menyentuh DB. Konsekuensinya ia tidak bisa dicabut satu per
//             satu — pencabutan dilakukan lewat `ver` (lihat verifyAccessToken).
//
//   refresh — 32 byte acak (BUKAN JWT), berumur 30 hari. Hanya SHA-256-nya yang
//             menyentuh DB, jadi bocornya isi tabel refresh_tokens tidak
//             memberi penyerang token yang bisa dipakai. Ia opaque dengan
//             sengaja: klien tidak perlu — dan tidak boleh — membaca isinya.
//
// Hash refresh memakai SHA-256 POLOS, tanpa pepper/bcrypt. Itu pilihan sadar:
// nilainya 256 bit acak dari CSPRNG, bukan kata sandi pilihan manusia — tidak
// ada ruang tebakan yang bisa dipersempit brute force, jadi biaya kerja tambahan
// hanya memperlambat verifikasi tanpa menambah keamanan.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@nawasena/schemas";
import type { SessionKeys } from "./keys.js";

/** Parameter sesi dari SDD §8.1 — nilainya kontrak, bukan setelan. */
export const SESSION_POLICY = {
  /** Access 15 menit: cukup pendek agar `ver` menutup jendela penyalahgunaan. */
  accessTtlSeconds: 15 * 60,
  /** Refresh 30 hari: pengguna tidak perlu login ulang tiap minggu. */
  refreshTtlSeconds: 30 * 24 * 60 * 60,
  algorithm: "RS256",
  issuer: "nawasena",
  audience: "nawasena-api",
  /** 256 bit dari CSPRNG — di luar jangkauan tebakan. */
  refreshBytes: 32,
} as const;

/** Klaim access token (SDD §8.1). Sengaja minimal: TIDAK ada PII di dalamnya. */
export interface AccessClaims {
  /** userId. */
  sub: string;
  role: UserRole;
  /** users.token_version saat token diterbitkan. */
  ver: number;
}

/** Refresh baru: nilai mentah untuk klien, hash untuk DB. */
export interface RefreshMaterial {
  /** Diberikan ke klien SEKALI. Jangan log, jangan simpan mentah. */
  token: string;
  /** SHA-256 hex — inilah yang masuk kolom token_hash. */
  tokenHash: string;
  expiresAt: Date;
}

export interface TokenServiceDeps extends SessionKeys {
  /** Sumber waktu; disuntik test untuk memajukan jam tanpa menunggu. */
  clock?: () => Date;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createTokenService(deps: TokenServiceDeps) {
  const { privateKey, publicKey } = deps;
  const now = deps.clock ?? (() => new Date());

  return {
    /** Tanda tangani access token; exp diisi dari SESSION_POLICY. */
    async signAccessToken(claims: AccessClaims): Promise<string> {
      const issuedAt = Math.floor(now().getTime() / 1000);
      return new SignJWT({ role: claims.role, ver: claims.ver })
        .setProtectedHeader({ alg: SESSION_POLICY.algorithm })
        .setSubject(claims.sub)
        .setIssuer(SESSION_POLICY.issuer)
        .setAudience(SESSION_POLICY.audience)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + SESSION_POLICY.accessTtlSeconds)
        .sign(privateKey);
    },

    /**
     * Verifikasi access token. Mengembalikan `null` untuk SEMUA bentuk
     * penolakan — tanda tangan salah, kedaluwarsa, issuer/audience keliru,
     * algoritma tidak sesuai, klaim cacat, atau `ver` sudah usang. Pemanggil
     * yang memutuskan kode error; membedakan alasan penolakan kepada klien
     * hanya berguna bagi penebak.
     *
     * `algorithms` dikunci ke RS256 dengan sengaja: tanpa itu, token ber-header
     * `alg: none` atau HS256 (memakai kunci publik kita sebagai rahasia HMAC)
     * bisa lolos — dua serangan JWT paling klasik.
     *
     * `expectedVersion` adalah tempat `ver` bekerja: pemanggil membawa
     * users.token_version terkini, dan token yang lebih tua ditolak meski tanda
     * tangannya sah dan belum kedaluwarsa. Itulah logout-semua-perangkat.
     */
    async verifyAccessToken(
      token: string,
      expected?: { version: number },
    ): Promise<AccessClaims | null> {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, publicKey, {
          algorithms: [SESSION_POLICY.algorithm],
          issuer: SESSION_POLICY.issuer,
          audience: SESSION_POLICY.audience,
          currentDate: now(),
        }));
      } catch {
        return null;
      }

      const { sub, role, ver } = payload as { sub?: string; role?: unknown; ver?: unknown };
      if (typeof sub !== "string" || sub === "") return null;
      if (role !== "seeker" && role !== "admin" && role !== "employer") return null;
      if (typeof ver !== "number" || !Number.isInteger(ver)) return null;
      if (expected !== undefined && ver !== expected.version) return null;

      return { sub, role, ver };
    },

    /** Refresh baru + hash + kedaluwarsa 30 hari. */
    issueRefreshToken(): RefreshMaterial {
      const token = randomBytes(SESSION_POLICY.refreshBytes).toString("base64url");
      return {
        token,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(now().getTime() + SESSION_POLICY.refreshTtlSeconds * 1000),
      };
    },

    /** Hash refresh yang dikirim klien, untuk dicari di DB. */
    hashRefreshToken: sha256Hex,

    /**
     * Perbandingan hash dengan waktu tetap. Pencarian di DB memakai indeks
     * unique (dan itu memang tidak konstan waktunya), tetapi setiap
     * perbandingan hash di dalam proses kita memakai jalur ini.
     */
    hashEquals(a: string, b: string): boolean {
      const bufA = Buffer.from(a, "utf8");
      const bufB = Buffer.from(b, "utf8");
      return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
