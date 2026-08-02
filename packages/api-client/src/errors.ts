// Pemetaan error API → tipe TS. Semua kegagalan request bermuara ke ApiError
// yang membawa ErrorEnvelope {code, message, hint?} (pesan Bahasa Indonesia
// sederhana — dibacakan screen reader apa adanya).
import { errorEnvelopeSchema, type ErrorEnvelope } from "@nawasena/schemas";

/** Error tunggal seluruh client — periksa `code` untuk penanganan spesifik. */
export class ApiError extends Error {
  readonly code: string;
  readonly hint?: string;
  /** Status HTTP; 0 = gagal sebelum ada response (jaringan/timeout). */
  readonly status: number;

  constructor(envelope: ErrorEnvelope, status: number) {
    super(envelope.message);
    this.name = "ApiError";
    this.code = envelope.code;
    this.hint = envelope.hint;
    this.status = status;
  }

  get envelope(): ErrorEnvelope {
    return { code: this.code, message: this.message, hint: this.hint };
  }
}

/** Envelope untuk kegagalan jaringan (fetch reject / server tak terjangkau). */
export const JARINGAN_GAGAL: ErrorEnvelope = {
  code: "JARINGAN_GAGAL",
  message: "Tidak dapat terhubung ke server",
  hint: "Periksa koneksi internet Anda, lalu coba lagi",
};

/** Envelope untuk response yang bukan envelope error valid (mis. HTML gateway). */
export const RESPONS_TIDAK_DIKENAL: ErrorEnvelope = {
  code: "RESPONS_TIDAK_DIKENAL",
  message: "Server memberikan jawaban yang tidak dikenali",
  hint: "Coba lagi beberapa saat; laporkan bila terus terjadi",
};

/**
 * Bentuk body error apa pun → ErrorEnvelope valid.
 * Body yang tidak sesuai skema dipetakan ke RESPONS_TIDAK_DIKENAL
 * (jangan tampilkan teks mentah server ke pengguna).
 */
export function toErrorEnvelope(body: unknown): ErrorEnvelope {
  const parsed = errorEnvelopeSchema.safeParse(body);
  return parsed.success ? parsed.data : RESPONS_TIDAK_DIKENAL;
}
