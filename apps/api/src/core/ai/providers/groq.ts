// core/ai — adapter Groq (PR-042, ADR-005): chat + JSON mode. TANPA embedding.
//
// REST langsung lewat `fetch` ber-DI, BUKAN `groq-sdk` — alasan yang sama persis
// dengan adapter Gemini: seluruh panggilan HTTP keluar di repo ini disuntik
// lewat `FetchLike` dan diuji dengan `vi.fn()`, tanpa mock server. Satu endpoint
// dan pemetaan statusnya tidak sebanding dengan memasukkan mekanisme mock baru.
//
// Balasan Groq adalah MASUKAN TAK TEPERCAYA. Tidak ada satu pun potongan body-nya
// yang boleh masuk pesan error atau log — lihat AiProviderError. Bentuk body
// error Groq tidak terdokumentasi, jadi ia memang tidak pernah dibaca.
//
// Permukaan wire-nya kompatibel-OpenAI (`POST {baseUrl}/openai/v1/chat/completions`,
// `Authorization: Bearer`). Yang TIDAK didukung Groq sengaja tidak pernah kita
// kirim: `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name`, dan `n > 1`.
import type { ZodType } from "zod";
import {
  AiProviderError,
  type AiChatRequest,
  type AiChatResponse,
  type AiEmbedRequest,
  type AiEmbedResponse,
  type AiJsonResponse,
  type AiProvider,
  type AiUsage,
  type FetchLike,
} from "../types.js";

export const GROQ_PROVIDER = "groq";

export interface GroqConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  /** Batas tunggu bawaan; tiap panggilan boleh menimpanya. */
  timeoutMs: number;
}

/** Bentuk balasan yang KITA baca — sisanya sengaja tidak dipetakan. */
interface GroqChoice {
  message?: { content?: unknown } | null;
  finish_reason?: unknown;
}
interface GroqResponse {
  choices?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  } | null;
}

/**
 * `finish_reason` disaring ke bentuk enum — huruf kecil/garis bawah saja —
 * supaya teks bebas dari provider tidak punya jalan masuk ke pesan error kita.
 * Sama seperti di adapter Gemini: satu-satunya cara menjamin body provider tidak
 * bocor adalah tidak pernah meneruskan string yang bentuknya tidak kita pastikan.
 */
function alasanSelesai(nilai: unknown): string {
  return typeof nilai === "string" && /^[a-z_]{1,40}$/.test(nilai) ? nilai : "tidak_diketahui";
}

/**
 * Berhenti WAJAR. `length` ikut — teksnya terpenggal, tetapi pemanggillah yang
 * meminta batas itu lewat `maxOutputTokens` (padanan MAX_TOKENS di Gemini).
 */
const SELESAI_WAJAR = new Set(["stop", "length"]);

/**
 * Jawaban DITAHAN penyaring provider. Tindak lanjutnya sama dengan Gemini:
 * JANGAN diulang, dan JANGAN dialihkan ke provider lain — itu vonis isi, bukan
 * sinyal kesehatan (lihat router.ts).
 */
const SELESAI_DITAHAN = new Set(["content_filter"]);

/**
 * Kelaskan `finish_reason`. Nilai asing TIDAK dianggap wajar, alasan yang sama
 * dengan adapter Gemini: enum ini bertambah tanpa pemberitahuan dan setiap nilai
 * barunya menandai generasi yang gagal. `tool_calls` termasuk asing di sini —
 * kita tidak pernah mengirim `tools`, jadi kemunculannya berarti balasan tanpa
 * teks yang bisa dipakai, bukan keberhasilan. Ketiadaan field tetap wajar:
 * ketiadaan bukan sinyal, dan pilihannya sendiri masih diperiksa.
 */
function kelasSelesai(nilai: unknown): "wajar" | "ditahan" | "asing" {
  if (nilai === undefined || nilai === null) return "wajar";
  if (typeof nilai === "string" && SELESAI_WAJAR.has(nilai)) return "wajar";
  if (typeof nilai === "string" && SELESAI_DITAHAN.has(nilai)) return "ditahan";
  return "asing";
}

function angka(nilai: unknown): number {
  return typeof nilai === "number" && Number.isFinite(nilai) ? nilai : 0;
}

function bacaUsage(body: GroqResponse): AiUsage {
  const meta = body.usage ?? {};
  return {
    promptTokens: angka(meta.prompt_tokens),
    completionTokens: angka(meta.completion_tokens),
    totalTokens: angka(meta.total_tokens),
  };
}

export function createGroqProvider(config: GroqConfig, fetchImpl?: FetchLike): AiProvider {
  const kirim: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  /** Satu panggilan REST + pemetaan status ke taksonomi error. */
  async function panggil(payload: unknown, timeoutMs: number): Promise<GroqResponse> {
    let response: Response;
    try {
      response = await kirim(`${config.baseUrl}/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          // Key di HEADER, bukan query string: URL berakhir di log akses,
          // pesan error, dan riwayat proxy — header tidak.
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Habis waktu adalah satu-satunya sumber abort di PR ini.
      const jenis = err instanceof Error ? err.name : "Error";
      if (jenis === "TimeoutError" || jenis === "AbortError") {
        throw new AiProviderError("AI_TIMEOUT", GROQ_PROVIDER, { detail: `batas ${timeoutMs} ms` });
      }
      // Hanya NAMA kelas error yang ikut: pesan `fetch` bisa memuat URL.
      throw new AiProviderError("AI_NETWORK_ERROR", GROQ_PROVIDER, { detail: jenis });
    }

    if (!response.ok) {
      // Body balasan gagal TIDAK dibaca sama sekali. Di sini itu bukan sekadar
      // kehati-hatian: bentuk body error Groq tidak terdokumentasi, jadi setiap
      // usaha membacanya adalah tebakan yang bocor ke log bila tebakannya salah.
      const status = response.status;
      if (status === 429) throw new AiProviderError("AI_RATE_LIMIT", GROQ_PROVIDER, { status });
      if (status >= 500) {
        throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", GROQ_PROVIDER, { status });
      }
      throw new AiProviderError("AI_NETWORK_ERROR", GROQ_PROVIDER, {
        status,
        detail: `HTTP ${status}`,
      });
    }

    const body: unknown = await response.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      throw new AiProviderError("AI_NETWORK_ERROR", GROQ_PROVIDER, {
        detail: "balasan bukan JSON",
      });
    }
    return body as GroqResponse;
  }

  /** Bagian bersama chat & JSON mode: susun payload, ambil teks pilihan pertama. */
  async function hasilkanTeks(
    request: AiChatRequest,
    responseFormat?: { type: "json_object" },
  ): Promise<{ text: string; usage: AiUsage }> {
    const body = await panggil(
      {
        model: config.chatModel,
        // Peran system/user/assistant dipakai apa adanya — permukaan
        // kompatibel-OpenAI menerima ketiganya, jadi tidak ada yang perlu
        // diterjemahkan (berbeda dari Gemini yang memisahkan systemInstruction).
        messages: request.messages.map((pesan) => ({
          role: pesan.role,
          content: pesan.content,
        })),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxOutputTokens !== undefined ? { max_tokens: request.maxOutputTokens } : {}),
        ...(responseFormat !== undefined ? { response_format: responseFormat } : {}),
      },
      request.timeoutMs ?? config.timeoutMs,
    );

    const pilihan = Array.isArray(body.choices) ? (body.choices as GroqChoice[]) : [];
    const pertama = pilihan[0];

    // Ditahan penyaring: HTTP-nya 200, jadi memeriksa status saja tidak cukup.
    const kelas = kelasSelesai(pertama?.finish_reason);
    if (kelas === "ditahan") {
      throw new AiProviderError("AI_SAFETY_BLOCK", GROQ_PROVIDER, {
        detail: alasanSelesai(pertama?.finish_reason),
      });
    }
    if (kelas === "asing") {
      // Balasannya utuh, isinya yang tidak bisa dipakai. Dilaporkan, bukan
      // didiamkan sebagai "sukses berteks kosong".
      throw new AiProviderError("AI_INVALID_OUTPUT", GROQ_PROVIDER, {
        detail: `berhenti karena ${alasanSelesai(pertama?.finish_reason)}`,
      });
    }
    if (pertama === undefined) {
      throw new AiProviderError("AI_NETWORK_ERROR", GROQ_PROVIDER, {
        detail: "balasan tanpa pilihan",
      });
    }

    const isi = pertama.message?.content;
    return { text: typeof isi === "string" ? isi : "", usage: bacaUsage(body) };
  }

  return {
    name: GROQ_PROVIDER,

    async chat(request): Promise<AiChatResponse> {
      const { text, usage } = await hasilkanTeks(request);
      return { text, usage, provider: GROQ_PROVIDER, model: config.chatModel };
    },

    async chatJson<T>(request: AiChatRequest, schema: ZodType<T>): Promise<AiJsonResponse<T>> {
      const { text, usage } = await hasilkanTeks(request, { type: "json_object" });

      let mentah: unknown;
      try {
        mentah = JSON.parse(text);
      } catch {
        // Teksnya sendiri TIDAK ikut — ia keluaran model atas prompt yang bisa
        // memuat data pengguna.
        throw new AiProviderError("AI_INVALID_OUTPUT", GROQ_PROVIDER, {
          detail: "keluaran bukan JSON",
        });
      }

      const hasil = schema.safeParse(mentah);
      if (!hasil.success) {
        // Yang dilaporkan hanya JALUR field bermasalah — nama field itu milik
        // skema KITA, bukan isi jawaban model.
        const jalur = hasil.error.issues
          .slice(0, 5)
          .map((issue) => issue.path.join(".") || "(akar)")
          .join(", ");
        throw new AiProviderError("AI_INVALID_OUTPUT", GROQ_PROVIDER, {
          detail: `${hasil.error.issues.length} masalah pada: ${jalur}`,
        });
      }

      return { data: hasil.data, usage, provider: GROQ_PROVIDER, model: config.chatModel };
    },

    /**
     * Groq TIDAK punya endpoint embedding — ini celah kapabilitas, bukan sekadar
     * kebijakan router. Karena itu ia GAGAL LANTANG alih-alih mengembalikan
     * vektor dari model lain: vektor yang tidak sebanding dengan isi kolom
     * `vector(768)` akan mencemari hasil pencocokan diam-diam (ADR-005).
     */
    embed(_request: AiEmbedRequest): Promise<AiEmbedResponse> {
      return Promise.reject(
        new AiProviderError("AI_PROVIDER_UNAVAILABLE", GROQ_PROVIDER, {
          detail: "groq tidak menyediakan model embedding",
        }),
      );
    },
  };
}
