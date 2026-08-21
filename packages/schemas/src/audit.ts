// Kontrak audit bersama (SDD §8.3). Meta selalu allowlist: key di luar skema
// dibuang oleh Zod agar PII tidak pernah sampai ke audit_logs.
import { z } from "zod";
import { idSchema } from "./common.js";

export const AUDIT_ACTION = {
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  /** PR-017: login berhasil. Pasangan wajib AUTH_LOGIN_FAILED — tanpa jejak
   *  sukses, lonjakan kegagalan tidak punya pembanding saat investigasi. */
  AUTH_LOGIN_SUCCEEDED: "AUTH_LOGIN_SUCCEEDED",
  /** PR-018: refresh token yang SUDAH dicabut dipakai lagi — indikasi token
   *  dicuri. Aksi tersendiri, bukan AUTH_LOGIN_FAILED: ini bukan percobaan
   *  masuk yang salah kode, melainkan sinyal keamanan yang layak dialarmkan. */
  AUTH_REFRESH_REUSED: "AUTH_REFRESH_REUSED",
  PROFILE_SENSITIVE_READ: "PROFILE_SENSITIVE_READ",
  PROFILE_SENSITIVE_UPDATED: "PROFILE_SENSITIVE_UPDATED",
  APPLICATION_STATUS_CHANGED: "APPLICATION_STATUS_CHANGED",
  COMPANY_VERIFIED: "COMPANY_VERIFIED",
  ADMIN_RESOURCE_CHANGED: "ADMIN_RESOURCE_CHANGED",
  DATA_EXPORTED: "DATA_EXPORTED",
  /** PR-020: email akun diubah pemiliknya. Diaudit karena email adalah jalur
   *  penautan akun Google (PR-017) — perubahannya mengubah SIAPA yang kelak
   *  bisa masuk ke akun ini, jadi ia jejak keamanan, bukan sekadar edit profil.
   *  Alamat emailnya sendiri TIDAK pernah masuk meta (lihat auditMetaSchemas). */
  ACCOUNT_EMAIL_CHANGED: "ACCOUNT_EMAIL_CHANGED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  /** PR-023: purge/anonimisasi akun terhapus oleh job terjadwal. Terpisah dari
   *  ACCOUNT_DELETED karena pelakunya SISTEM, bukan pengguna — dan karena yang
   *  dicatat adalah penghapusan PERMANEN, satu-satunya bukti bahwa janji
   *  "hilang ≤ 30 hari" ditepati setelah barisnya sendiri tidak ada lagi. */
  DATA_PURGED: "DATA_PURGED",
  /** PR-024a: penghapusan terjadwal menurut kebijakan retensi SDD §6.4.
   *  Terpisah dari DATA_PURGED: yang ini TIDAK dipicu permintaan siapa pun dan
   *  tidak terikat satu akun — ia kebersihan operasional yang wajib bisa
   *  dibuktikan berjalan, terutama untuk `refresh_tokens` yang ambangnya
   *  adalah jendela deteksi reuse, bukan setelan storage. */
  DATA_RETAINED: "DATA_RETAINED",
  /** PR-024b: lowongan ditutup otomatis karena melewati `expires_at`.
   *  SENGAJA tidak memakai ADMIN_RESOURCE_CHANGED yang sudah punya
   *  `operation: "close"` — namanya berkata ADMIN, sementara pelakunya sistem.
   *  Audit yang menamai pelaku dengan salah lebih buruk daripada audit yang
   *  bertambah satu baris. */
  JOB_AUTO_CLOSED: "JOB_AUTO_CLOSED",
} as const;

export const auditActionSchema = z.enum([
  AUDIT_ACTION.AUTH_LOGIN_FAILED,
  AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED,
  AUDIT_ACTION.AUTH_REFRESH_REUSED,
  AUDIT_ACTION.PROFILE_SENSITIVE_READ,
  AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED,
  AUDIT_ACTION.APPLICATION_STATUS_CHANGED,
  AUDIT_ACTION.COMPANY_VERIFIED,
  AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
  AUDIT_ACTION.DATA_EXPORTED,
  AUDIT_ACTION.ACCOUNT_EMAIL_CHANGED,
  AUDIT_ACTION.ACCOUNT_DELETED,
  AUDIT_ACTION.DATA_PURGED,
  AUDIT_ACTION.DATA_RETAINED,
  AUDIT_ACTION.JOB_AUTO_CLOSED,
]);

export type AuditAction = z.infer<typeof auditActionSchema>;

/** Metode masuk — dipakai audit sukses & gagal. Bukan PII. */
const loginMethodSchema = z.enum(["otp", "google"]);

const sensitiveFieldSchema = z.enum(["disabilityTypes", "accommodationNeeds"]);

/**
 * Kenapa data disabilitas seseorang dibaca (PR-039).
 *
 * Diekspor karena ia BUKAN sekadar label audit: `modules/profiles` memakainya
 * sebagai kunci kebijakan — tujuan mana yang dicatat per panggilan, mana yang
 * diagregasi, dan mana yang tidak lewat jalur ini sama sekali. Satu daftar untuk
 * keduanya supaya tujuan baru tidak bisa lahir di kode tanpa punya tempat di
 * audit.
 */
export const sensitiveAccessPurposeSchema = z.enum([
  /** Pemilik membaca datanya sendiri. TIDAK melewati jalur ber-alasan. */
  "selfService",
  /** Operator/admin menolong pengguna. Wajib alasan, dicatat per panggilan. */
  "support",
  /** Pencocokan lowongan. Dicatat teragregasi per hari, bukan per profil. */
  "matching",
  /** Pengungkapan ke pemberi kerja saat melamar (PR-075). */
  "disclosure",
]);

export type SensitiveAccessPurpose = z.infer<typeof sensitiveAccessPurposeSchema>;

/**
 * Alasan yang wajib disertakan setiap pembacaan data disabilitas non-pemilik.
 *
 * Dipakai DUA kali: sebagai gerbang masuk di `modules/profiles` (permintaan
 * tanpa alasan ditolak sebelum satu byte pun dibaca) dan sebagai bentuk meta
 * audit di bawah. Satu batas panjang untuk keduanya — dua batas yang berbeda
 * akan berarti alasan yang diterima gerbang lalu ditolak sanitizer, dan
 * pembacaannya tetap terjadi tanpa jejak.
 */
export const sensitiveAccessReasonSchema = z
  .string()
  .trim()
  .min(1, { message: "Alasan akses wajib diisi" })
  .max(200, { message: "Alasan akses maksimal 200 karakter" });

const applicationStatusSchema = z.enum([
  "submitted",
  "viewed",
  "in_review",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export const auditMetaSchemas: Record<AuditAction, z.AnyZodObject> = {
  // `reason` sengaja menyebut metodenya sendiri (prefiks `google*`) alih-alih
  // menambah field `method` wajib: field baru yang wajib akan membuat SELURUH
  // audit AUTH_LOGIN_FAILED lama (PR-016, tanpa field itu) ditolak sanitizer
  // dan hilang diam-diam. Menambah anggota enum bersifat additive.
  [AUDIT_ACTION.AUTH_LOGIN_FAILED]: z.object({
    reason: z.enum([
      "otpInvalid",
      "rateLimited",
      "accountLocked",
      /** Google menolak penukaran code (verifier PKCE salah, code hangus/terpakai). */
      "googleExchangeFailed",
      /** id_token gagal verifikasi: audience/issuer/kedaluwarsa/tanda tangan. */
      "googleTokenInvalid",
      /** Email Google belum terverifikasi — linking ditolak (anti-takeover). */
      "googleEmailNotVerified",
      /** PR-020a: alamat dari Google dipegang akun lain yang belum membuktikan
       *  kepemilikannya. Ditolak, BUKAN ditautkan — penautan ke baris itu persis
       *  pengambilalihan yang dicegah. Layak diaudit: pola berulang atas banyak
       *  alamat berarti ada yang sedang memanen email lewat PUT /me. */
      "googleEmailClaimed",
    ]),
  }),
  [AUDIT_ACTION.AUTH_LOGIN_SUCCEEDED]: z.object({
    method: loginMethodSchema,
    isNewUser: z.boolean(),
  }),
  // Tanpa PII dan tanpa potongan token: yang berguna saat investigasi adalah
  // BERAPA sesi ikut tercabut, bukan nilai token yang memicunya.
  [AUDIT_ACTION.AUTH_REFRESH_REUSED]: z.object({
    /** Jumlah refresh token aktif yang ikut dicabut dalam keluarga itu. */
    revokedCount: z.number().int().min(0),
  }),
  // `reason` dan `count` LAHIR DI PR-039, bersama penulis pertamanya.
  //
  // Sama seperti `operation` pada PROFILE_SENSITIVE_UPDATED di bawah: belum ada
  // satu pun baris PROFILE_SENSITIVE_READ di mana pun — PR-037 membangun modul
  // profil tanpa jalur baca non-pemilik — jadi menambahkan field WAJIB sekarang
  // tidak membuat audit lama mendadak ditolak sanitizer.
  //
  // `reason` adalah SATU-SATUNYA field teks bebas di seluruh katalog ini, dan
  // itu disengaja. Pertanyaan yang diajukan orang saat menyelidiki pembacaan
  // data disabilitas bukan "kapan" melainkan "KENAPA", dan enum tertutup atas
  // alasan hanya akan menghasilkan satu nilai `lainnya` yang dipakai untuk
  // segalanya. Harganya: teks itu ditulis manusia, jadi ia satu-satunya tempat
  // di `audit_logs` yang bisa kemasukan PII bila operatornya lalai. Batas 200
  // karakter menahan panjangnya, dan docs/audit-action-catalog.md menyatakan
  // larangannya — sisanya adalah pelatihan operator, bukan validasi.
  [AUDIT_ACTION.PROFILE_SENSITIVE_READ]: z.object({
    purpose: sensitiveAccessPurposeSchema,
    fields: z.array(sensitiveFieldSchema).min(1),
    reason: sensitiveAccessReasonSchema,
    /**
     * Hanya pada baris AGREGAT (`purpose: "matching"`): berapa profil yang
     * dibaca sepanjang periode itu. Absen pada baris per-panggilan — di sana
     * jawabannya selalu satu, dan menuliskannya hanya menambah derau.
     */
    count: z.number().int().positive().optional(),
  }),
  // `operation` LAHIR DI PR-037, dan sengaja lahir bersama penulis pertamanya.
  //
  // Tanpa field itu, penyimpanan data disabilitas dan PENCABUTAN consent
  // (yang menghapus data itu) menghasilkan baris audit yang identik. Padahal
  // pertanyaan yang benar-benar diajukan orang saat menyelidiki adalah
  // "kapan data saya dihapus?" — dan jejak yang tidak bisa menjawabnya gagal
  // pada satu-satunya hal yang membuatnya ada.
  //
  // Menambahkannya sebagai field WAJIB aman JUSTRU karena dilakukan sekarang:
  // belum ada satu pun baris PROFILE_SENSITIVE_UPDATED di mana pun, jadi tidak
  // ada audit lama yang mendadak ditolak sanitizer (bandingkan alasan
  // AUTH_LOGIN_FAILED di atas, yang sudah punya sejarah).
  //
  // `fields` boleh KOSONG di sini: pemberian consent adalah peristiwa PDP yang
  // layak dicatat meski belum satu field pun diisi.
  [AUDIT_ACTION.PROFILE_SENSITIVE_UPDATED]: z.object({
    operation: z.enum(["consentGranted", "consentRevoked", "fieldsUpdated"]),
    fields: z.array(sensitiveFieldSchema),
  }),
  [AUDIT_ACTION.APPLICATION_STATUS_CHANGED]: z.object({
    from: applicationStatusSchema,
    to: applicationStatusSchema,
  }),
  [AUDIT_ACTION.COMPANY_VERIFIED]: z.object({
    from: z.enum(["unverified", "selfClaimed", "verified"]),
    to: z.literal("verified"),
  }),
  [AUDIT_ACTION.ADMIN_RESOURCE_CHANGED]: z.object({
    operation: z.enum(["create", "update", "publish", "close", "moderate"]),
  }),
  // Nama BAGIAN yang ikut diekspor, bukan isinya. Berguna persis saat ada
  // sengketa "data saya tidak lengkap": ia menunjukkan apa yang platform
  // memang punya saat itu, tanpa menyalin satu pun data pribadi ke audit_logs
  // yang bertahan 2 tahun.
  [AUDIT_ACTION.DATA_EXPORTED]: z.object({
    format: z.literal("json"),
    formatVersion: z.number().int().positive(),
    sections: z.array(z.string()),
  }),
  // ALAMAT EMAIL TIDAK PERNAH DICATAT — audit_logs bertahan 2 tahun (SDD §6.4)
  // dan email adalah PII. Yang berguna saat investigasi adalah bahwa perubahan
  // TERJADI dan kapan; alamatnya sendiri bisa dibaca dari baris users saat itu
  // dibutuhkan, lewat jalur yang memang punya kontrol aksesnya sendiri.
  [AUDIT_ACTION.ACCOUNT_EMAIL_CHANGED]: z.object({
    /** false = email diisi pertama kali; true = mengganti/mengosongkan yang lama. */
    hadPreviousEmail: z.boolean(),
    /** true bila perubahan ini MENGOSONGKAN email. */
    cleared: z.boolean(),
  }),
  // Tiga tahap, dan ketiganya berguna justru saat SALAH SATU tidak muncul:
  // `rejected` tanpa `requested` = seseorang mencoba menghapus akun ini dan
  // gagal membuktikan diri (pola berulang = access token bocor); `requested`
  // tanpa `completed` = pembuktian lolos tetapi transaksi penghapusan gagal,
  // dan akun itu perlu diperiksa tangan. Tanpa pemisahan ini, keduanya hanya
  // terlihat sebagai "tidak ada catatan".
  // Dipakai DUA kali per run: sekali per akun (entityId = id akun) dan sekali
  // sebagai ringkasan run (entityId = null). Bentuk metanya sama supaya
  // keduanya bisa dijumlahkan tanpa perlakuan khusus saat investigasi.
  //
  // `dryRun` WAJIB ada, bukan opsional: laporan tanpa penanda itu tidak bisa
  // dibedakan dari penghapusan sungguhan saat dibaca kembali berbulan-bulan
  // kemudian — dan itu persis pertanyaan yang diajukan orang saat menyelidiki
  // data yang hilang.
  [AUDIT_ACTION.DATA_PURGED]: z.object({
    dryRun: z.boolean(),
    /** Akun yang diproses (1 pada baris per-akun). */
    accounts: z.number().int().min(0),
    /** Akun yang dihapus penuh — tanpa lamaran hired. */
    deleted: z.number().int().min(0),
    /** Akun yang dianonimkan — lamaran hired-nya dipertahankan. */
    anonymized: z.number().int().min(0),
    /** Total baris data anak pribadi yang ikut dihapus. */
    records: z.number().int().min(0),
  }),
  // Dipakai per KEBIJAKAN dan sekali sebagai ringkasan run (`policy: "run"`).
  // `remaining` ikut dicatat karena angka yang benar-benar berguna saat
  // menyelidiki adalah selisihnya: tabel yang bertambah lebih cepat daripada
  // yang dibersihkan tidak terlihat dari `deleted` saja.
  [AUDIT_ACTION.DATA_RETAINED]: z.object({
    dryRun: z.boolean(),
    /** Nama kebijakan, atau "run" untuk ringkasan. Bukan PII. */
    policy: z.string(),
    deleted: z.number().int().min(0),
    remaining: z.number().int().min(0),
    /** Hanya pada ringkasan: bulan ai_usage yang difinalkan ke agregat. */
    monthsAggregated: z.number().int().min(0).optional(),
  }),
  // Ringkasan per run, bukan per lowongan: yang ditutup adalah data PLATFORM
  // (lowongan), bukan data seseorang, jadi tidak ada subjek yang perlu bisa
  // membuktikan apa yang terjadi pada barisnya sendiri. `remaining` ikut
  // dicatat dengan alasan yang sama seperti DATA_RETAINED.
  [AUDIT_ACTION.JOB_AUTO_CLOSED]: z.object({
    dryRun: z.boolean(),
    closed: z.number().int().min(0),
    remaining: z.number().int().min(0),
  }),
  [AUDIT_ACTION.ACCOUNT_DELETED]: z.object({
    stage: z.enum(["requested", "rejected", "completed"]),
    /** Cara pengguna membuktikan diri. Bukan PII — nomor/email tidak ikut. */
    method: z.enum(["otp", "google"]),
    /** Hanya pada `completed`: jumlah sesi hidup yang ikut dicabut. */
    revokedCount: z.number().int().min(0).optional(),
  }),
};

export const auditActorSchema = z.object({
  actorId: idSchema.nullable(),
  requestId: idSchema,
});

export type AuditActor = z.infer<typeof auditActorSchema>;

export const auditEntitySchema = z.string().trim().min(1).max(80);
export const auditEntityIdSchema = idSchema.nullable();
