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
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(
      parsed.error.issues.map(
        (issue) => [issue.path.join(".") || "(root)", issue.message] as const,
      ),
    );
  }
  return parsed.data;
}
