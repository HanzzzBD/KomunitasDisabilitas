// Builder dokumen OpenAPI dari skema zod (zod-openapi, SDD §11).
// TIDAK diekspor dari index.ts — hanya dipakai scripts/gen-openapi.ts dan test;
// konsumen paket (web/mobile/api-client) cukup skema zod-nya.
//
// DETERMINISTIK by design: tanpa timestamp/nilai acak, versi di-pin manual,
// urutan path & skema mengikuti urutan deklarasi di file ini. Output byte-sama
// untuk input sama → diff check di CI valid.
import { createDocument, type oas31, type ZodOpenApiPathItemObject } from "zod-openapi";
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
import { dataExportResponseSchema } from "./export.js";
import {
  accessibilityResponseSchema,
  updateAccessibilityPreferencesSchema,
} from "./accessibility.js";
import { aiQuotaResponseSchema } from "./ai.js";
import {
  deviceResponseSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  notificationReadResponseSchema,
  registerDeviceSchema,
} from "./notifications.js";
import {
  careerItemParamsSchema,
  createEducationSchema,
  createExperienceSchema,
  createSkillSchema,
  educationListResponseSchema,
  educationResponseSchema,
  experienceListResponseSchema,
  experienceResponseSchema,
  seekerProfileResponseSchema,
  skillListResponseSchema,
  skillResponseSchema,
  updateEducationSchema,
  updateExperienceSchema,
  updateSeekerProfileSchema,
  updateSkillSchema,
} from "./profiles.js";
import type { ZodTypeAny } from "zod";

/** Versi kontrak API — naikkan manual saat kontrak berubah (additive-first). */
export const CONTRACT_VERSION = "0.1.0";

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorEnvelopeSchema } },
});

/** Jawaban yang muncul di SETIAP endpoint ber-sesi. Ditulis sekali. */
const responsSesi = {
  "401": errorResponse("Belum masuk, atau sesi sudah berakhir"),
  "503": errorResponse("Sesi belum dikonfigurasi (kunci RS256 tidak tersedia)"),
} as const;

const jsonBody = (schema: ZodTypeAny) => ({
  required: true,
  content: { "application/json": { schema } },
});

const jsonOk = (description: string, schema: ZodTypeAny) => ({
  description,
  content: { "application/json": { schema } },
});

/**
 * Keempat operasi satu sub-entitas karier — bentuknya identik untuk
 * experiences/educations/skills, persis seperti `daftarkanKarier` di
 * `modules/profiles/routers`. Ditulis sebagai fungsi supaya dokumen dan router
 * tidak bisa berbeda bentuk tanpa seseorang menyadarinya.
 */
function pathsKarier(opsi: {
  basis: string;
  /** Kata benda tunggal untuk operationId, mis. "Experience". */
  tunggal: string;
  /** Frasa Indonesia untuk ringkasan, mis. "riwayat kerja". */
  sebutan: string;
  daftar: ZodTypeAny;
  item: ZodTypeAny;
  buat: ZodTypeAny;
  ubah: ZodTypeAny;
}): Record<string, ZodOpenApiPathItemObject> {
  const { basis, tunggal, sebutan, daftar, item, buat, ubah } = opsi;
  const tags = ["profiles"];
  return {
    [basis]: {
      get: {
        operationId: `list${tunggal}s`,
        tags,
        summary: `Daftar ${sebutan} sendiri`,
        description:
          `Mengembalikan seluruh ${sebutan} milik pengguna yang sedang masuk. ` +
          "Tanpa pagination dengan sengaja: daftarnya diisi tangan dan pendek.",
        responses: {
          "200": jsonOk(`Daftar ${sebutan}`, daftar),
          ...responsSesi,
        },
      },
      post: {
        operationId: `create${tunggal}`,
        tags,
        summary: `Tambah ${sebutan}`,
        requestBody: jsonBody(buat),
        responses: {
          "201": jsonOk(`${tunggal} yang baru dibuat`, item),
          "400": errorResponse("Input tidak valid"),
          ...responsSesi,
        },
      },
    },
    [`${basis}/{id}`]: {
      put: {
        operationId: `update${tunggal}`,
        tags,
        summary: `Perbarui satu ${sebutan}`,
        description:
          "Field yang tidak dikirim berarti tidak diubah. Baris milik pengguna " +
          "lain berperilaku seperti baris yang tidak ada — 404, bukan 403, " +
          "sebab keberadaannya sendiri bukan informasi yang layak dibocorkan.",
        requestParams: { path: careerItemParamsSchema },
        requestBody: jsonBody(ubah),
        responses: {
          "200": jsonOk(`${tunggal} setelah diperbarui`, item),
          "400": errorResponse("Input tidak valid, atau `id` bukan UUID"),
          "404": errorResponse("Tidak ditemukan"),
          ...responsSesi,
        },
      },
      delete: {
        operationId: `delete${tunggal}`,
        tags,
        summary: `Hapus satu ${sebutan}`,
        requestParams: { path: careerItemParamsSchema },
        responses: {
          "204": { description: "Terhapus — tanpa badan jawaban" },
          "400": errorResponse("`id` bukan UUID"),
          "404": errorResponse("Tidak ditemukan"),
          ...responsSesi,
        },
      },
    },
  };
}

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
      // Ekspor data pribadi (PR-022, hak portabilitas UU PDP §8.7). Tidak ada
      // parameter apa pun dengan sengaja: pemiliknya datang dari access token,
      // jadi tidak ada saluran untuk menyebut pengguna lain.
      "/me/export": {
        get: {
          operationId: "exportMyData",
          tags: ["users"],
          summary: "Unduh seluruh data pribadi sendiri",
          description:
            "Mengembalikan seluruh data milik pengguna yang sedang masuk dalam satu berkas " +
            "JSON ber-versi. `formatVersion` naik hanya saat bentuknya berubah dengan cara " +
            "yang tidak aditif — bagian baru yang ditambahkan kelak tidak menaikkannya. " +
            "Dibatasi 3 kali per 24 jam per pengguna, dan setiap ekspor tercatat di audit.",
          responses: {
            "200": {
              description: "Berkas ekspor",
              content: { "application/json": { schema: dataExportResponseSchema } },
            },
            "401": errorResponse("Belum masuk, atau sesi sudah berakhir"),
            "429": errorResponse("Kuota unduh harian habis — lihat header Retry-After"),
            "503": errorResponse("Sesi belum dikonfigurasi (kunci RS256 tidak tersedia)"),
          },
        },
      },

      // Preferensi aksesibilitas (PR-034, ADR-008). Tidak ada parameter apa pun:
      // pemiliknya datang dari access token.
      "/me/accessibility": {
        get: {
          operationId: "getMyAccessibility",
          tags: ["accessibility"],
          summary: "Preferensi aksesibilitas sendiri",
          description:
            "Mengembalikan preferensi aksesibilitas pengguna yang sedang masuk. " +
            "Pengguna yang belum pernah menyimpannya tetap mendapat 200 berisi nilai " +
            "baku — bukan 404: tidak adanya preferensi tersimpan bukan kesalahan.",
          responses: {
            "200": jsonOk("Preferensi aksesibilitas", accessibilityResponseSchema),
            ...responsSesi,
          },
        },
        put: {
          operationId: "updateMyAccessibility",
          tags: ["accessibility"],
          summary: "Perbarui preferensi aksesibilitas sendiri",
          description:
            "Field yang tidak dikirim berarti tidak diubah. Preferensi ini diterapkan " +
            "otomatis di seluruh UI (ADR-008), jadi perubahannya berlaku lintas perangkat.",
          requestBody: jsonBody(updateAccessibilityPreferencesSchema),
          responses: {
            "200": jsonOk("Preferensi setelah diperbarui", accessibilityResponseSchema),
            "400": errorResponse("Input tidak valid"),
            ...responsSesi,
          },
        },
      },

      // Profil pencari kerja (PR-037/PR-040). Kolom sensitif (ragam disabilitas,
      // kebutuhan akomodasi) hanya ikut bila consent-nya aktif — lihat 403 di PUT.
      "/me/profile": {
        get: {
          operationId: "getMyProfile",
          tags: ["profiles"],
          summary: "Profil pencari kerja sendiri",
          description:
            "Mengembalikan profil milik pengguna yang sedang masuk. Kolom sensitif " +
            "hanya disertakan bila persetujuan penyimpanannya sedang aktif; tanpa itu " +
            "kolomnya tidak muncul sama sekali, bukan muncul kosong.",
          responses: {
            "200": jsonOk("Profil pencari kerja", seekerProfileResponseSchema),
            ...responsSesi,
          },
        },
        put: {
          operationId: "updateMyProfile",
          tags: ["profiles"],
          summary: "Perbarui profil pencari kerja sendiri",
          description:
            "Field yang tidak dikirim berarti tidak diubah. Menulis kolom sensitif " +
            "tanpa persetujuan aktif ditolak 403 — permintaannya sah, izinnya yang " +
            "belum ada — dan tidak satu baris pun ditulis. Mencabut persetujuan " +
            "sambil menyimpan data sensitif ditolak di skema.",
          requestBody: jsonBody(updateSeekerProfileSchema),
          responses: {
            "200": jsonOk("Profil setelah diperbarui", seekerProfileResponseSchema),
            "400": errorResponse("Input tidak valid, atau nilai di luar taksonomi"),
            "403": errorResponse("Belum ada persetujuan penyimpanan data sensitif"),
            ...responsSesi,
          },
        },
      },

      ...pathsKarier({
        basis: "/me/experiences",
        tunggal: "Experience",
        sebutan: "riwayat kerja",
        daftar: experienceListResponseSchema,
        item: experienceResponseSchema,
        buat: createExperienceSchema,
        ubah: updateExperienceSchema,
      }),
      ...pathsKarier({
        basis: "/me/educations",
        tunggal: "Education",
        sebutan: "riwayat pendidikan",
        daftar: educationListResponseSchema,
        item: educationResponseSchema,
        buat: createEducationSchema,
        ubah: updateEducationSchema,
      }),
      ...pathsKarier({
        basis: "/me/skills",
        tunggal: "Skill",
        sebutan: "keahlian",
        daftar: skillListResponseSchema,
        item: skillResponseSchema,
        buat: createSkillSchema,
        ubah: updateSkillSchema,
      }),

      // Notifikasi in-app (PR-047, PRD FR-5.4). Hanya milik pemanggil sendiri.
      "/me/notifications": {
        get: {
          operationId: "listMyNotifications",
          tags: ["notifications"],
          summary: "Daftar notifikasi sendiri",
          description:
            "Terbaru dulu, ber-cursor. Setiap notifikasi membawa kalimatnya dalam " +
            "KEDUA varian bahasa (`id` dan `id-simple`) sekaligus: mode teks " +
            "sederhana adalah state global klien (ADR-008) yang bisa dinyalakan " +
            "kapan saja, dan daftar yang sudah terbuka harus ikut berubah tanpa " +
            "permintaan baru. `meta.unreadCount` selalu jumlah SELURUH yang belum " +
            "dibaca — tidak terpengaruh halaman maupun `unreadOnly`.",
          requestParams: { query: notificationListQuerySchema },
          responses: {
            "200": jsonOk("Halaman notifikasi", notificationListResponseSchema),
            "400": errorResponse("`limit` di luar 1–100, atau cursor tidak terbaca"),
            ...responsSesi,
          },
        },
      },
      "/me/notifications/{id}/read": {
        post: {
          operationId: "markNotificationRead",
          tags: ["notifications"],
          summary: "Tandai satu notifikasi sudah dibaca",
          description:
            "Idempoten: menandai yang sudah dibaca tetap 200 dan tidak menggeser " +
            "waktu baca yang sudah tercatat. Notifikasi milik pengguna lain " +
            "berperilaku seperti yang tidak ada — 404, bukan 403, sebab " +
            "keberadaannya sendiri bukan informasi yang layak dibocorkan.",
          requestParams: { path: notificationIdParamsSchema },
          responses: {
            "200": jsonOk("Notifikasi setelah ditandai", notificationReadResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsSesi,
          },
        },
      },

      // Perangkat penerima push (PR-048a). Dipakai klien mobile (PR-088/094);
      // web push di luar scope MVP.
      "/me/devices": {
        post: {
          operationId: "registerMyDevice",
          tags: ["notifications"],
          summary: "Daftarkan perangkat penerima push",
          description:
            "Idempoten: klien memanggilnya pada SETIAP peluncuran aplikasi, bukan sekali " +
            "seumur pemasangan, jadi pemanggilan ulang dengan token yang sama hanya " +
            "menggeser `lastSeenAt` — 200, bukan 201 dan bukan error. Token bersifat unik " +
            "global: perangkat yang berpindah akun BERPINDAH kepemilikan barisnya, supaya " +
            "pemilik lama berhenti menerima notifikasi pemilik baru. Jawabannya sengaja " +
            "tidak memuat kembali `fcmToken`.",
          requestBody: jsonBody(registerDeviceSchema),
          responses: {
            "200": jsonOk("Perangkat terdaftar", deviceResponseSchema),
            "400": errorResponse("Token kosong/terlalu panjang, atau platform tidak dikenal"),
            ...responsSesi,
          },
        },
      },

      // Jatah AI harian (PR-043a, ADR-012). Hanya milik pemanggil sendiri.
      "/ai/quota": {
        get: {
          operationId: "getMyAiQuota",
          tags: ["ai"],
          summary: "Jatah AI harian sendiri",
          description:
            "Mengembalikan sisa jatah AI pengguna yang sedang masuk untuk hari WIB " +
            "yang sedang berjalan. `globalTersedia` sengaja hanya boolean: sisa " +
            "anggaran bersama adalah data operasional, dan menyebut angkanya sama " +
            "dengan memberi tahu penyalahguna kapan anggaran sedang tipis.",
          responses: {
            "200": jsonOk("Ringkasan jatah AI", aiQuotaResponseSchema),
            ...responsSesi,
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
