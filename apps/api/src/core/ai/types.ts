// core/ai — kontrak provider AI + taksonomi error (PR-041, ADR-005, ADR-012).
//
// SATU-SATUNYA pintu akses LLM. Modul di luar `core/ai` memanggil gateway,
// tidak pernah SDK/HTTP provider langsung — ditegakkan `boundaries/external`
// di packages/config/eslint/boundaries.cjs ("Impor SDK AI hanya diizinkan di
// core/ai").
//
// KENAPA KONTRAK LEBIH DULU. Provider kedua (Groq, PR-042) dan router/breaker
// di atasnya hanya mungkin bila pemanggil tidak pernah tahu provider mana yang
// menjawab. Karena itu tipe di berkas ini TIDAK memuat satu pun istilah khas
// Gemini: `candidates`, `promptFeedback`, dan kerabatnya berhenti di adapter.
import type { ZodType } from "zod";

/** Bagian `fetch` yang dipakai adapter — memudahkan injeksi di test. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Dimensi vektor embedding yang dijanjikan ADR-005 (text-embedding-004) dan
 * dipakai kolom `vector(768)` di Postgres. Vektor berpanjang lain BUKAN
 * "hampir benar": ia gagal masuk kolomnya, atau lebih buruk, diam-diam
 * dibandingkan dengan vektor yang tidak sebanding.
 */
export const AI_EMBED_DIMENSIONS = 768;

/**
 * Jenis kegagalan yang dibedakan pemanggil. Dibedakan karena TINDAK LANJUTNYA
 * berbeda, bukan demi kerapian: kuota habis → coba provider lain / tunda;
 * provider tumbang → jalur degradasi non-AI (ADR-005); diblokir aman →
 * JANGAN diulang, permintaannya sendiri yang ditolak.
 */
export type AiErrorCode =
  | "AI_RATE_LIMIT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_SAFETY_BLOCK"
  | "AI_TIMEOUT"
  | "AI_NETWORK_ERROR"
  | "AI_INVALID_OUTPUT"
  | "AI_NOT_CONFIGURED";

/**
 * Pesan baku per kode — Bahasa Indonesia sederhana, siap dibacakan screen
 * reader apa adanya bila kelak dipetakan ke ERROR_CATALOG (PR-046).
 */
export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  AI_RATE_LIMIT: "Layanan AI sedang penuh",
  AI_PROVIDER_UNAVAILABLE: "Layanan AI sedang bermasalah",
  AI_SAFETY_BLOCK: "Permintaan ini ditolak penyaring keamanan AI",
  AI_TIMEOUT: "Layanan AI terlalu lama menjawab",
  AI_NETWORK_ERROR: "Layanan AI tidak bisa dihubungi",
  AI_INVALID_OUTPUT: "Jawaban AI tidak sesuai bentuk yang diharapkan",
  AI_NOT_CONFIGURED: "Layanan AI belum dikonfigurasi",
};

/**
 * Kegagalan di sisi provider. Pola `OtpSenderError`: pemanggil memutuskan
 * fallback/menyerah, bukan berkas ini.
 *
 * ATURAN KERAS (Security Considerations PR-041): `message` HANYA boleh
 * tersusun dari pesan baku di atas + `detail` yang dibuat KODE KITA SENDIRI.
 * Body balasan provider, isi prompt, dan API key tidak pernah masuk ke sini —
 * karena error ini boleh dicatat ke log dan boleh sampai ke pengguna.
 */
export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  /** Nama provider untuk log/metrik (bukan rahasia): "gemini", … */
  readonly provider: string;
  /** Status HTTP bila kegagalan datang dari balasan provider. */
  readonly status?: number;

  constructor(
    code: AiErrorCode,
    provider: string,
    options: { detail?: string; status?: number } = {},
  ) {
    const dasar = AI_ERROR_MESSAGES[code];
    super(options.detail === undefined ? dasar : `${dasar} (${options.detail})`);
    this.name = "AiProviderError";
    this.code = code;
    this.provider = provider;
    if (options.status !== undefined) this.status = options.status;
  }
}

/** Peran pesan percakapan; `system` menjadi instruksi sistem di adapter. */
export type AiChatRole = "system" | "user" | "assistant";

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiChatRequest {
  messages: readonly AiChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Batas tunggu khusus panggilan ini; default dari env (GEMINI_TIMEOUT_MS). */
  timeoutMs?: number;
}

/** Pemakaian token — dasar kuota & tabel `ai_usage` (PR-043, belum ditulis). */
export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface AiResponseMeta {
  provider: string;
  model: string;
  usage: AiUsage;
}

export interface AiChatResponse extends AiResponseMeta {
  text: string;
}

export interface AiJsonResponse<T> extends AiResponseMeta {
  /** Sudah lolos zod — aman dipakai tanpa pemeriksaan ulang. */
  data: T;
}

export interface AiEmbedRequest {
  text: string;
  timeoutMs?: number;
}

export interface AiEmbedResponse {
  vector: number[];
  dimensions: number;
  provider: string;
  model: string;
}

export interface AiProvider {
  /** Nama untuk log/metrik (bukan rahasia). */
  readonly name: string;
  chat(request: AiChatRequest): Promise<AiChatResponse>;
  /**
   * JSON mode. Keluaran model DIVALIDASI zod di batas ini (ADR-012): sampai
   * `schema` lolos, teks dari provider adalah masukan tak tepercaya. Gagal
   * validasi = `AiProviderError("AI_INVALID_OUTPUT")`, bukan lemparan mentah.
   */
  chatJson<T>(request: AiChatRequest, schema: ZodType<T>): Promise<AiJsonResponse<T>>;
  embed(request: AiEmbedRequest): Promise<AiEmbedResponse>;
}
