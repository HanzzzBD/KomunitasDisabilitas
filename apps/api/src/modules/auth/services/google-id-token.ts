// modules/auth — verifikasi id_token Google (PR-017, PRD FR-1.1, SDD §8.1).
//
// Ini gerbang kepercayaan login Google: setelah fungsi ini mengembalikan
// identitas, sisa sistem memperlakukannya sebagai fakta. Karena itu SEMUA
// pemeriksaan dilakukan eksplisit di sini — tanda tangan (JWKS), issuer,
// audience, kedaluwarsa, dan status verifikasi email — bukan diasumsikan
// sudah dikerjakan oleh pihak lain.
//
// Kenapa `jose` dan bukan google-auth-library: verifikasi JWKS adalah operasi
// standar (RFC 7515/7517/7519), dan `jose` membiarkan URL JWKS disuntik
// sehingga contract test menjalankan jalur verifikasi yang SEBENARNYA terhadap
// token RS256 yang benar-benar ditandatangani. Men-stub library resmi akan
// membuat test lulus tanpa pernah menguji verifikasinya.
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";
import { z } from "zod";
import { appError } from "../../../core/http/index.js";

/**
 * Dua issuer di bawah ini sama-sama sah dan dipakai bergantian oleh Google
 * (dokumentasi OpenID Connect Google). Menerima hanya salah satunya adalah
 * bug yang muncul sporadis dan sulit dilacak.
 */
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;

/** Toleransi selisih jam server (detik) — di bawah ini token belum dianggap basi. */
export const GOOGLE_CLOCK_TOLERANCE_SECONDS = 60;

/** Identitas terpercaya hasil verifikasi. Email di sini SELALU terverifikasi. */
export interface GoogleIdentity {
  /** Klaim `sub` — identitas stabil Google, disimpan sebagai `users.google_id`. */
  googleId: string;
  email: string;
  /** Klaim `name`; string kosong bila Google tidak mengirimnya. */
  fullName: string;
}

/**
 * Klaim yang kita pakai. Klaim lain (picture, hd, azp, …) sengaja dibuang:
 * yang tidak diambil tidak bisa bocor.
 *
 * `email_verified` menerima boolean DAN string "true"/"false": beberapa jalur
 * Google secara historis mengirimnya sebagai string. Menganggap string "true"
 * sebagai "bukan boolean → tolak" akan menolak pengguna yang sah; menganggap
 * string apa pun sebagai truthy akan menerima "false". Jadi dipetakan eksplisit.
 */
const googleClaimsSchema = z.object({
  sub: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(320),
  email_verified: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((nilai) => nilai === true || nilai === "true")
    .optional(),
  name: z.string().trim().max(200).optional(),
});

/**
 * Ubah klaim mentah menjadi identitas terpercaya.
 *
 * Fungsi MURNI dan diekspor supaya "validator klaim" bisa diuji tanpa
 * jaringan, kunci, atau token. Dipanggil SETELAH tanda tangan diverifikasi —
 * ia tidak memeriksa keaslian, hanya isi.
 */
export function parseGoogleIdentity(claims: unknown): GoogleIdentity {
  const parsed = googleClaimsSchema.safeParse(claims);
  if (!parsed.success) {
    // Isi klaim TIDAK ikut dilempar: ia memuat email (PII).
    throw appError("TOKEN_GOOGLE_TIDAK_VALID");
  }

  // Anti account-takeover: tanpa syarat ini, siapa pun yang bisa membuat akun
  // Google dengan alamat email milik orang lain (tanpa membuktikan
  // kepemilikannya) akan tertaut ke akun Nawasena milik korban.
  if (parsed.data.email_verified !== true) {
    throw appError("EMAIL_GOOGLE_BELUM_TERVERIFIKASI");
  }

  return {
    googleId: parsed.data.sub,
    email: parsed.data.email.toLowerCase(),
    fullName: parsed.data.name ?? "",
  };
}

export interface GoogleIdTokenVerifierConfig {
  /** OAuth client id kita — satu-satunya `aud` yang diterima. */
  clientId: string;
  jwksUrl: string;
  timeoutMs: number;
}

export interface GoogleIdTokenVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

/**
 * Kegagalan mengambil JWKS adalah masalah INFRASTRUKTUR kita, bukan token
 * pengguna. Menjawab 401 di kasus itu berbohong kepada pengguna ("data Anda
 * tidak sah") padahal Google-lah yang tak terjangkau — jadi dipisah jadi 503.
 */
function terjemahkanKegagalanJose(err: unknown): never {
  if (err instanceof joseErrors.JWKSTimeout || !(err instanceof joseErrors.JOSEError)) {
    throw appError("BELUM_SIAP", {
      message: "Masuk dengan Google sedang tidak bisa diproses",
      hint: "Coba lagi beberapa saat, atau masuk dengan kode OTP",
    });
  }
  throw appError("TOKEN_GOOGLE_TIDAK_VALID");
}

/**
 * Verifier ber-cache. Dibuat SEKALI saat wiring: `createRemoteJWKSet` menyimpan
 * kunci Google di memori dan hanya mengambil ulang saat menemui `kid` baru
 * (rotasi kunci) — membuatnya per-permintaan berarti satu HTTP ke Google untuk
 * setiap login.
 */
export function createGoogleIdTokenVerifier(
  config: GoogleIdTokenVerifierConfig,
): GoogleIdTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: config.timeoutMs,
  });

  return {
    async verify(idToken) {
      let payload: unknown;
      try {
        // jwtVerify menegakkan tanda tangan + iss + aud + exp/nbf sekaligus.
        // `algorithms` dikunci: tanpa itu token ber-`alg: none` atau HMAC yang
        // memakai kunci publik sebagai rahasia bisa lolos (serangan klasik JWT).
        const hasil = await jwtVerify(idToken, jwks, {
          issuer: [...GOOGLE_ISSUERS],
          audience: config.clientId,
          algorithms: ["RS256"],
          clockTolerance: GOOGLE_CLOCK_TOLERANCE_SECONDS,
        });
        payload = hasil.payload;
      } catch (err) {
        terjemahkanKegagalanJose(err);
      }

      // Di luar try: AppError dari parse tidak boleh tertelan penerjemah di atas.
      return parseGoogleIdentity(payload);
    },
  };
}
