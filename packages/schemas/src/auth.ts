// Domain: auth — skema OTP (PR-004 request; PR-016 verify) + Google (PR-017).
// Skema refresh token menyusul di PR-018.
//
// Konvensi (lihat README):
// - nama skema camelCase + suffix Schema: requestOtpSchema
// - tipe PascalCase via z.infer: RequestOtp
// - component OpenAPI PascalCase via .openapi({ ref: "..." })
import "zod-openapi/extend";
import { z } from "zod";
import { idSchema } from "./common.js";

/**
 * Peran pengguna — nilainya SAMA PERSIS dengan enum `Role` di skema Prisma
 * (PR-009). Ditaruh di sini supaya klaim JWT (`role`) dan RBAC (PR-019) punya
 * satu sumber tipe tanpa perlu meng-import `@prisma/client` ke paket bersama.
 */
export const userRoleSchema = z
  .enum(["seeker", "admin", "employer"])
  .openapi({ description: "Peran pengguna", example: "seeker" });

export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Jenis klien pemanggil (PR-018b). Menentukan DI MANA refresh token diserahkan:
 *
 * - `web`    → cookie `HttpOnly; Secure; SameSite=Strict`. Token TIDAK ikut di
 *              body, sebab body bisa dibaca JavaScript dan itu persis yang
 *              hendak dicegah HttpOnly.
 * - `mobile` → di body, untuk disimpan aplikasi di Expo SecureStore. Tidak ada
 *              cookie jar yang bisa diandalkan di React Native, dan tidak ada
 *              risiko XSS-mencuri-cookie di sana.
 *
 * Klien menyatakan dirinya alih-alih server menebak dari User-Agent: tebakan
 * yang meleset berarti web menerima refresh token yang bisa dibaca script.
 */
export const sessionClientSchema = z
  .enum(["web", "mobile"])
  .default("web")
  .openapi({ description: "Jenis klien — menentukan cookie vs body", example: "web" });

export type SessionClient = z.infer<typeof sessionClientSchema>;

/**
 * Pasangan token hasil login/refresh (PR-018b, SDD §8.1).
 * `refreshToken` HANYA terisi untuk klien mobile — lihat sessionClientSchema.
 */
export const sessionTokensSchema = z
  .object({
    accessToken: z.string().min(1).openapi({ description: "JWT RS256, berlaku 15 menit" }),
    /** Detik hingga accessToken kedaluwarsa — klien menjadwalkan refresh dari sini. */
    expiresIn: z.number().int().positive().openapi({ example: 900 }),
    refreshToken: z
      .string()
      .min(1)
      .optional()
      .openapi({ description: "Hanya untuk client=mobile; web menerimanya sebagai cookie" }),
  })
  .openapi({ ref: "SessionTokens" });

export type SessionTokens = z.infer<typeof sessionTokensSchema>;

/** Nomor HP Indonesia format E.164 (+62…). */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+62\d{8,13}$/, {
    message: "Nomor HP harus format +62, contoh +6281234567890",
  })
  .openapi({ description: "Nomor HP Indonesia, format E.164", example: "+6281234567890" });

/** POST /api/v1/auth/otp/request — body. */
export const requestOtpSchema = z
  .object({
    phone: phoneNumberSchema,
  })
  .openapi({ ref: "RequestOtp", description: "Permintaan kirim kode OTP via WhatsApp/SMS" });

export type RequestOtp = z.infer<typeof requestOtpSchema>;

/** POST /api/v1/auth/otp/request — response 202. */
export const requestOtpResponseSchema = z
  .object({
    data: z.object({
      /**
       * Detik sebelum boleh minta OTP lagi (rate limit kirim per nomor, PR-016).
       * 0 = kuota jam berjalan masih tersisa, boleh langsung minta lagi.
       */
      retryAfterSeconds: z.number().int().min(0).openapi({ example: 0 }),
    }),
  })
  .openapi({ ref: "RequestOtpResponse" });

export type RequestOtpResponse = z.infer<typeof requestOtpResponseSchema>;

/** Kode OTP 6 angka. String (bukan number) — angka 0 di depan bermakna. */
export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, { message: "Kode OTP harus 6 angka" })
  .openapi({ description: "Kode OTP 6 angka dari WhatsApp/SMS", example: "482913" });

/** POST /api/v1/auth/otp/verify — body. */
export const verifyOtpSchema = z
  .object({
    phone: phoneNumberSchema,
    code: otpCodeSchema,
    client: sessionClientSchema,
  })
  .openapi({ ref: "VerifyOtp", description: "Verifikasi kode OTP yang diterima pengguna" });

export type VerifyOtp = z.infer<typeof verifyOtpSchema>;

/**
 * POST /api/v1/auth/otp/verify — response 200.
 * Pasangan JWT ditambahkan PR-018b secara ADDITIVE: field lama (`userId`,
 * `isNewUser`) tidak berubah bentuk maupun makna.
 */
export const verifyOtpResponseSchema = z
  .object({
    data: z
      .object({
        userId: idSchema,
        /** true bila akun baru dibuat pada verifikasi ini (find-or-create). */
        isNewUser: z.boolean().openapi({ example: false }),
      })
      .extend(sessionTokensSchema.shape),
  })
  .openapi({ ref: "VerifyOtpResponse" });

export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>;

/**
 * Authorization code dari Google (opaque). Panjangnya tidak dijamin Google,
 * jadi batas atas di sini hanya penjaga ukuran body — bukan aturan format.
 */
export const authorizationCodeSchema = z
  .string()
  .trim()
  .min(1, { message: "Kode dari Google tidak boleh kosong" })
  .max(2048, { message: "Kode dari Google terlalu panjang" })
  .openapi({ description: "Authorization code sekali pakai dari Google" });

/**
 * PKCE code_verifier (RFC 7636 §4.1): 43–128 karakter unreserved.
 * Divalidasi di sini supaya verifier yang salah bentuk ditolak sebelum
 * menyentuh jaringan — Google akan menolaknya juga, tetapi lebih lambat.
 */
export const pkceCodeVerifierSchema = z
  .string()
  .regex(/^[A-Za-z0-9\-._~]{43,128}$/, {
    message: "Verifier PKCE harus 43–128 karakter (huruf, angka, - . _ ~)",
  })
  .openapi({ description: "PKCE code_verifier (RFC 7636), 43–128 karakter" });

/**
 * Harus sama persis dengan redirect_uri saat meminta `code` — Google menolak
 * bila berbeda. Skema kustom mobile (mis. `com.nawasena:/oauth`) ikut valid.
 *
 * Dipakai dua alur: masuk (`googleAuthSchema`) dan konfirmasi hapus akun
 * (`googleReauthSchema`). Satu definisi, supaya batas panjang & pesan
 * kesalahannya tidak bisa menyimpang di antara keduanya.
 */
const redirectUriSchema = z
  .string()
  .url({ message: "Alamat pengalihan tidak valid" })
  .max(2048, { message: "Alamat pengalihan terlalu panjang" })
  .openapi({ example: "http://localhost:5173/masuk/google" });

/**
 * POST /api/v1/auth/google — body.
 * Alur authorization code + PKCE (bukan implicit): klien publik (web/mobile)
 * menukar `code` di server kita, sehingga client_secret tidak pernah ada di
 * perangkat pengguna.
 */
export const googleAuthSchema = z
  .object({
    code: authorizationCodeSchema,
    codeVerifier: pkceCodeVerifierSchema,
    redirectUri: redirectUriSchema,
    client: sessionClientSchema,
  })
  .openapi({ ref: "GoogleAuth", description: "Tukar authorization code Google (PKCE) jadi sesi" });

export type GoogleAuth = z.infer<typeof googleAuthSchema>;

/**
 * POST /api/v1/auth/google — response 200.
 * Bentuknya sengaja SAMA dengan verifyOtpResponse: kedua metode login bermuara
 * pada envelope yang sama, dan PR-018 menambah pasangan JWT ke keduanya
 * sekaligus (perubahan additive).
 */
export const googleAuthResponseSchema = z
  .object({
    data: z
      .object({
        userId: idSchema,
        /** true bila akun baru dibuat pada login ini (find-or-create). */
        isNewUser: z.boolean().openapi({ example: false }),
      })
      .extend(sessionTokensSchema.shape),
  })
  .openapi({ ref: "GoogleAuthResponse" });

export type GoogleAuthResponse = z.infer<typeof googleAuthResponseSchema>;

/**
 * POST /api/v1/auth/refresh — body.
 *
 * `refreshToken` OPSIONAL dengan sengaja: klien web tidak mengirimkannya sama
 * sekali — tokennya ada di cookie HttpOnly yang tidak bisa dibaca JavaScript,
 * dan browser melampirkannya sendiri. Yang mengisi field ini adalah mobile,
 * yang menyimpan tokennya di SecureStore. Body kosong pada web bukan kelalaian
 * validasi, melainkan bentuk yang benar.
 */
export const refreshSessionSchema = z
  .object({
    refreshToken: z
      .string()
      .min(1, { message: "Token perpanjangan tidak boleh kosong" })
      .max(512, { message: "Token perpanjangan terlalu panjang" })
      .optional()
      .openapi({ description: "Hanya untuk client mobile; web memakai cookie" }),
  })
  .openapi({ ref: "RefreshSession", description: "Perpanjang sesi dengan refresh token" });

export type RefreshSession = z.infer<typeof refreshSessionSchema>;

/** POST /api/v1/auth/refresh — response 200. */
export const refreshSessionResponseSchema = z
  .object({ data: sessionTokensSchema })
  .openapi({ ref: "RefreshSessionResponse" });

export type RefreshSessionResponse = z.infer<typeof refreshSessionResponseSchema>;

/**
 * Bukti kepemilikan akun Google untuk konfirmasi hapus akun (PR-021).
 *
 * Bentuknya sama dengan masuk MINUS `client`: tidak ada sesi yang diterbitkan
 * di sini, jadi tidak ada yang perlu diputuskan tentang cookie vs body. Yang
 * dipakai server hanyalah klaim `sub` dari id_token — dicocokkan dengan
 * `google_id` akun yang sedang dihapus.
 */
export const googleReauthSchema = z
  .object({
    code: authorizationCodeSchema,
    codeVerifier: pkceCodeVerifierSchema,
    redirectUri: redirectUriSchema,
  })
  .openapi({ ref: "GoogleReauth", description: "Konfirmasi ulang identitas lewat Google" });

export type GoogleReauth = z.infer<typeof googleReauthSchema>;

/**
 * Hari sebelum data dihapus permanen (SDD §6.4; ditegakkan job purge PR-023).
 *
 * DI SINI, DI KONTRAK, DAN BUKAN HANYA DI SERVER. Angka ini bukan detail
 * implementasi: ia DIJANJIKAN kepada pengguna di layar konfirmasi hapus akun
 * ("data Anda masih bisa dipulihkan dalam 30 hari") dan di SMS pemberitahuan,
 * lalu DITEGAKKAN oleh job purge. Bila web menuliskan angkanya sendiri, janji
 * dan perilaku bebas menyimpang — dan yang menanggung selisihnya adalah orang
 * yang datang di hari ke-28 karena menyangka masih sempat.
 *
 * Dipindahkan ke sini di PR-033c-1, saat pemakai keduanya (web) lahir.
 */
export const HARI_SEBELUM_PURGE = 30;

/**
 * DELETE /api/v1/auth/account — body.
 *
 * KENAPA ADA BODY SAMA SEKALI. Access token saja TIDAK cukup untuk menghapus
 * akun: ia berumur 15 menit dan diperbarui diam-diam, sehingga perangkat yang
 * ditinggalkan terbuka — atau token yang dicuri — sudah memenuhi syaratnya.
 * Penghapusan menuntut bukti kredensial ASLI, sekali lagi, saat itu juga.
 *
 * Dua jalur karena platform ini punya dua kredensial dan TIDAK punya password:
 * pemilik nomor membuktikan diri dengan kode OTP, pengguna Google dengan
 * consent Google yang baru. Menyediakan hanya satu jalur berarti sebagian
 * pengguna tidak bisa memakai hak hapus UU PDP sama sekali (PRD FR-1.4).
 *
 * Tepat SATU yang boleh diisi. "Keduanya" ditolak, bukan diam-diam dipilihkan
 * salah satu: permintaan yang membawa dua bukti berarti klien tidak tahu yang
 * mana yang sedang ia pakai, dan menebak untuknya menyembunyikan bug itu.
 */
export const deleteAccountSchema = z
  .object({
    otpCode: otpCodeSchema
      .optional()
      .openapi({ description: "Kode OTP baru ke nomor terdaftar — untuk akun ber-nomor HP" }),
    google: googleReauthSchema
      .optional()
      .openapi({ description: "Untuk akun yang masuk lewat Google" }),
  })
  .superRefine((nilai, ctx) => {
    const terisi = [nilai.otpCode !== undefined, nilai.google !== undefined].filter(Boolean).length;
    if (terisi === 1) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        terisi === 0
          ? "Konfirmasi dulu dengan kode OTP, atau lewat akun Google Anda"
          : "Pilih satu cara konfirmasi saja: kode OTP atau akun Google",
    });
  })
  .openapi({
    ref: "DeleteAccount",
    description: "Konfirmasi hapus akun — tepat satu cara pembuktian",
  });

export type DeleteAccount = z.infer<typeof deleteAccountSchema>;
