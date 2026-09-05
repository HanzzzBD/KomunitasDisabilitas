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
 */
export const notificationTypeSchema = z
  .enum([
    /** Akun baru dibuat — sapaan pertama, sekaligus arah langkah berikutnya. */
    "auth.selamat_datang",
    /** Lamaran terkirim — bukti terima yang bisa dibaca ulang. */
    "lamaran.terkirim",
    /** Status lamaran berpindah tahap. */
    "lamaran.status_berubah",
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
