// Builder dokumen OpenAPI dari skema zod (zod-openapi, SDD §11).
// TIDAK diekspor dari index.ts — hanya dipakai scripts/gen-openapi.ts dan test;
// konsumen paket (web/mobile/api-client) cukup skema zod-nya.
//
// DETERMINISTIK by design: tanpa timestamp/nilai acak, versi di-pin manual,
// urutan path & skema mengikuti urutan deklarasi di file ini. Output byte-sama
// untuk input sama → diff check di CI valid.
import { createDocument, type oas31 } from "zod-openapi";
import { errorEnvelopeSchema } from "./common.js";
import {
  requestOtpSchema,
  requestOtpResponseSchema,
  verifyOtpSchema,
  verifyOtpResponseSchema,
  googleAuthSchema,
  googleAuthResponseSchema,
  refreshSessionSchema,
  refreshSessionResponseSchema,
} from "./auth.js";
import { deleteAccountSchema } from "./auth.js";
import { updateMeSchema, meResponseSchema } from "./users.js";

/** Versi kontrak API — naikkan manual saat kontrak berubah (additive-first). */
export const CONTRACT_VERSION = "0.1.0";

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorEnvelopeSchema } },
});

export function buildOpenApiDocument(): oas31.OpenAPIObject {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "Nawasena API",
      version: CONTRACT_VERSION,
      description:
        "Kontrak API Nawasena — di-generate dari zod di packages/schemas. " +
        "Jangan edit openapi.json manual; jalankan pnpm --filter @nawasena/schemas gen:openapi.",
    },
    servers: [{ url: "/api/v1" }],
    // Skema keamanan baku seluruh API (PR-020): access token RS256 di header
    // Authorization. Endpoint pre-auth menyatakan `security: []` secara
    // eksplisit — deny-by-default juga di dokumen, bukan hanya di kode.
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Access token dari /auth/otp/verify, /auth/google, atau /auth/refresh",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      // Alur OTP (PR-016): request → verify. Pengiriman JWT menyusul di PR-018.
      "/auth/otp/request": {
        post: {
          operationId: "requestOtp",
          tags: ["auth"],
          summary: "Minta kode OTP",
          security: [], // eksplisit publik: endpoint pre-auth

          description: "Mengirim kode OTP ke nomor HP via WhatsApp/SMS.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: requestOtpSchema } },
          },
          responses: {
            "202": {
              description: "OTP dikirim",
              content: { "application/json": { schema: requestOtpResponseSchema } },
            },
            "400": errorResponse("Input tidak valid"),
            "429": errorResponse("Terlalu banyak permintaan — lihat header Retry-After"),
            "503": errorResponse("Pengiriman OTP belum dikonfigurasi"),
          },
        },
      },
      "/auth/otp/verify": {
        post: {
          operationId: "verifyOtp",
          tags: ["auth"],
          summary: "Verifikasi kode OTP",
          security: [], // eksplisit publik: endpoint pre-auth
          description:
            "Memeriksa kode OTP. Bila cocok, akun dicari berdasarkan nomor HP " +
            "dan dibuat bila belum ada (find-or-create).",
          requestBody: {
            required: true,
            content: { "application/json": { schema: verifyOtpSchema } },
          },
          responses: {
            "200": {
              description: "Kode cocok",
              content: { "application/json": { schema: verifyOtpResponseSchema } },
            },
            "400": errorResponse("Input tidak valid"),
            "401": errorResponse("Kode salah"),
            "410": errorResponse("Kode hangus atau kedaluwarsa — minta kode baru"),
            "429": errorResponse("Percobaan terkunci sementara — lihat header Retry-After"),
          },
        },
      },
      // Login Google (PR-017): authorization code + PKCE ditukar di server,
      // sehingga client_secret tidak pernah ada di perangkat pengguna.
      "/auth/google": {
        post: {
          operationId: "loginWithGoogle",
          tags: ["auth"],
          summary: "Masuk dengan Google",
          security: [], // eksplisit publik: endpoint pre-auth
          description:
            "Menukar authorization code Google (dengan PKCE code_verifier) menjadi sesi. " +
            "id_token diverifikasi terhadap kunci publik Google (audience, issuer, " +
            "kedaluwarsa). Akun dicari berdasarkan google_id, lalu email terverifikasi, " +
            "dan dibuat bila belum ada (find-or-create).",
          requestBody: {
            required: true,
            content: { "application/json": { schema: googleAuthSchema } },
          },
          responses: {
            "200": {
              description: "Masuk berhasil",
              content: { "application/json": { schema: googleAuthResponseSchema } },
            },
            "400": errorResponse("Input tidak valid"),
            "401": errorResponse("Code/verifier ditolak Google, atau id_token tidak sah"),
            "403": errorResponse("Email Google belum terverifikasi"),
            "503": errorResponse("Login Google belum dikonfigurasi atau Google tidak terjangkau"),
          },
        },
      },
      // Perpanjangan sesi (PR-018b): refresh ROTATING — token lama dicabut pada
      // setiap pemakaian. Memakai token yang sudah dicabut mencabut seluruh
      // keluarga sesi (reuse detection, SDD §8.1).
      "/auth/refresh": {
        post: {
          operationId: "refreshSession",
          tags: ["auth"],
          summary: "Perpanjang sesi",
          security: [], // kredensialnya adalah refresh token itu sendiri
          description:
            "Menukar refresh token dengan pasangan token baru. Klien web tidak mengirim " +
            "body: tokennya ada di cookie HttpOnly yang dilampirkan browser, dan token " +
            "barunya dikembalikan sebagai cookie pula. Klien mobile mengirim dan menerima " +
            "refresh token di body untuk disimpan di SecureStore.",
          requestBody: {
            required: false,
            content: { "application/json": { schema: refreshSessionSchema } },
          },
          responses: {
            "200": {
              description: "Sesi diperpanjang",
              content: { "application/json": { schema: refreshSessionResponseSchema } },
            },
            "400": errorResponse("Input tidak valid"),
            "401": errorResponse("Refresh token tidak dikenal, kedaluwarsa, atau sudah dicabut"),
            "503": errorResponse("Sesi belum dikonfigurasi (kunci RS256 tidak tersedia)"),
          },
        },
      },
      // Keluar (PR-018c). Keduanya IDEMPOTEN dan selalu 204: pengguna yang
      // menekan "keluar" tidak boleh dihadapkan pada kegagalan, dan jawaban
      // yang berbeda antara token sah dan token karangan akan menjadikan
      // endpoint ini alat penebak token.
      "/auth/logout": {
        post: {
          operationId: "logout",
          tags: ["auth"],
          summary: "Keluar dari perangkat ini",
          security: [],
          description:
            "Mencabut seluruh rantai sesi perangkat ini (satu keluarga token). Perangkat " +
            "lain tidak tersentuh. Cookie refresh dihapus. Selalu 204, termasuk bila token " +
            "tidak dikirim atau tidak dikenal.",
          requestBody: {
            required: false,
            content: { "application/json": { schema: refreshSessionSchema } },
          },
          responses: {
            "204": { description: "Sesi perangkat ini diakhiri" },
            "400": errorResponse("Input tidak valid"),
            "503": errorResponse("Sesi belum dikonfigurasi (kunci RS256 tidak tersedia)"),
          },
        },
      },
      "/auth/logout-all": {
        post: {
          operationId: "logoutAll",
          tags: ["auth"],
          summary: "Keluar dari semua perangkat",
          security: [],
          description:
            "Menaikkan token version pengguna (seluruh access token yang beredar langsung " +
            "ditolak) dan mencabut semua refresh token miliknya. Cookie refresh dihapus. " +
            "Selalu 204, termasuk bila token tidak dikirim atau tidak dikenal.",
          requestBody: {
            required: false,
            content: { "application/json": { schema: refreshSessionSchema } },
          },
          responses: {
            "204": { description: "Semua sesi pengguna diakhiri" },
            "400": errorResponse("Input tidak valid"),
            "503": errorResponse("Sesi belum dikonfigurasi (kunci RS256 tidak tersedia)"),
          },
        },
      },
      // Hapus akun (PR-021, hak hapus UU PDP). SATU-SATUNYA endpoint /auth/*
      // yang menuntut access token — ia bukan pintu masuk, melainkan aksi atas
      // akun yang sudah masuk. Body-nya membawa BUKTI ULANG kepemilikan, sebab
      // access token saja hanya membuktikan perangkat ini pernah dipakai masuk.
      "/auth/account": {
        delete: {
          operationId: "deleteAccount",
          tags: ["auth"],
          summary: "Hapus akun sendiri",
          description:
            "Menghapus akun pemilik sesi (soft delete) dan mencabut seluruh sesinya dalam satu " +
            "transaksi. Wajib disertai konfirmasi ulang identitas: kode OTP baru ke nomor " +
            "terdaftar, atau consent Google yang `sub`-nya cocok dengan akun. Data disimpan " +
            "maksimal 30 hari sebelum purge, sehingga penghapusan keliru masih bisa dibatalkan " +
            "lewat dukungan pelanggan.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: deleteAccountSchema } },
          },
          responses: {
            "204": { description: "Akun dihapus dan seluruh sesi dicabut" },
            "400": errorResponse("Input tidak valid, atau cara konfirmasi tidak dimiliki akun ini"),
            "401": errorResponse("Belum masuk, sesi berakhir, atau kode OTP salah"),
            "403": errorResponse("Akun Google yang dipakai berbeda dengan akun ini"),
            "410": errorResponse("Kode OTP hangus atau kedaluwarsa — minta kode baru"),
            "429": errorResponse("Percobaan terkunci sementara — lihat header Retry-After"),
            "503": errorResponse("Identitas belum bisa dipastikan (kredensial server tidak lengkap)"),
          },
        },
      },
      // Profil akun (PR-020). Tidak ada `:userId` dengan sengaja: identitas
      // diambil dari access token, sehingga tidak ada saluran input untuk
      // menyebut pengguna lain.
      "/me": {
        get: {
          operationId: "getMe",
          tags: ["users"],
          summary: "Profil akun sendiri",
          description:
            "Mengembalikan profil pengguna yang sedang masuk. Field internal " +
            "(token version, google id, waktu hapus) tidak pernah disertakan.",
          responses: {
            "200": {
              description: "Profil akun",
              content: { "application/json": { schema: meResponseSchema } },
            },
            "401": errorResponse("Belum masuk, atau sesi sudah berakhir"),
            "503": errorResponse("Sesi belum dikonfigurasi (kunci RS256 tidak tersedia)"),
          },
        },
        put: {
          operationId: "updateMe",
          tags: ["users"],
          summary: "Perbarui profil akun sendiri",
          description:
            "Memperbarui nama dan/atau email. Field `email` yang tidak dikirim berarti " +
            "tidak diubah; `null` mengosongkannya. Email harus belum dipakai akun aktif lain.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: updateMeSchema } },
          },
          responses: {
            "200": {
              description: "Profil setelah diperbarui",
              content: { "application/json": { schema: meResponseSchema } },
            },
            "400": errorResponse("Input tidak valid"),
            "401": errorResponse("Belum masuk, atau sesi sudah berakhir"),
            "409": errorResponse("Email tidak bisa dipakai"),
            "503": errorResponse("Sesi belum dikonfigurasi (kunci RS256 tidak tersedia)"),
          },
        },
      },
    },
  });
}

/** Serialisasi kanonik dokumen — satu-satunya format yang di-commit & di-diff. */
export function renderOpenApiJson(): string {
  return `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
}
