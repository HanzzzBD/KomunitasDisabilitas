// core/http — katalog kode error terpusat (SDD §11; mitigasi risiko PR-007:
// enum terpusat, bukan string literal tersebar di modul).
//
// ATURAN:
// - Semua error API dibuat via appError("KODE") — jangan res.status().json()
//   manual di controller.
// - message = Bahasa Indonesia sederhana (dibacakan screen reader apa adanya);
//   hint = saran tindakan untuk pengguna.
// - Kode baru WAJIB ditambahkan di sini (test memvalidasi format & kelengkapan).
import type { ErrorEnvelope } from "@nawasena/schemas";

export interface CatalogEntry {
  status: number;
  message: string;
  hint?: string;
}

export const ERROR_CATALOG = {
  VALIDATION_ERROR: {
    status: 400,
    message: "Input tidak valid",
    hint: "Periksa kembali data yang Anda isi",
  },
  JSON_TIDAK_VALID: {
    status: 400,
    message: "Format data yang dikirim rusak",
    hint: "Coba ulangi; laporkan bila terus terjadi",
  },
  TIDAK_TERAUTENTIKASI: {
    status: 401,
    message: "Anda belum masuk",
    hint: "Silakan masuk terlebih dahulu",
  },
  TIDAK_BERHAK: {
    status: 403,
    message: "Anda tidak berhak mengakses ini",
    hint: "Hubungi admin bila Anda merasa seharusnya punya akses",
  },
  RUTE_TIDAK_DITEMUKAN: {
    status: 404,
    message: "Halaman atau data tidak ditemukan",
    hint: "Periksa kembali alamat yang Anda tuju",
  },
  TERLALU_BANYAK_PERMINTAAN: {
    status: 429,
    message: "Terlalu banyak permintaan",
    hint: "Tunggu sebentar, lalu coba lagi",
  },
  // --- Alur OTP (PR-016) ---
  KODE_OTP_SALAH: {
    status: 401,
    message: "Kode yang Anda masukkan salah",
    hint: "Periksa kembali kode dari WhatsApp atau SMS",
  },
  KODE_OTP_HANGUS: {
    status: 410,
    message: "Kode sudah tidak berlaku",
    hint: "Minta kode baru, lalu masukkan dalam 5 menit",
  },
  TERLALU_BANYAK_PERCOBAAN: {
    status: 429,
    message: "Terlalu banyak percobaan kode",
    hint: "Tunggu sesuai waktu yang diberitahukan, lalu minta kode baru",
  },
  TERJADI_KESALAHAN: {
    status: 500,
    message: "Terjadi kesalahan pada server",
    hint: "Coba lagi beberapa saat; laporkan bila terus terjadi",
  },
  BELUM_SIAP: {
    status: 503,
    message: "Layanan sedang tidak siap",
    hint: "Tunggu sebentar, lalu coba lagi",
  },
} as const satisfies Record<string, CatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** Override opsional saat membuat error: pesan/hint kontekstual + Retry-After. */
export interface AppErrorOverrides extends Partial<Pick<CatalogEntry, "message" | "hint">> {
  /**
   * Detik yang harus ditunggu klien; error handler global menuliskannya sebagai
   * header `Retry-After` (SDD §11 — 429 selalu memberi tahu kapan boleh coba lagi).
   */
  retryAfterSeconds?: number;
}

/** Error aplikasi ber-kode katalog; dilempar dari layer mana pun. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly hint?: string;
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, overrides?: AppErrorOverrides) {
    const entry: CatalogEntry = ERROR_CATALOG[code];
    super(overrides?.message ?? entry.message);
    this.name = "AppError";
    this.code = code;
    this.status = entry.status;
    this.hint = overrides?.hint ?? entry.hint;
    this.retryAfterSeconds = overrides?.retryAfterSeconds;
  }

  get envelope(): ErrorEnvelope {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

/** Cara baku membuat error: appError("TIDAK_BERHAK") / dengan override hint. */
export function appError(code: ErrorCode, overrides?: AppErrorOverrides): AppError {
  return new AppError(code, overrides);
}
