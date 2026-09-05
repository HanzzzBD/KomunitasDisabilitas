// core/config — skema env zod + fail-fast (SDD §5.1, ADR-015, 12-factor).
//
// loadEnv() adalah FUNGSI MURNI: menerima source (default process.env),
// mengembalikan config bertipe atau melempar EnvError berisi daftar variabel
// yang hilang/salah. Keputusan mematikan proses ada di entry point (index.ts),
// bukan di sini — supaya unit test tidak membunuh proses test.
//
// Kunci enkripsi FIELD_KEY_V* TIDAK divalidasi di sini — scope PR-013
// (core/crypto memvalidasi panjang/format kunci saat boot).
import { z } from "zod";

/** Umur retensi dalam hari — minimal 1; lihat catatan di blok RETENTION_*. */
const hariRetensi = (bawaan: number) =>
  z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1, { message: "minimal 1 hari — nilai 0 akan mengosongkan tabel" })
    .default(bawaan);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"], {
      errorMap: () => ({ message: "harus salah satu dari: development, test, production" }),
    })
    .default("development"),
  HOST: z.string().min(1, { message: "tidak boleh kosong" }).default("0.0.0.0"),
  PORT: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(0, { message: "minimal 0" })
    .max(65535, { message: "maksimal 65535" })
    .default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"], {
      errorMap: () => ({ message: "harus level pino yang valid (fatal..trace)" }),
    })
    .default("info"),
  DATABASE_URL: z
    .string({ required_error: "wajib diisi (URL PostgreSQL)" })
    .url({ message: "harus URL valid, contoh postgresql://user:pass@localhost:5432/nawasena" }),
  REDIS_URL: z
    .string({ required_error: "wajib diisi (URL Redis cache)" })
    .url({ message: "harus URL valid, contoh redis://localhost:6379" }),
  // ADR-004 (revisi PR-008): service Redis queue terpisah (noeviction, BullMQ).
  REDIS_QUEUE_URL: z
    .string({ required_error: "wajib diisi (URL Redis queue)" })
    .url({ message: "harus URL valid, contoh redis://localhost:6380" }),
  // --- core/http (PR-007) ---
  CORS_ORIGINS: z.string().default("http://localhost:5173"), // comma-separated origin whitelist
  RATE_LIMIT_MAX: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1, { message: "minimal 1" })
    .default(300), // request per jendela per IP
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1000, { message: "minimal 1000 (1 detik)" })
    .default(60_000),
  // --- OTP (PR-016) ---
  // Pepper HMAC untuk hash OTP di Redis. OPSIONAL secara skema (deny-by-default
  // seperti INTERNAL_TOKEN): bila tidak di-set, endpoint OTP menjawab 503 —
  // TIDAK PERNAH berjalan dengan hash tanpa kunci. .env lama tetap valid.
  OTP_HASH_SECRET: z
    .string()
    .min(32, { message: "minimal 32 karakter (mis. hasil `openssl rand -base64 32`)" })
    .optional(),
  // --- Provider pengiriman OTP (PR-016b) ---
  // Semua OPSIONAL: tanpa satu pun provider, endpoint OTP tetap ada tetapi
  // menjawab 503 (deny-by-default). Kredensial yang setengah terisi ditolak
  // saat boot — lihat superRefine di bawah.
  FONNTE_TOKEN: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  FONNTE_BASE_URL: z
    .string()
    .url({ message: "harus URL valid" })
    .default("https://api.fonnte.com"),
  TWILIO_ACCOUNT_SID: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  /** Nomor/sender ID pengirim SMS terdaftar di Twilio. */
  TWILIO_FROM: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  TWILIO_BASE_URL: z
    .string()
    .url({ message: "harus URL valid" })
    .default("https://api.twilio.com"),
  /** Batas tunggu satu panggilan provider; habis waktu = coba provider berikutnya. */
  OTP_SEND_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1000, { message: "minimal 1000 (1 detik)" })
    .max(30_000, { message: "maksimal 30000 (30 detik)" })
    .default(10_000),
  // --- Login Google OAuth (PR-017) ---
  // Pasangan client id + secret OPSIONAL (pola OTP): tanpa keduanya endpoint
  // /auth/google menjawab 503, bukan berjalan tanpa memeriksa audience.
  // Setengah terisi = boot GAGAL (superRefine di bawah).
  GOOGLE_CLIENT_ID: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  /** Sumber kunci publik Google (JWKS). Diganti hanya untuk test/staging. */
  GOOGLE_JWKS_URL: z
    .string()
    .url({ message: "harus URL valid" })
    .default("https://www.googleapis.com/oauth2/v3/certs"),
  /** Endpoint penukaran authorization code. Diganti hanya untuk test/staging. */
  GOOGLE_TOKEN_URL: z
    .string()
    .url({ message: "harus URL valid" })
    .default("https://oauth2.googleapis.com/token"),
  /** Batas tunggu panggilan ke Google (token endpoint & JWKS). */
  GOOGLE_HTTP_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1000, { message: "minimal 1000 (1 detik)" })
    .max(30_000, { message: "maksimal 30000 (30 detik)" })
    .default(10_000),
  // --- Sesi JWT RS256 (PR-018) ---
  // PEM di-encode base64 SATU BARIS: PEM asli multi-baris tidak bisa ditulis
  // apa adanya di .env/compose tanpa lolos-kutip yang rapuh. Bentuk/panjang
  // kunci TIDAK divalidasi di sini — itu milik core/auth (pola FIELD_KEY_V*).
  // Opsional sebagai GRUP: tanpa keduanya, penerbitan sesi mati (503).
  JWT_PRIVATE_KEY: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  JWT_PUBLIC_KEY: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  // --- Retensi data (PR-024a, SDD §6.4) ---
  //
  // Semua punya DEFAULT dari tabel SDD §6.4, jadi `.env` lama tetap valid dan
  // kebijakannya tetap berjalan tanpa satu pun variabel di-set. Yang bisa
  // di-override hanya ANGKANYA — bahwa kebijakannya ada tidak bisa dimatikan
  // lewat env, sebab retensi yang bisa dimatikan diam-diam bukan kebijakan.
  //
  // Nilai 0 SENGAJA ditolak (min 1): `RETENTION_..._DAYS=0` akan menghapus
  // seluruh isi tabel pada run berikutnya, dan salah ketik yang menghapus
  // segalanya tidak boleh terlihat seperti konfigurasi yang sah.
  RETENTION_REFRESH_EXPIRED_DAYS: hariRetensi(90),
  RETENTION_REFRESH_REVOKED_DAYS: hariRetensi(180),
  RETENTION_REFRESH_REUSE_DAYS: hariRetensi(730),
  RETENTION_MATCH_SCORES_DAYS: hariRetensi(7),
  RETENTION_AI_USAGE_DAYS: hariRetensi(90),
  /** Baris per DELETE. Batch besar mengunci lama & menggelembungkan WAL. */
  RETENTION_BATCH_SIZE: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1, { message: "minimal 1" })
    .max(10_000, { message: "maksimal 10000" })
    .default(1_000),
  /** Batas baris per kebijakan per run; sisanya diambil run berikutnya. */
  RETENTION_MAX_PER_RUN: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1, { message: "minimal 1" })
    .default(50_000),
  // --- Endpoint internal (PR-015b) ---
  // Sengaja OPSIONAL: .env lama tetap valid. Bila tidak di-set, /internal/*
  // menolak semua permintaan (deny-by-default) — bukan terbuka.
  INTERNAL_TOKEN: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  // --- AI Gateway / Gemini (PR-041, ADR-005, ADR-012) ---
  // Kunci OPSIONAL sendirian (bukan GRUP_KREDENSIAL: hanya satu rahasia, tidak
  // ada pasangan yang bisa terpotong separuh). Tanpa kunci, gateway tetap
  // terbentuk tetapi setiap panggilan ditolak AI_NOT_CONFIGURED — deny-by-default
  // seperti INTERNAL_TOKEN/OTP: dev bisa boot tanpa kredensial pihak ketiga.
  GEMINI_API_KEY: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  /**
   * Nama model sengaja lewat env, bukan konstanta kode: katalog model Gemini
   * berganti nama jauh lebih sering daripada rilis kita, dan penggantian nama
   * tidak boleh menuntut PR baru.
   */
  GEMINI_CHAT_MODEL: z
    .string()
    .min(1, { message: "tidak boleh kosong bila diisi" })
    .default("gemini-2.0-flash"),
  /** 768 dimensi (ADR-005) — dicocokkan dengan kolom vector(768) di adapter. */
  GEMINI_EMBED_MODEL: z
    .string()
    .min(1, { message: "tidak boleh kosong bila diisi" })
    .default("text-embedding-004"),
  /** Base URL hanya diganti untuk test/staging; default sudah benar. */
  GEMINI_BASE_URL: z
    .string()
    .url({ message: "harus URL valid" })
    .default("https://generativelanguage.googleapis.com"),
  /** Batas tunggu satu panggilan AI; habis waktu = AI_TIMEOUT, bukan menggantung. */
  GEMINI_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1000, { message: "minimal 1000 (1 detik)" })
    .max(60_000, { message: "maksimal 60000 (60 detik)" })
    .default(15_000),
  // --- AI Gateway / Groq — provider cadangan (PR-042, ADR-005) ---
  // Opsional sendirian, alasan yang sama dengan GEMINI_API_KEY. Tanpa kunci ini
  // gateway tetap terbentuk dan Gemini tetap jalan; yang hilang hanya jalur
  // cadangan saat Gemini penuh/tumbang.
  GROQ_API_KEY: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  /** Nama model lewat env — katalog Groq berganti nama lebih sering dari rilis kita. */
  GROQ_CHAT_MODEL: z
    .string()
    .min(1, { message: "tidak boleh kosong bila diisi" })
    .default("llama-3.3-70b-versatile"),
  /** Base URL hanya diganti untuk test/staging; adapter menambahkan /openai/v1/…. */
  GROQ_BASE_URL: z.string().url({ message: "harus URL valid" }).default("https://api.groq.com"),
  /** Batas tunggu satu panggilan Groq; batasnya sama dengan GEMINI_TIMEOUT_MS. */
  GROQ_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: "harus angka" })
    .int({ message: "harus bilangan bulat" })
    .min(1000, { message: "minimal 1000 (1 detik)" })
    .max(60_000, { message: "maksimal 60000 (60 detik)" })
    .default(15_000),
  /**
   * Tuas rollback router (PR-042). Bila di-set, SELURUH panggilan AI dipaksa ke
   * satu provider: tanpa fallback, tanpa circuit breaker. Gunanya saat salah
   * satu provider terbukti bermasalah dan kita perlu mematikannya tanpa deploy.
   */
  AI_ROUTER_FORCE_PROVIDER: z.enum(["gemini", "groq"]).optional(),
  // --- Kuota AI (PR-043, SDD 7.1) ---
  //
  // Angka jatahnya TIDAK di sini: ia berpola (AI_QUOTA_<FITUR>_PER_DAY) dan
  // dibaca `core/ai/quota-config.ts`, sama seperti override antrean
  // (QUEUE_<NAMA>_<FIELD>) yang juga tidak didaftar satu per satu di skema ini.
  //
  // Yang di sini hanya tuas perilaku saat penghitung kuota TIDAK BISA DIBACA.
  // Bawaannya `false` = gagal tertutup: panggilan AI ditolak dengan 429 dan
  // fitur beralih ke jalur non-AI (ADR-005). Menyalakannya berarti seluruh
  // kendali biaya mati selama gangguan Redis — sah sebagai keputusan operator
  // yang sedang menonton, tidak pernah sebagai bawaan.
  AI_QUOTA_FAIL_OPEN: z
    .enum(["true", "false"], {
      errorMap: () => ({ message: "harus 'true' atau 'false'" }),
    })
    .default("false")
    .transform((nilai) => nilai === "true"),

  // --- Push notification FCM HTTP v1 (PR-048b, SDD §16 `notify:push`) ---
  //
  // Kredensial service-account Google, bukan "server key" legacy: FCM HTTP v1
  // menuntut bearer OAuth2, dan API legacy sudah dimatikan Google. Ketiganya
  // opsional SEBAGAI GRUP — nol variabel = push dimatikan, keadaan sah untuk dev
  // (pola yang sama dengan Twilio dan Google OAuth di atas).
  FCM_PROJECT_ID: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  FCM_CLIENT_EMAIL: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
  /**
   * Kunci privat PEM service account. Di env ia satu baris dengan pemisah baris
   * ditulis sebagai dua karakter (backslash + n); pembacanya memulihkannya —
   * persis perlakuan JWT_PRIVATE_KEY (lihat core/auth/keys.ts).
   */
  FCM_PRIVATE_KEY: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
});

/**
 * Kredensial yang hanya berguna LENGKAP. Setengah terisi hampir selalu berarti
 * salin-tempel yang terpotong — lebih baik boot GAGAL dengan nama variabel yang
 * hilang daripada:
 * - fallback SMS Twilio (PR-016b) diam-diam mati saat Fonnte bermasalah,
 * - login Google (PR-017) berjalan tanpa client_secret untuk menukar code, atau
 * - sesi (PR-018) menandatangani access token dengan kunci privat yang tidak
 *   punya pasangan publik untuk memverifikasinya.
 *
 * Semuanya opsional sebagai GRUP: nol variabel terisi = fitur dimatikan (503),
 * itu keadaan sah untuk dev tanpa kredensial.
 */
const GRUP_KREDENSIAL = [
  {
    label: "kredensial Twilio",
    vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
  },
  {
    label: "kredensial Google OAuth",
    vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  },
  {
    label: "pasangan kunci sesi RS256",
    vars: ["JWT_PRIVATE_KEY", "JWT_PUBLIC_KEY"],
  },
  {
    label: "kredensial service account FCM",
    vars: ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"],
  },
] as const satisfies ReadonlyArray<{ label: string; vars: ReadonlyArray<keyof Env> }>;

const envSchemaLengkap = envSchema.superRefine((env, ctx) => {
  for (const { label, vars } of GRUP_KREDENSIAL) {
    const terisi = vars.filter((nama) => env[nama] !== undefined);
    if (terisi.length === 0 || terisi.length === vars.length) continue;

    for (const nama of vars) {
      if (env[nama] !== undefined) continue;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [nama],
        message: `wajib diisi bila ${terisi.join(" / ")} di-set (${label} harus lengkap)`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Daftar nama variabel yang dikenali API. Diekspor untuk SATU pemakai:
 * test yang memastikan setiap variabel di sini juga muncul di
 * `apps/api/.env.example` (boleh sebagai baris berkomentar untuk yang opsional).
 *
 * Tanpa penjaga itu, variabel baru bisa ditambahkan di sini dan tidak pernah
 * sampai ke template — persis yang terjadi pada `INTERNAL_TOKEN`, yang selama
 * beberapa PR tidak punya satu pun petunjuk keberadaannya bagi operator.
 */
export const ENV_KEYS = Object.keys(envSchema.shape).sort();

/** Error konfigurasi: memuat daftar variabel bermasalah untuk pesan fail-fast. */
export class EnvError extends Error {
  /** [nama variabel, alasan] — dipakai entry point untuk pesan yang jelas. */
  readonly issues: ReadonlyArray<readonly [variable: string, reason: string]>;

  constructor(issues: ReadonlyArray<readonly [string, string]>) {
    const daftar = issues.map(([nama, alasan]) => `  - ${nama}: ${alasan}`).join("\n");
    super(
      `Konfigurasi environment tidak valid:\n${daftar}\nPeriksa file .env Anda (lihat .env.example).`,
    );
    this.name = "EnvError";
    this.issues = issues;
  }
}

/** Parse env; lempar EnvError berisi variabel mana yang hilang/salah. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchemaLengkap.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map(
        (issue) => [issue.path.join(".") || "(root)", issue.message] as const,
      ),
    );
  }
  return parsed.data;
}
