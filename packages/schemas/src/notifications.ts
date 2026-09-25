// Domain: notifications — katalog tipe + kontrak HTTP in-app (PR-047, PRD FR-5.4).
//
// KATALOG TIPE TERPUSAT, DAN INI MITIGASI RISIKO YANG DITULIS DI DOKUMEN PHASE
// ("ledakan tipe notifikasi"). Sebuah tipe notifikasi baru tidak bisa lahir
// diam-diam di dalam satu service: ia harus muncul di `notificationTypeSchema`
// di bawah, membawa skema parameternya di `NOTIFICATION_PARAM_SCHEMAS`, dan
// membawa kedua varian bahasanya di katalog template (apps/api). Ketiganya
// diikat tipe, jadi menambah satu tanpa dua lainnya adalah `typecheck` merah —
// bukan review yang kebetulan teliti.
//
// KENAPA PARAMETER, BUKAN TEKS JADI, YANG DISIMPAN. Baris `notifications`
// menyimpan `type` + `payload`; kalimatnya dirakit saat dibaca. Menyimpan teks
// jadi berarti perbaikan kalimat hanya berlaku bagi notifikasi yang lahir
// SESUDAHNYA, dan riwayat pengguna terus membacakan kalimat lama yang sudah
// diketahui buruk oleh screen reader-nya.
import "zod-openapi/extend";
import { z } from "zod";
import { applicationStatusSchema } from "./applications.js";
import { idSchema, paginationQuerySchema, timestampSchema } from "./common.js";

/**
 * Dua varian bahasa — cerminan `MODE_BAHASA` di apps/web (SDD §4.3).
 *
 * `id-simple` BUKAN terjemahan melainkan versi yang lebih mudah dipahami dari
 * kalimat yang sama (docs/panduan-bahasa-sederhana.md). Keduanya dikirim
 * SEKALIGUS pada setiap notifikasi, bukan dipilih server dari header: mode teks
 * sederhana adalah state global klien (ADR-008) yang bisa dinyalakan kapan saja,
 * dan pengguna yang menyalakannya harus melihat daftar yang sudah terbuka ikut
 * berubah seketika — bukan setelah memuat ulang.
 */
export const notificationTextSchema = z
  .object({
    id: z.string().min(1),
    "id-simple": z.string().min(1),
  })
  .openapi({
    ref: "NotificationText",
    description: "Satu kalimat notifikasi dalam kedua varian bahasa",
  });

export type NotificationText = z.infer<typeof notificationTextSchema>;

/**
 * KATALOG TIPE NOTIFIKASI. Satu-satunya daftar yang sah.
 *
 * Penamaan `<domain>.<peristiwa>` mengikuti nama event yang melahirkannya, bukan
 * nama layar yang menampilkannya: layar berganti, peristiwa tidak.
 *
 * NILAINYA DIBERI NAMA (`NOTIFICATION_TYPE`), mengikuti `QUEUE_NAME` dan
 * `AUDIT_ACTION`. Dua alasan, dan yang kedua tidak terduga:
 *
 *   1. Salah ketik `"lamaran.status_berubah"` menjadi galat `typecheck` di
 *      tempat pemakaian, bukan cabang yang diam-diam tidak pernah cocok.
 *   2. Prefiks `auth.` di sini BENTROK dengan nama katalog i18n `auth` di
 *      apps/web. Penjaga `i18n-lazy.test.ts` memindai literal berpola
 *      `"<prefiks>."` untuk menentukan katalog yang wajib dimuat sebuah rute,
 *      dan tidak punya cara membedakan tipe notifikasi dari kunci teks —
 *      halaman notification center karena itu dipaksa memuat katalog `auth`
 *      yang tidak pernah ia sentuh. Konstanta bernama menghapus literalnya dari
 *      kode klien tanpa melonggarkan penjaganya.
 */
export const NOTIFICATION_TYPE = {
  /** Akun baru dibuat — sapaan pertama, sekaligus arah langkah berikutnya. */
  AUTH_SELAMAT_DATANG: "auth.selamat_datang",
  /** Lamaran terkirim — bukti terima yang bisa dibaca ulang. */
  LAMARAN_TERKIRIM: "lamaran.terkirim",
  /** Status lamaran berpindah tahap. */
  LAMARAN_STATUS_BERUBAH: "lamaran.status_berubah",
  /** PDF untuk satu versi CV selesai dibuat. */
  RESUME_PDF_SIAP: "resume.pdf_siap",
} as const;

export const notificationTypeSchema = z
  .enum([
    NOTIFICATION_TYPE.AUTH_SELAMAT_DATANG,
    NOTIFICATION_TYPE.LAMARAN_TERKIRIM,
    NOTIFICATION_TYPE.LAMARAN_STATUS_BERUBAH,
    NOTIFICATION_TYPE.RESUME_PDF_SIAP,
  ])
  .openapi({ ref: "NotificationType", description: "Tipe notifikasi terdaftar" });

export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * Parameter per tipe — isi kolom `payload`.
 *
 * ATURAN YANG MENGIKAT SELURUH PETA INI: hanya REFERENSI (id) dan nilai enum.
 * Tidak ada nama, alamat, nomor, ragam disabilitas, kebutuhan akomodasi, atau
 * kutipan teks bebas milik siapa pun. Dua alasan yang keduanya nyata:
 *
 *   1. `notifications.payload` tidak terenkripsi (ADR-007 hanya menjangkau kolom
 *      yang ditandai), jadi apa pun yang sensitif di sini adalah data sensitif
 *      yang tersimpan polos.
 *   2. Payload adalah SALINAN. Judul lowongan yang disalin ke sini akan tetap
 *      berbunyi lama setelah lowongannya diperbaiki, dan tidak ada yang akan
 *      memperbaruinya.
 *
 * Akibatnya kalimat notifikasi tidak menyebut judul lowongan. Notification
 * center (PR-050) yang memerlukannya membacanya lewat `applicationId`.
 */
export const NOTIFICATION_PARAM_SCHEMAS = {
  "auth.selamat_datang": z.object({}).strict(),
  "lamaran.terkirim": z.object({ applicationId: idSchema, jobId: idSchema }).strict(),
  "lamaran.status_berubah": z
    .object({
      applicationId: idSchema,
      jobId: idSchema,
      status: applicationStatusSchema,
    })
    .strict(),
  "resume.pdf_siap": z.object({ resumeId: idSchema }).strict(),
} as const satisfies Record<NotificationType, z.ZodTypeAny>;

/** Parameter satu tipe, tertipe sempit — `NotificationParams<"lamaran.terkirim">`. */
export type NotificationParams<T extends NotificationType> = z.infer<
  (typeof NOTIFICATION_PARAM_SCHEMAS)[T]
>;

/** Gabungan seluruh bentuk parameter — dipakai saat tipenya belum dipersempit. */
export type NotificationParamsAny = {
  [T in NotificationType]: NotificationParams<T>;
}[NotificationType];

/**
 * Satu notifikasi sebagaimana dibaca klien.
 *
 * `params` ikut dikirim MESKI kalimatnya sudah jadi: notification center perlu
 * `applicationId` untuk membuat tautan "lihat lamaran", dan menaruh id di dalam
 * kalimat agar klien mengurainya kembali adalah cara termahal mengirim sebuah id.
 */
export const notificationSchema = z
  .object({
    id: idSchema,
    type: notificationTypeSchema,
    title: notificationTextSchema,
    body: notificationTextSchema,
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).openapi({
      description: "Referensi untuk tautan klien (id/enum saja, tanpa data pribadi)",
    }),
    /** null = belum dibaca. */
    readAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
  })
  .openapi({ ref: "Notification", description: "Notifikasi in-app" });

export type Notification = z.infer<typeof notificationSchema>;

/**
 * GET /api/v1/me/notifications — query.
 *
 * `unreadOnly` ada sejak awal, bukan menyusul: tanpa itu klien yang hanya ingin
 * lencana belum-dibaca harus mengambil seluruh halaman lalu menyaring sendiri,
 * dan penyaringan di klien tidak bisa memakai indeks parsial yang sudah ada di
 * DB sejak migrasi 03.
 */
export const notificationListQuerySchema = paginationQuerySchema
  .extend({
    unreadOnly: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true")
      .openapi({ description: "true = hanya yang belum dibaca", example: "true" }),
  })
  .openapi({ ref: "NotificationListQuery" });

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

/**
 * Meta daftar notifikasi.
 *
 * `unreadCount` SELALU jumlah seluruh yang belum dibaca — tidak terpengaruh
 * `unreadOnly`, `limit`, maupun halaman yang sedang dibuka. Ia lencana, dan
 * lencana yang berubah angka saat pengguna menggulir adalah lencana yang salah.
 */
export const notificationListMetaSchema = z
  .object({
    nextCursor: z.string().nullable().openapi({
      description: "Cursor halaman berikut; null bila halaman terakhir",
    }),
    unreadCount: z.number().int().min(0).openapi({
      description: "Jumlah seluruh notifikasi yang belum dibaca",
      example: 3,
    }),
  })
  .openapi({ ref: "NotificationListMeta" });

export type NotificationListMeta = z.infer<typeof notificationListMetaSchema>;

export const notificationListResponseSchema = z
  .object({
    data: z.array(notificationSchema),
    meta: notificationListMetaSchema,
  })
  .openapi({ ref: "NotificationListResponse" });

export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

/** Params `POST /me/notifications/:id/read`. */
export const notificationIdParamsSchema = z
  .object({ id: idSchema })
  .openapi({ ref: "NotificationIdParams" });

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;

/**
 * Jawaban tandai-dibaca.
 *
 * Mengembalikan notifikasi yang bersangkutan BESERTA `unreadCount` terbaru:
 * klien yang menandai satu item lalu harus memanggil daftar ulang hanya untuk
 * memperbarui lencana membayar dua permintaan untuk satu tindakan.
 */
export const notificationReadResponseSchema = z
  .object({
    data: notificationSchema,
    meta: z.object({
      unreadCount: z.number().int().min(0),
    }),
  })
  .openapi({ ref: "NotificationReadResponse" });

export type NotificationReadResponse = z.infer<typeof notificationReadResponseSchema>;

/**
 * Jawaban tandai-SEMUA-dibaca (PR-050).
 *
 * `ditandai` ADA meski klien bisa hidup tanpanya: ia satu-satunya cara pengguna
 * tahu berapa banyak yang barusan berubah, dan "0" adalah jawaban yang berguna —
 * ia berarti tidak ada yang belum dibaca, bukan bahwa permintaannya gagal.
 *
 * `unreadCount` TIDAK dijamin nol. Notifikasi baru bisa lahir di antara UPDATE
 * dan hitungan ini; lencana yang dipaksa nol akan menyembunyikannya sampai muat
 * ulang berikutnya.
 */
export const notificationReadAllResponseSchema = z
  .object({
    data: z.object({
      ditandai: z.number().int().min(0).openapi({
        description: "Jumlah notifikasi yang baru saja berpindah menjadi terbaca",
        example: 3,
      }),
    }),
    meta: z.object({
      unreadCount: z.number().int().min(0),
    }),
  })
  .openapi({ ref: "NotificationReadAllResponse" });

export type NotificationReadAllResponse = z.infer<typeof notificationReadAllResponseSchema>;

// --- Perangkat penerima push (PR-048a) ---------------------------------------
//
// Ditaruh di domain `notifications`, bukan berkas sendiri: perangkat hanya ada
// untuk menerima notifikasi, dan memisahkannya akan membuat dua berkas yang
// selalu berubah bersama.

/** Cerminan enum `DevicePlatform` di schema.prisma; dijaga test kesepadanan. */
export const devicePlatformSchema = z
  .enum(["android", "ios", "web"])
  .openapi({ ref: "DevicePlatform", description: "Platform perangkat penerima push" });

export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

/**
 * POST /api/v1/me/devices — body.
 *
 * `fcmToken` dibatasi 4096 karakter: token FCM nyata ~150–200 karakter, dan
 * batas yang jauh di atasnya tetap menutup jalur menjejali kolom TEXT tanpa
 * batas lewat endpoint yang bisa dipanggil siapa pun yang punya sesi.
 *
 * TIDAK ada `userId` di sini, dan itu keputusan yang sama dengan seluruh
 * endpoint `/me/*`: pemiliknya datang dari sesi. Mendaftarkan perangkat untuk
 * orang lain bukan operasi yang perlu ditolak — ia operasi yang tidak punya
 * saluran masuk.
 */
export const registerDeviceSchema = z
  .object({
    fcmToken: z
      .string()
      .trim()
      .min(1, { message: "Token perangkat tidak boleh kosong" })
      .max(4096, { message: "Token perangkat terlalu panjang" })
      .openapi({ description: "Token registrasi FCM dari klien" }),
    platform: devicePlatformSchema,
  })
  .strict()
  .openapi({ ref: "RegisterDevice" });

export type RegisterDevice = z.infer<typeof registerDeviceSchema>;

/**
 * Perangkat sebagaimana dijawab API.
 *
 * `fcmToken` SENGAJA TIDAK ikut. Klien sudah memilikinya — ia yang mengirimnya —
 * jadi mengembalikannya tidak menambah apa pun, sementara setiap tempat baru
 * yang memuatnya adalah tempat baru ia bisa bocor: log proxy, cache klien,
 * laporan galat yang menyertakan body response.
 */
export const deviceSchema = z
  .object({
    id: idSchema,
    platform: devicePlatformSchema,
    lastSeenAt: timestampSchema,
    createdAt: timestampSchema,
  })
  .openapi({ ref: "Device", description: "Perangkat terdaftar penerima push" });

export type Device = z.infer<typeof deviceSchema>;

export const deviceResponseSchema = z
  .object({ data: deviceSchema })
  .openapi({ ref: "DeviceResponse" });

export type DeviceResponse = z.infer<typeof deviceResponseSchema>;

// --- Preferensi kanal (PR-049b) -----------------------------------------------
//
// TIGA KANAL, HANYA DUA YANG BISA DIATUR. In-app tidak muncul di sini dengan
// sengaja: ia bukan kanal yang dikirimi, melainkan barisnya sendiri — mematikan
// "in-app" berarti tidak menulis notifikasi sama sekali, dan pengguna kehilangan
// riwayat yang bisa ia baca ulang. Yang bisa dimatikan hanyalah yang MENGEJAR
// pengguna keluar dari aplikasi.

/**
 * Preferensi kanal sebagaimana TERSIMPAN. `null` = **belum pernah memilih**, dan
 * itu berbeda dari "memilih nilai bawaan" — alasan yang sama persis dengan
 * `accessibilityProfileSchema` (PR-036R): bawaan yang dituliskan ke baris
 * membuat perubahan kebijakan bawaan di kemudian hari tidak pernah menjangkau
 * siapa pun yang tidak pernah memilih apa-apa.
 */
export const notificationChannelPrefsSchema = z
  .object({
    /**
     * Email. Bawaannya MATI (opt-in) — mengirimi orang email yang tidak pernah
     * ia minta adalah cara tercepat membuat seluruh kanal ini masuk folder spam,
     * termasuk kabar yang benar-benar ia butuhkan.
     */
    email: z.boolean().nullable(),
    /**
     * Push. Bawaannya HIDUP (opt-out) — pengguna sudah menyatakan persetujuannya
     * di tingkat sistem operasi saat mendaftarkan perangkat, jadi meminta
     * persetujuan kedua di sini hanya membuat kabar tidak sampai kepada orang
     * yang sudah bilang ya.
     */
    push: z.boolean().nullable(),
  })
  .openapi({ ref: "NotificationChannelPrefs", description: "Preferensi kanal notifikasi" });

export type NotificationChannelPrefs = z.infer<typeof notificationChannelPrefsSchema>;

/**
 * Bawaan tiap kanal — dipakai server DAN klien.
 *
 * Hidup di `packages/schemas`, bukan sebagai `@default` kolom: lihat alasannya
 * di skema di atas dan di migrasi 15.
 */
export const NOTIFICATION_CHANNEL_DEFAULTS = {
  email: false,
  push: true,
} as const satisfies Record<keyof NotificationChannelPrefs, boolean>;

/** Preferensi yang belum pernah disentuh sama sekali. */
export const NOTIFICATION_CHANNEL_PREFS_KOSONG: NotificationChannelPrefs = {
  email: null,
  push: null,
};

/**
 * Kanal mana yang BERLAKU — pilihan pengguna bila ada, bawaan bila belum.
 *
 * Satu fungsi, dipakai server (sebelum mengantre) dan klien (menggambar
 * togglenya). Dua salinan aturan ini berarti tombol yang menyala sementara
 * kabarnya tidak dikirim, dan tidak ada yang akan menyadarinya.
 */
export function kanalBerlaku(
  prefs: NotificationChannelPrefs | null | undefined,
): Record<keyof NotificationChannelPrefs, boolean> {
  return {
    email: prefs?.email ?? NOTIFICATION_CHANNEL_DEFAULTS.email,
    push: prefs?.push ?? NOTIFICATION_CHANNEL_DEFAULTS.push,
  };
}

/**
 * PUT /api/v1/me/notification-prefs — badan permintaan.
 *
 * Perubahan SEBAGIAN: field yang tidak disebut tidak berubah. `null` adalah
 * PERINTAH HAPUS, bukan nilai — ia mengembalikan kanal itu ke "belum memilih"
 * sehingga bawaan bisa berlaku lagi. Bentuk yang sama dengan
 * `updateAccessibilityPreferencesSchema`, dan alasannya sama.
 */
export const updateNotificationChannelPrefsSchema = z
  .object({
    email: z.boolean().nullable().optional(),
    push: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Sebutkan setidaknya satu kanal yang ingin diubah",
  })
  .openapi({ ref: "UpdateNotificationChannelPrefs" });

export type UpdateNotificationChannelPrefs = z.infer<typeof updateNotificationChannelPrefsSchema>;

export const notificationChannelPrefsResponseSchema = z
  .object({ data: notificationChannelPrefsSchema })
  .openapi({ ref: "NotificationChannelPrefsResponse" });

export type NotificationChannelPrefsResponse = z.infer<
  typeof notificationChannelPrefsResponseSchema
>;
