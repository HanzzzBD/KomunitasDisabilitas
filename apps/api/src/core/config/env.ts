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
  // --- Endpoint internal (PR-015b) ---
  // Sengaja OPSIONAL: .env lama tetap valid. Bila tidak di-set, /internal/*
  // menolak semua permintaan (deny-by-default) — bukan terbuka.
  INTERNAL_TOKEN: z.string().min(1, { message: "tidak boleh kosong bila diisi" }).optional(),
});

/**
 * Kredensial Twilio hanya berguna lengkap (PR-016b). Setengah terisi hampir
 * selalu berarti salin-tempel yang terpotong — lebih baik boot GAGAL dengan
 * nama variabel yang hilang daripada fallback SMS diam-diam mati saat Fonnte
 * bermasalah (justru saat paling dibutuhkan).
 */
const TWILIO_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"] as const;

const envSchemaLengkap = envSchema.superRefine((env, ctx) => {
  const terisi = TWILIO_VARS.filter((nama) => env[nama] !== undefined);
  if (terisi.length === 0 || terisi.length === TWILIO_VARS.length) return;

  for (const nama of TWILIO_VARS) {
    if (env[nama] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [nama],
        message: `wajib diisi bila ${terisi.join(" / ")} di-set (kredensial Twilio harus lengkap)`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

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
