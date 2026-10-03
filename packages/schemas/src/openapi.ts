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
import {
  aiChatSessionParamsSchema,
  aiChatSessionResponseSchema,
  aiCvChatFinalizeResponseSchema,
  aiCvChatRequestSchema,
  aiCvChatSessionStartResponseSchema,
  aiQuotaResponseSchema,
} from "./ai.js";
import {
  companyAdminListResponseSchema,
  companyAdminResponseSchema,
  companyIdParamsSchema,
  companyPublicResponseSchema,
  createCompanySchema,
  updateCompanySchema,
} from "./companies.js";
import {
  adminApplicationDetailResponseSchema,
  adminApplicationListQuerySchema,
  adminApplicationListResponseSchema,
  disclosureSnapshotResponseSchema,
  revealDisclosureSchema,
  updateApplicationStatusSchema,
  applicationIdParamsSchema,
  applicationResponseSchema,
  applyJobSchema,
  idempotencyKeySchema,
  myApplicationDetailResponseSchema,
  myApplicationListQuerySchema,
  myApplicationListResponseSchema,
} from "./applications-api.js";
import { adminMetricsQuerySchema, adminMetricsResponseSchema } from "./admin.js";
import {
  adminUserIdParamsSchema,
  adminUserListQuerySchema,
  adminUserListResponseSchema,
  adminUserResponseSchema,
  moderateUserSchema,
} from "./admin-users.js";
import {
  createSignVideoSchema,
  signVideoAdminListResponseSchema,
  signVideoAdminResponseSchema,
  signVideoIdParamsSchema,
  signVideoSearchQuerySchema,
  signVideoSearchResponseSchema,
  updateSignVideoSchema,
} from "./signbridge.js";
import {
  companyActiveJobsResponseSchema,
  createJobSchema,
  jobAdminListResponseSchema,
  jobAdminResponseSchema,
  jobIdParamsSchema,
  jobPublicResponseSchema,
  jobSearchQuerySchema,
  jobSearchResponseSchema,
  updateJobSchema,
} from "./jobs.js";
import {
  deviceResponseSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  notificationChannelPrefsResponseSchema,
  notificationListResponseSchema,
  notificationReadAllResponseSchema,
  notificationReadResponseSchema,
  updateNotificationChannelPrefsSchema,
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
import {
  createResumeSchema,
  resumeIdParamsSchema,
  resumeListResponseSchema,
  resumePdfResponseSchema,
  resumeResponseSchema,
  updateResumeSchema,
} from "./resumes.js";
import {
  matchesQuerySchema,
  matchesRefreshQuerySchema,
  matchesResponseSchema,
} from "./matching.js";
import { z, type ZodTypeAny } from "zod";

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

/** Sama seperti `responsSesi`, ditambah 403 untuk endpoint `role("admin")` (PR-051). */
const responsAdmin = {
  ...responsSesi,
  "403": errorResponse("Bukan admin"),
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
            "503": errorResponse(
              "Identitas belum bisa dipastikan (kredensial server tidak lengkap)",
            ),
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

      // Preferensi kanal notifikasi (PR-049b). Mengatur kanal yang MENGEJAR
      // pengguna keluar dari aplikasi; in-app tidak ada di sini sebab ia bukan
      // kanal yang dikirimi melainkan riwayat yang bisa dibaca ulang.
      "/me/notification-prefs": {
        get: {
          operationId: "getMyNotificationPrefs",
          tags: ["notifications"],
          summary: "Preferensi kanal notifikasi sendiri",
          description:
            "Mengembalikan preferensi TERSIMPAN, dengan `null` dipertahankan apa adanya. " +
            "`null` berarti pengguna belum pernah memilih kanal itu — berbeda dari memilih " +
            "nilai bawaan. Klien menghitung kanal yang berlaku sendiri lewat `kanalBerlaku()` " +
            "(@nawasena/schemas); bawaannya email mati, push hidup.",
          responses: {
            "200": jsonOk("Preferensi kanal", notificationChannelPrefsResponseSchema),
            ...responsSesi,
          },
        },
        put: {
          operationId: "updateMyNotificationPrefs",
          tags: ["notifications"],
          summary: "Perbarui preferensi kanal notifikasi sendiri",
          description:
            "Kanal yang tidak dikirim berarti tidak diubah; mengirim `null` mengembalikannya " +
            "ke bawaan. Preferensi ini TIDAK berlaku bagi pemberitahuan keamanan akun " +
            "(mis. kabar pasca-hapus akun): kabar itu tidak punya kanal lain, dan opt-out " +
            "yang membungkamnya bukan preferensi melainkan lubang.",
          requestBody: jsonBody(updateNotificationChannelPrefsSchema),
          responses: {
            "200": jsonOk("Preferensi setelah diperbarui", notificationChannelPrefsResponseSchema),
            "400": errorResponse("Input tidak valid, atau tidak ada kanal yang disebut"),
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
      // Tandai SEMUA dibaca (PR-050). Endpoint tersendiri, bukan perulangan di
      // klien: klien hanya memegang halaman yang sudah diunduhnya, jadi versi
      // klien akan menandai 20 dari 200 dan menyisakan lencana yang tetap merah.
      "/me/notifications/read-all": {
        post: {
          operationId: "markAllNotificationsRead",
          tags: ["notifications"],
          summary: "Tandai seluruh notifikasi sendiri sebagai dibaca",
          description:
            "Idempoten: pemanggilan kedua menandai 0 baris dan TIDAK menggeser waktu baca " +
            "yang sudah tercatat. `unreadCount` pada jawabannya tidak dijamin nol — " +
            "notifikasi baru bisa lahir di antara penandaan dan penghitungan.",
          responses: {
            "200": jsonOk("Jumlah yang ditandai", notificationReadAllResponseSchema),
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

      // Sesi AI CV Builder (PR-065). Hanya BACA — sesi lahir dan bertambah lewat
      // `POST /ai/cv-chat` (SSE, PR-066), satu-satunya jalur yang juga memotong
      // kuota. Menyediakan jalur tulis kedua di sini berarti transkrip yang bisa
      // tumbuh tanpa satu pun panggilan AI yang tercatat.
      // Percakapan AI CV Builder (PR-066). Jawabannya `text/event-stream`;
      // bentuk data tiap event ditulis di kepala blok cv-chat `ai.ts`.
      "/ai/cv-chat/sessions": {
        post: {
          operationId: "startMyAiCvChat",
          tags: ["ai"],
          summary: "Mulai atau lanjutkan sesi AI CV Builder",
          description:
            "Mengembalikan SATU sesi aktif milik pemanggil. Sesi baru (201) sudah berisi " +
            "salam pembuka dari pewawancara — tanpa memanggil AI dan tanpa memotong kuota. " +
            "Sesi aktif yang sudah ada dikembalikan apa adanya (200). 503 bila fitur chat " +
            "sedang dimatikan: klien beralih ke formulir CV biasa.",
          responses: {
            "200": jsonOk("Sesi aktif yang sudah ada", aiCvChatSessionStartResponseSchema),
            "201": jsonOk("Sesi baru beserta salam pembuka", aiCvChatSessionStartResponseSchema),
            ...responsSesi,
            // Menimpa 503 `responsSesi` dengan sengaja: kunci sesi yang belum
            // diatur tetap salah satu sebabnya, tetapi di route ini ada sebab lain.
            "503": errorResponse(
              "Fitur chat AI sedang dimatikan, atau kunci sesi server belum diatur. Klien beralih ke formulir CV biasa",
            ),
          },
        },
      },
      "/ai/cv-chat": {
        post: {
          operationId: "sendAiCvChatMessage",
          tags: ["ai"],
          summary: "Kirim pesan dan terima jawaban pewawancara (SSE)",
          description:
            "Menjawab `text/event-stream`: event `giliran` (pesan pengguna tersimpan), " +
            "`token` (potongan jawaban), `giliran` (jawaban tersimpan), lalu `selesai`. " +
            "Kegagalan setelah aliran dibuka dikirim sebagai event `error` " +
            "(`AiCvChatErrorEvent`); `degraded: true` berarti klien beralih ke formulir. " +
            "Menghabiskan satu jatah `cv_chat`. Kegagalan sebelum aliran dibuka dijawab JSON biasa.",
          requestBody: jsonBody(aiCvChatRequestSchema),
          responses: {
            "200": {
              description: "Aliran SSE",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            "400": errorResponse("Input tidak valid"),
            "404": errorResponse("Sesi tidak ditemukan"),
            "409": errorResponse("Sesi sudah selesai, atau jawaban sebelumnya masih berjalan"),
            ...responsSesi,
            // Menimpa 503 `responsSesi` dengan sengaja: kunci sesi yang belum
            // diatur tetap salah satu sebabnya, tetapi di route ini ada sebab lain.
            "503": errorResponse(
              "Fitur chat AI dimatikan atau server sedang penuh, atau kunci sesi server belum diatur. Klien beralih ke formulir CV biasa",
            ),
          },
        },
      },
      "/ai/cv-chat/{session}/finalize": {
        post: {
          operationId: "finalizeMyAiCvChat",
          tags: ["ai"],
          summary: "Jadikan percakapan draft CV (asinkron)",
          description:
            "Memotong SATU jatah `cv_finalize` lalu mengantre ekstraksi di worker (202, " +
            "status `finalizing`). Hasilnya dibaca lewat `GET /ai/cv-chat/{session}` — `resumeId` " +
            "terisi saat `finalized`, atau `extractionFailedAt`/`extractionError` terisi dan sesi " +
            "kembali `active` bila ekstraksi gagal — serta notifikasi `resume.draft_ai_siap` / " +
            "`resume.draft_ai_gagal`. Finalize ganda aman: 202 lagi selama berjalan, 200 bila " +
            "sudah jadi, tanpa jatah tambahan. Draft TIDAK PERNAH tersimpan bila keluaran AI tidak " +
            "lolos kontrak isi CV.",
          requestParams: { path: aiChatSessionParamsSchema },
          responses: {
            "200": jsonOk("Draft sudah jadi sebelumnya", aiCvChatFinalizeResponseSchema),
            "202": jsonOk("Ekstraksi berjalan", aiCvChatFinalizeResponseSchema),
            "400": errorResponse("`session` bukan UUID"),
            "404": errorResponse("Sesi tidak ditemukan"),
            "409": errorResponse(
              "Jawaban masih mengalir, percakapan belum berisi jawaban, atau batas CV tercapai",
            ),
            "429": errorResponse("Jatah finalize hari ini habis (ber-degradasi: pakai formulir)"),
            ...responsSesi,
            "503": errorResponse(
              "Fitur chat AI dimatikan, antrean belum siap, atau kunci sesi server belum diatur",
            ),
          },
        },
      },
      "/ai/cv-chat/{session}/stream": {
        get: {
          operationId: "resumeAiCvChatStream",
          tags: ["ai"],
          summary: "Sambung ulang aliran jawaban (SSE)",
          description:
            "Dipakai setelah koneksi putus: kirim header `Last-Event-Id` berisi nomor event " +
            "terakhir yang diterima; event sesudahnya diputar ulang lalu aliran berlanjut. " +
            "404 bila tidak ada aliran untuk sesi ini (sudah lama selesai) — ambil " +
            "transkripnya lewat `GET /ai/cv-chat/{session}`, jawabannya sudah tersimpan di sana.",
          requestParams: { path: aiChatSessionParamsSchema },
          responses: {
            "200": {
              description: "Aliran SSE",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            "400": errorResponse("`session` bukan UUID"),
            "404": errorResponse("Tidak ada aliran untuk sesi ini"),
            ...responsSesi,
          },
        },
      },
      "/ai/cv-chat/{session}": {
        get: {
          operationId: "getMyAiChatSession",
          tags: ["ai"],
          summary: "Ambil sesi AI CV Builder sendiri",
          description:
            "Mengembalikan sesi beserta seluruh gilirannya, urut dan tanpa lubang — " +
            "dipakai klien untuk melanjutkan percakapan setelah koneksi putus. Sesi " +
            "milik pengguna lain berperilaku seperti sesi yang tidak ada: 404, bukan 403. " +
            "Sesi dihapus 30 hari setelah selesai atau setelah aktivitas terakhirnya.",
          requestParams: { path: aiChatSessionParamsSchema },
          responses: {
            "200": jsonOk("Sesi beserta transkripnya", aiChatSessionResponseSchema),
            "400": errorResponse("`session` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsSesi,
          },
        },
      },

      // Perusahaan (PR-051, PRD FR-6.1). Profil publik dilihat kandidat SEBELUM
      // melamar (US-09); keempat route `/admin/companies*` adalah endpoint
      // `role("admin")` PERTAMA di seluruh dokumen ini.
      "/companies/{id}": {
        get: {
          operationId: "getCompany",
          tags: ["companies"],
          summary: "Profil inklusivitas perusahaan (publik)",
          security: [], // eksplisit publik: kandidat menilai sebelum melamar, sering tanpa sesi
          description:
            "Profil publik satu perusahaan — akomodasi tersedia, status verifikasi, " +
            "tanpa field internal (`verifiedBy`). Tidak dibatasi status verifikasi: " +
            "perusahaan `unverified` tetap punya halaman publik (PR-054).",
          requestParams: { path: companyIdParamsSchema },
          responses: {
            "200": jsonOk("Profil perusahaan", companyPublicResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
          },
        },
      },
      "/companies/{id}/jobs": {
        get: {
          operationId: "getCompanyActiveJobs",
          tags: ["companies"],
          summary: "Lowongan aktif perusahaan (publik)",
          security: [], // sama sifatnya dengan GET /companies/{id} di atas
          description:
            "Ringkasan lowongan berstatus `published` dan belum lewat `expiresAt` " +
            "(atau tanpa tenggat) milik perusahaan ini, terbaru dulu (PR-054, Gap G5).",
          requestParams: { path: companyIdParamsSchema },
          responses: {
            "200": jsonOk("Lowongan aktif perusahaan", companyActiveJobsResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
          },
        },
      },
      "/admin/companies": {
        get: {
          operationId: "listCompaniesAdmin",
          tags: ["companies"],
          summary: "Daftar seluruh perusahaan (admin)",
          description:
            "Tanpa pagination dengan sengaja: skala pilot MVP (puluhan perusahaan, " +
            "bukan ribuan) tidak membutuhkannya.",
          responses: {
            "200": jsonOk("Daftar perusahaan", companyAdminListResponseSchema),
            ...responsAdmin,
          },
        },
        post: {
          operationId: "createCompanyAdmin",
          tags: ["companies"],
          summary: "Tambah perusahaan (admin)",
          description: "Status verifikasi lahir `unverified` — lihat POST .../verify.",
          requestBody: jsonBody(createCompanySchema),
          responses: {
            "201": jsonOk("Perusahaan yang baru dibuat", companyAdminResponseSchema),
            "400": errorResponse("Input tidak valid"),
            ...responsAdmin,
          },
        },
      },
      "/admin/companies/{id}": {
        put: {
          operationId: "updateCompanyAdmin",
          tags: ["companies"],
          summary: "Perbarui satu perusahaan (admin)",
          description:
            "Field yang tidak dikirim berarti tidak diubah. `inclusivityStatus` hanya " +
            "menerima `unverified`/`self_claimed` — koreksi turun dari `verified` " +
            "dimungkinkan di sini, tetapi naik ke `verified` HANYA lewat " +
            "POST .../verify (audit + event tersendiri).",
          requestParams: { path: companyIdParamsSchema },
          requestBody: jsonBody(updateCompanySchema),
          responses: {
            "200": jsonOk("Perusahaan setelah diperbarui", companyAdminResponseSchema),
            "400": errorResponse("Input tidak valid, atau `id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsAdmin,
          },
        },
      },
      "/admin/companies/{id}/verify": {
        post: {
          operationId: "verifyCompanyAdmin",
          tags: ["companies"],
          summary: "Verifikasi inklusivitas perusahaan (admin)",
          description:
            "Menandai perusahaan `verified`, mencatat siapa dan kapan (audit " +
            "`COMPANY_VERIFIED`), dan menerbitkan event domain `company.verified`. " +
            "Boleh dipanggil pada perusahaan yang sudah `verified` (re-verifikasi " +
            "setelah koreksi data) — idempoten pada hasil akhirnya.",
          requestParams: { path: companyIdParamsSchema },
          responses: {
            "200": jsonOk("Perusahaan setelah terverifikasi", companyAdminResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsAdmin,
          },
        },
      },

      // Lowongan (PR-055, PRD FR-4.1). `/jobs/{id}` publik SEPERTI
      // `/companies/{id}` — kandidat membaca detail sebelum melamar, sering
      // tanpa sesi. State machine draft→published→closed: `/admin/jobs/{id}
      // /publish` dan `/close` adalah SATU-SATUNYA jalan menulis `status`.
      //
      // `/jobs` (PR-056, ADR-018): pencarian FTS+trigram+filter ber-cursor —
      // jalur temu-lowongan non-AI kelas satu. Terdaftar SEBELUM `/jobs/{id}`
      // di dokumen ini (daftar sebelum detail); keduanya tidak bentrok di
      // Express karena jumlah segmen path berbeda.
      "/jobs": {
        get: {
          operationId: "searchJobs",
          tags: ["jobs"],
          summary: "Cari lowongan (publik)",
          security: [],
          description:
            "Pencarian FTS bahasa Indonesia + trigram (toleransi typo ringan) pada " +
            "judul/deskripsi, dengan filter kota/provinsi/mode kerja/akomodasi " +
            "(⊇ — lowongan harus punya SEMUA akomodasi yang diminta) dan cursor " +
            "pagination. Hanya lowongan `published` yang belum lewat `expiresAt`. " +
            "Terbaru dulu (`publishedAt` lalu `id` sebagai penengah, format cursor " +
            "sama dengan `GET /me/notifications`, lihat core/pagination).",
          requestParams: { query: jobSearchQuerySchema },
          responses: {
            "200": jsonOk("Halaman hasil pencarian", jobSearchResponseSchema),
            "400": errorResponse("`limit` di luar 1–100, atau cursor tidak terbaca"),
          },
        },
      },
      // Feed AI Job Matching (PR-073). Satu kontrak untuk mode normal & turun:
      // setiap item selalu berpenjelasan, `meta` selalu lengkap.
      "/me/matches": {
        get: {
          operationId: "listMyMatches",
          tags: ["matching"],
          summary: "Feed lowongan yang cocok (milik sendiri)",
          description:
            "Top-50 lowongan aktif yang lolos hard filter lokasi & akomodasi wajib, " +
            "diurutkan re-rank AI bila tersedia (selain itu menurut skor). Cache 24 jam: " +
            "permintaan tanpa cursor boleh menghitung ulang cache yang kedaluwarsa " +
            "(memakai 1 jatah `rerank` bila tersisa). `meta.degraded` = disajikan tanpa AI " +
            "(penjelasan template); `meta.aiMenyusun` = re-rank AI masih berjalan, muat " +
            "ulang sebentar lagi. Cursor mengikat feed yang sedang dibaca — feed yang sudah " +
            "diganti membuat cursor ditolak (400, muat ulang dari awal).",
          requestParams: { query: matchesQuerySchema },
          responses: {
            "200": jsonOk("Satu halaman feed", matchesResponseSchema),
            "400": errorResponse("`limit` di luar 1–50, atau cursor tidak berlaku lagi"),
            ...responsSesi,
          },
        },
      },
      "/me/matches/refresh": {
        post: {
          operationId: "refreshMyMatches",
          tags: ["matching"],
          summary: "Segarkan feed (berkuota)",
          description:
            "Hitung ulang feed dan antre re-rank AI, memakai 1 jatah `rerank` harian " +
            "(bawaan 3). Jatah habis → feed yang ada dikembalikan apa adanya dengan " +
            "`meta.sisaRefresh: 0` — bukan error. Mengembalikan halaman 1.",
          requestParams: { query: matchesRefreshQuerySchema },
          responses: {
            "200": jsonOk("Halaman 1 feed", matchesResponseSchema),
            "400": errorResponse("`limit` di luar 1–50"),
            ...responsSesi,
          },
        },
      },
      "/jobs/{id}": {
        get: {
          operationId: "getJob",
          tags: ["jobs"],
          summary: "Detail lowongan (publik)",
          security: [],
          description:
            "Hanya lowongan `published` yang belum lewat `expiresAt` — draft, " +
            "closed, dan yang sudah kedaluwarsa SEMUANYA 404, tanpa membedakan " +
            "sebabnya ke klien (PR-055).",
          requestParams: { path: jobIdParamsSchema },
          responses: {
            "200": jsonOk("Detail lowongan", jobPublicResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
          },
        },
      },
      // Melamar (PR-075, PRD US-11 / FR-5.1–5.2). Idempotensi dua lapis:
      // header `Idempotency-Key` (Redis 24 jam) + unique (user, job) di DB.
      "/jobs/{id}/apply": {
        post: {
          operationId: "applyJob",
          tags: ["applications"],
          summary: "Lamar lowongan (pencari kerja)",
          description:
            "`discloseDisability` WAJIB dinyatakan eksplisit. `true` menyimpan SALINAN " +
            "terenkripsi ragam disabilitas + akomodasi saat ini; `false` tidak menyimpan " +
            "apa pun yang sensitif. Kunci `Idempotency-Key` yang sama memutar ulang 201 " +
            "pertama dengan header `Idempotent-Replayed: true`.",
          requestParams: {
            path: jobIdParamsSchema,
            header: z.object({ "Idempotency-Key": idempotencyKeySchema }),
          },
          requestBody: jsonBody(applyJobSchema),
          responses: {
            "201": jsonOk("Lamaran terkirim (atau putar ulang)", applicationResponseSchema),
            "400": errorResponse("Input tidak valid, atau header Idempotency-Key tidak ada"),
            "403": errorResponse("Bukan akun pencari kerja"),
            "404": errorResponse("Lowongan atau CV tidak ditemukan"),
            "409": errorResponse("Sudah melamar lowongan ini, atau lamaran sedang dikirim"),
            "422": errorResponse(
              "Kunci dipakai untuk lowongan lain, atau tidak ada data disabilitas untuk dikirim",
            ),
            "429": errorResponse("Terlalu banyak lamaran — lihat header Retry-After"),
            ...responsSesi,
          },
        },
      },
      // Lamaran Saya (PR-076, PRD FR-5.3/FR-5.5). Seluruhnya milik pelamar
      // sendiri; lamaran orang lain berperilaku seperti lamaran yang tidak ada.
      "/me/applications": {
        get: {
          operationId: "listMyApplications",
          tags: ["applications"],
          summary: "Daftar lamaran sendiri",
          description:
            "Terbaru BERUBAH lebih dulu (`updatedAt`), cursor keyset. Ringkasan lowongan " +
            "dibaca saat ini — lowongan yang sudah ditutup tetap tampil dengan `aktif: false`.",
          requestParams: { query: myApplicationListQuerySchema },
          responses: {
            "200": jsonOk("Satu halaman lamaran", myApplicationListResponseSchema),
            "400": errorResponse("Query atau cursor tidak valid"),
            "403": errorResponse("Bukan akun pencari kerja"),
            ...responsSesi,
          },
        },
      },
      "/me/applications/{id}": {
        get: {
          operationId: "getMyApplication",
          tags: ["applications"],
          summary: "Detail lamaran + riwayat status",
          requestParams: { path: applicationIdParamsSchema },
          responses: {
            "200": jsonOk("Lamaran beserta riwayatnya", myApplicationDetailResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "403": errorResponse("Bukan akun pencari kerja"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsSesi,
          },
        },
      },
      "/me/applications/{id}/withdraw": {
        post: {
          operationId: "withdrawMyApplication",
          tags: ["applications"],
          summary: "Batalkan lamaran",
          description:
            "Hanya dari status aktif (submitted..offered). Pelamar tidak dikabari atas aksinya sendiri; admin dikabari.",
          requestParams: { path: applicationIdParamsSchema },
          responses: {
            "200": jsonOk("Lamaran terkini", myApplicationDetailResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "403": errorResponse("Bukan akun pencari kerja"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("Status sekarang tidak bisa dibatalkan, atau berubah bersamaan"),
            ...responsSesi,
          },
        },
      },
      "/me/applications/{id}/confirm-hired": {
        post: {
          operationId: "confirmHiredMyApplication",
          tags: ["applications"],
          summary: "Konfirmasi diterima kerja (North Star)",
          description:
            "Dari `offered`: status pindah ke `hired` + `hiredConfirmedAt`. Dari `hired`: hanya " +
            "`hiredConfirmedAt`. Idempoten — panggilan ulang menjawab 200 yang sama tanpa event kedua.",
          requestParams: { path: applicationIdParamsSchema },
          responses: {
            "200": jsonOk("Lamaran terkini", myApplicationDetailResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "403": errorResponse("Bukan akun pencari kerja"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("Lamaran belum ditawari / sudah berakhir"),
            ...responsSesi,
          },
        },
      },
      // Operasional lamaran oleh admin (PR-077a). Data disabilitas TIDAK PERNAH
      // ikut di daftar/detail — dibuka lewat POST .../disclosure dengan alasan.
      "/admin/users": {
        get: {
          operationId: "listUsersAdmin",
          tags: ["admin"],
          summary: "Daftar akun (admin, moderasi)",
          description:
            "Cari nama/nomor/email, saring status aktif/ditangguhkan, cursor 50. Kontak ikut; " +
            "tidak ada data disabilitas.",
          requestParams: { query: adminUserListQuerySchema },
          responses: {
            "200": jsonOk("Satu halaman akun", adminUserListResponseSchema),
            "400": errorResponse("Query atau cursor tidak valid"),
            ...responsAdmin,
          },
        },
      },
      "/admin/users/{id}/suspend": {
        post: {
          operationId: "suspendUserAdmin",
          tags: ["admin"],
          summary: "Tangguhkan akun pencari kerja",
          description:
            "Alasan wajib (audit, tidak ditampilkan ke pengguna). Semua sesi dicabut; login & " +
            "refresh berikutnya menjawab 403 AKUN_DITANGGUHKAN. Data tidak dihapus.",
          requestParams: { path: adminUserIdParamsSchema },
          requestBody: jsonBody(moderateUserSchema),
          responses: {
            "200": jsonOk("Akun terkini", adminUserResponseSchema),
            "400": errorResponse("Alasan kosong / id tidak valid"),
            "404": errorResponse("Akun tidak ditemukan"),
            "409": errorResponse("Sudah ditangguhkan"),
            "422": errorResponse("Bukan akun pencari kerja / diri sendiri"),
            ...responsAdmin,
          },
        },
      },
      "/admin/users/{id}/unsuspend": {
        post: {
          operationId: "unsuspendUserAdmin",
          tags: ["admin"],
          summary: "Pulihkan akun yang ditangguhkan",
          description:
            "Alasan wajib (audit). Akses pulih; sesi lama TIDAK hidup lagi — masuk ulang.",
          requestParams: { path: adminUserIdParamsSchema },
          requestBody: jsonBody(moderateUserSchema),
          responses: {
            "200": jsonOk("Akun terkini", adminUserResponseSchema),
            "400": errorResponse("Alasan kosong / id tidak valid"),
            "404": errorResponse("Akun tidak ditemukan"),
            "409": errorResponse("Akun tidak sedang ditangguhkan"),
            ...responsAdmin,
          },
        },
      },
      // Kamus video BISINDO (PR-084, SignBridge v1, ADR-010). Pencarian publik;
      // mutasi admin. Publish menuntut video + caption (.vtt) + transkrip.
      "/sign-videos": {
        get: {
          operationId: "searchSignVideos",
          tags: ["signbridge"],
          summary: "Cari kamus video BISINDO (publik)",
          security: [], // kamus terbuka bagi siapa pun, termasuk sebelum mendaftar
          description:
            "Hanya entri `published`. `query` dicari lewat full-text bahasa Indonesia " +
            "ditambah kecocokan sebagian frasa; tanpa `query` diurutkan menurut frasa. " +
            "URL media presigned dan kedaluwarsa pada `mediaExpiresAt`.",
          requestParams: { query: signVideoSearchQuerySchema },
          responses: {
            "200": jsonOk("Entri kamus", signVideoSearchResponseSchema),
            "400": errorResponse("Query tidak valid (mis. kategori tidak dikenal)"),
            "503": errorResponse("Object storage belum diatur"),
          },
        },
      },
      "/admin/sign-videos": {
        get: {
          operationId: "listSignVideosAdmin",
          tags: ["signbridge"],
          summary: "Daftar seluruh entri kamus (admin)",
          description: "Draft dan published, terbaru dulu. Tanpa pagination (skala pilot).",
          responses: {
            "200": jsonOk("Daftar entri", signVideoAdminListResponseSchema),
            ...responsAdmin,
          },
        },
        post: {
          operationId: "createSignVideoAdmin",
          tags: ["signbridge"],
          summary: "Tambah entri kamus (admin)",
          description: "Selalu lahir `draft`. Key media diisi lewat PUT setelah unggah.",
          requestBody: jsonBody(createSignVideoSchema),
          responses: {
            "201": jsonOk("Entri baru", signVideoAdminResponseSchema),
            "400": errorResponse("Input tidak valid"),
            ...responsAdmin,
          },
        },
      },
      "/admin/sign-videos/{id}": {
        put: {
          operationId: "updateSignVideoAdmin",
          tags: ["signbridge"],
          summary: "Perbarui entri kamus (admin)",
          description:
            "Field yang tidak dikirim tidak diubah; `null` mengosongkan. Key media wajib " +
            "berbentuk `sign-videos/{id}/{berkas}` dengan ekstensi sesuai jenisnya. Pada entri " +
            "`published`, mengosongkan video/caption/transkrip ditolak 422.",
          requestParams: { path: signVideoIdParamsSchema },
          requestBody: jsonBody(updateSignVideoSchema),
          responses: {
            "200": jsonOk("Entri setelah diperbarui", signVideoAdminResponseSchema),
            "400": errorResponse("Input tidak valid, atau `id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            "422": errorResponse("Key media tidak valid, atau entri terbit menjadi tidak lengkap"),
            ...responsAdmin,
          },
        },
      },
      "/admin/sign-videos/{id}/publish": {
        post: {
          operationId: "publishSignVideoAdmin",
          tags: ["signbridge"],
          summary: "Terbitkan entri kamus (admin)",
          description:
            "draft → published (satu arah, audit `ADMIN_RESOURCE_CHANGED`). Ditolak 422 bila " +
            "video, caption (.vtt), atau transkrip belum ada — `hint` menyebut yang kurang.",
          requestParams: { path: signVideoIdParamsSchema },
          responses: {
            "200": jsonOk("Entri setelah terbit", signVideoAdminResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("Sudah diterbitkan"),
            "422": errorResponse("Video, caption, atau transkrip belum ada"),
            ...responsAdmin,
          },
        },
      },
      "/admin/metrics": {
        get: {
          operationId: "getAdminMetrics",
          tags: ["admin"],
          summary: "Metrik pilot (admin)",
          description:
            "Funnel kohort per pengguna (daftar → profil siap → melamar → wawancara → diterima), " +
            "North Star (`hired_confirmed_at`), pemakaian AI per fitur, total DLQ. Agregat saja; " +
            "tidak ada kolom terenkripsi yang dibaca. Cache 5 menit per periode.",
          requestParams: { query: adminMetricsQuerySchema },
          responses: {
            "200": jsonOk("Metrik agregat", adminMetricsResponseSchema),
            "400": errorResponse("Periode tidak dikenal"),
            ...responsAdmin,
          },
        },
      },
      "/admin/applications": {
        get: {
          operationId: "listApplicationsAdmin",
          tags: ["applications"],
          summary: "Daftar lamaran (admin)",
          description:
            "Filter `job_id` dan `status`, cursor keyset, 50 per halaman. Pelamar hanya " +
            "nama; `discloseDisability` hanya penanda.",
          requestParams: { query: adminApplicationListQuerySchema },
          responses: {
            "200": jsonOk("Satu halaman lamaran", adminApplicationListResponseSchema),
            "400": errorResponse("Query atau cursor tidak valid"),
            ...responsAdmin,
          },
        },
      },
      "/admin/applications/{id}": {
        get: {
          operationId: "getApplicationAdmin",
          tags: ["applications"],
          summary: "Detail lamaran (admin)",
          description: "Kontak pelamar, CV terlampir, dan riwayat status — tanpa data disabilitas.",
          requestParams: { path: applicationIdParamsSchema },
          responses: {
            "200": jsonOk("Detail lamaran", adminApplicationDetailResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsAdmin,
          },
        },
      },
      "/admin/applications/{id}/status": {
        put: {
          operationId: "updateApplicationStatusAdmin",
          tags: ["applications"],
          summary: "Ubah status lamaran (admin)",
          description:
            "Maju boleh loncat; mundur, status akhir, dan `withdrawn` ditolak 409. " +
            "`reason` wajib — masuk audit, tidak terlihat pelamar. Pelamar dikabari.",
          requestParams: { path: applicationIdParamsSchema },
          requestBody: jsonBody(updateApplicationStatusSchema),
          responses: {
            "200": jsonOk("Lamaran terkini", adminApplicationDetailResponseSchema),
            "400": errorResponse("Input tidak valid"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("Transisi tidak sah, atau status berubah bersamaan"),
            ...responsAdmin,
          },
        },
      },
      "/admin/applications/{id}/disclosure": {
        post: {
          operationId: "revealApplicationDisclosureAdmin",
          tags: ["applications"],
          summary: "Buka data yang diungkap pelamar (admin, ber-audit)",
          description:
            "Hanya untuk lamaran ber-`discloseDisability`. Jejak audit ditulis SEBELUM " +
            "data dibaca, termasuk saat ditolak. Respons `Cache-Control: no-store`.",
          requestParams: { path: applicationIdParamsSchema },
          requestBody: jsonBody(revealDisclosureSchema),
          responses: {
            "200": jsonOk("Salinan yang diungkap", disclosureSnapshotResponseSchema),
            "400": errorResponse("Alasan kosong atau terlalu panjang"),
            "404": errorResponse("Tidak ditemukan, atau pelamar tidak mengungkap"),
            ...responsAdmin,
          },
        },
      },
      "/admin/jobs": {
        get: {
          operationId: "listJobsAdmin",
          tags: ["jobs"],
          summary: "Daftar seluruh lowongan (admin)",
          description: "Tanpa pagination dengan sengaja — pola sama `GET /admin/companies`.",
          responses: {
            "200": jsonOk("Daftar lowongan", jobAdminListResponseSchema),
            ...responsAdmin,
          },
        },
        post: {
          operationId: "createJobAdmin",
          tags: ["jobs"],
          summary: "Tambah lowongan (admin)",
          description:
            "Lahir selalu `draft` + `admin_curated`. Akomodasi boleh kosong saat " +
            "draft — baru wajib terisi sebelum POST .../publish.",
          requestBody: jsonBody(createJobSchema),
          responses: {
            "201": jsonOk("Lowongan yang baru dibuat", jobAdminResponseSchema),
            "400": errorResponse("Input tidak valid"),
            "404": errorResponse("`companyId` tidak menunjuk perusahaan yang ada"),
            ...responsAdmin,
          },
        },
      },
      "/admin/jobs/{id}": {
        put: {
          operationId: "updateJobAdmin",
          tags: ["jobs"],
          summary: "Perbarui satu lowongan (admin)",
          description:
            "Field yang tidak dikirim berarti tidak diubah. TIDAK bisa mengubah " +
            "`status` — satu-satunya jalan ke sana adalah POST .../publish dan " +
            "POST .../close.",
          requestParams: { path: jobIdParamsSchema },
          requestBody: jsonBody(updateJobSchema),
          responses: {
            "200": jsonOk("Lowongan setelah diperbarui", jobAdminResponseSchema),
            "400": errorResponse("Input tidak valid, atau `id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsAdmin,
          },
        },
        delete: {
          operationId: "deleteJobAdmin",
          tags: ["jobs"],
          summary: "Hapus satu lowongan (admin)",
          description:
            "Lowongan yang sudah berlamaran DITOLAK (409) — FK Restrict di database " +
            "(SDD §6.1) menjaga riwayat lamaran tetap utuh. `close` adalah jalur " +
            "resmi menyingkirkan lowongan yang sudah berlamaran, bukan delete.",
          requestParams: { path: jobIdParamsSchema },
          responses: {
            "204": { description: "Terhapus — tanpa badan jawaban" },
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("Lowongan ini sudah berlamaran"),
            ...responsAdmin,
          },
        },
      },
      "/admin/jobs/{id}/publish": {
        post: {
          operationId: "publishJobAdmin",
          tags: ["jobs"],
          summary: "Terbitkan lowongan (admin)",
          description:
            "Satu-satunya jalan menuju `status: published`. Menolak selain dari " +
            "`draft` (409) dan menolak lowongan tanpa satu pun akomodasi (422) — " +
            "menerbitkan event domain `job.published`.",
          requestParams: { path: jobIdParamsSchema },
          responses: {
            "200": jsonOk("Lowongan setelah diterbitkan", jobAdminResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("Lowongan tidak dalam status `draft`"),
            "422": errorResponse("Lowongan belum mencantumkan akomodasi apa pun"),
            ...responsAdmin,
          },
        },
      },
      "/admin/jobs/{id}/close": {
        post: {
          operationId: "closeJobAdmin",
          tags: ["jobs"],
          summary: "Tutup lowongan (admin)",
          description:
            "Satu-satunya jalan admin menuju `status: closed`. Menolak selain dari " +
            "`published` (409) — menerbitkan event domain `job.closed` dengan " +
            "`reason: closed_by_admin` (dibedakan dari penutupan otomatis PR-024b).",
          requestParams: { path: jobIdParamsSchema },
          responses: {
            "200": jsonOk("Lowongan setelah ditutup", jobAdminResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("Lowongan tidak dalam status `published`"),
            ...responsAdmin,
          },
        },
      },

      // --- CV terstruktur (PR-060) ---
      //
      // DITARUH DI AKHIR DENGAN SENGAJA, bukan dikelompokkan dekat `/me/*` yang
      // lain. Urutan path di dokumen mengikuti urutan deklarasi di berkas ini
      // (lihat kepala berkas: "deterministik by design"), jadi menyisipkan blok
      // baru di tengah menggeser posisi SETIAP kunci sesudahnya di
      // `openapi.json` — dan `git diff` menampilkannya sebagai ribuan baris
      // berubah untuk lima endpoint yang ditambahkan. Diff sebesar itu bukan
      // sekadar berisik: ia membuat review terhadap perubahan kontrak API
      // menjadi tidak mungkin dilakukan dengan mata. Endpoint berikutnya
      // menyusul di bawah ini, dengan alasan yang sama.
      // CV terstruktur jalur manual (PR-060, PRD US-05). Seluruhnya milik
      // pemanggil sendiri; CV orang lain berperilaku seperti CV yang tidak ada.
      "/me/resumes": {
        get: {
          operationId: "listMyResumes",
          tags: ["resumes"],
          summary: "Daftar CV sendiri",
          description:
            "Mengembalikan RINGKASAN seluruh CV milik pengguna yang sedang masuk — tanpa " +
            "isinya. Daftar dipakai untuk memilih, bukan untuk membaca; isi satu CV diambil " +
            "lewat GET /me/resumes/{id}. Tanpa pagination dengan sengaja: jumlahnya dibatasi " +
            "RESUME_MAX_PER_USER (bawaan 5).",
          responses: {
            "200": jsonOk("Ringkasan CV milik sendiri", resumeListResponseSchema),
            ...responsSesi,
          },
        },
        post: {
          operationId: "createResume",
          tags: ["resumes"],
          summary: "Buat CV baru",
          description:
            "CV yang lahir dari endpoint ini SELALU `created_via: manual` — nilainya " +
            "ditentukan jalur yang dipakai, bukan diakui klien. `content` boleh dikosongkan; " +
            "CV lahir kosong lalu diisi bagian demi bagian.",
          requestBody: jsonBody(createResumeSchema),
          responses: {
            "201": jsonOk("CV yang baru dibuat", resumeResponseSchema),
            "400": errorResponse("Input tidak valid"),
            "409": errorResponse("Jumlah CV sudah mencapai batas"),
            ...responsSesi,
          },
        },
      },
      "/me/resumes/{id}": {
        get: {
          operationId: "getResume",
          tags: ["resumes"],
          summary: "Ambil satu CV beserta isinya",
          requestParams: { path: resumeIdParamsSchema },
          responses: {
            "200": jsonOk("CV beserta isinya", resumeResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsSesi,
          },
        },
        put: {
          operationId: "updateResume",
          tags: ["resumes"],
          summary: "Perbarui satu CV",
          description:
            "Field yang tidak dikirim berarti tidak diubah. `content` DIGANTI UTUH bila " +
            "disebut, tidak digabung per bagian — lihat alasannya di updateResumeSchema. " +
            "CV milik pengguna lain berperilaku seperti CV yang tidak ada: 404, bukan 403.",
          requestParams: { path: resumeIdParamsSchema },
          requestBody: jsonBody(updateResumeSchema),
          responses: {
            "200": jsonOk("CV setelah diperbarui", resumeResponseSchema),
            "400": errorResponse("Input tidak valid, atau `id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsSesi,
          },
        },
        delete: {
          operationId: "deleteResume",
          tags: ["resumes"],
          summary: "Hapus satu CV",
          description:
            "CV yang sedang menjadi lampiran sebuah lamaran TIDAK bisa dihapus (409) — " +
            "penolakannya datang dari foreign key di database, bukan dari aturan yang " +
            "dikarang lapisan aplikasi.",
          requestParams: { path: resumeIdParamsSchema },
          responses: {
            "204": { description: "Terhapus — tanpa badan jawaban" },
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            "409": errorResponse("CV masih dipakai sebuah lamaran"),
            ...responsSesi,
          },
        },
      },
      "/me/resumes/{id}/pdf": {
        get: {
          operationId: "getResumePdfStatus",
          tags: ["resumes"],
          summary: "Ambil status PDF CV",
          description:
            "Mengembalikan status render terbaru. Saat `ready`, URL unduhan bertanda tangan " +
            "diberikan dengan masa berlaku singkat; klien harus meminta status lagi tepat " +
            "sebelum mengunduh agar URL kedaluwarsa diperbarui tanpa interaksi tambahan.",
          requestParams: { path: resumeIdParamsSchema },
          responses: {
            "200": jsonOk("Status render PDF CV", resumePdfResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsSesi,
            "503": errorResponse("Sesi atau layanan PDF belum dikonfigurasi"),
          },
        },
        post: {
          operationId: "requestResumePdf",
          tags: ["resumes"],
          summary: "Siapkan PDF CV",
          description:
            "Menjadwalkan render PDF dari revisi CV terkini. Operasi idempoten: permintaan " +
            "berulang untuk konten yang sama memakai job deterministik yang sama. Status gagal " +
            "boleh diminta ulang untuk mencoba render kembali.",
          requestParams: { path: resumeIdParamsSchema },
          responses: {
            "202": jsonOk("Permintaan diterima dan status render terkini", resumePdfResponseSchema),
            "400": errorResponse("`id` bukan UUID"),
            "404": errorResponse("Tidak ditemukan"),
            ...responsSesi,
            "503": errorResponse("Sesi atau layanan PDF belum dikonfigurasi"),
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
