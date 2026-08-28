// core/ai — adapter Gemini (PR-041, ADR-005): chat, JSON mode, embedding 768.
//
// REST langsung lewat `fetch` ber-DI, BUKAN SDK. Alasannya bukan selera:
// seluruh panggilan HTTP keluar di repo ini (Fonnte, Twilio, Google) memakai
// `FetchLike` yang disuntik, dan test-nya memakai `vi.fn()` tanpa satu pun
// infrastruktur mock server. SDK menyembunyikan transport-nya di balik lapisan
// yang tidak bisa disuntik lewat celah yang sama, jadi memakainya berarti
// memasukkan mekanisme mock baru — untuk keuntungan yang tidak ada, sebab yang
// kita butuhkan dari Gemini hanya dua endpoint dan pemetaan statusnya.
//
// Balasan Gemini adalah MASUKAN TAK TEPERCAYA. Tidak ada satu pun potongan
// body-nya yang boleh masuk pesan error atau log — lihat AiProviderError.
import type { ZodType } from "zod";
import {
  AI_EMBED_DIMENSIONS,
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

export const GEMINI_PROVIDER = "gemini";

export interface GeminiConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  /** Batas tunggu bawaan; tiap panggilan boleh menimpanya. */
  timeoutMs: number;
}

/** Bentuk balasan yang KITA baca — sisanya sengaja tidak dipetakan. */
interface GeminiPart {
  text?: unknown;
}
interface GeminiCandidate {
  content?: { parts?: unknown } | null;
  finishReason?: unknown;
}
interface GeminiResponse {
  candidates?: unknown;
  promptFeedback?: { blockReason?: unknown } | null;
  usageMetadata?: {
    promptTokenCount?: unknown;
    candidatesTokenCount?: unknown;
    totalTokenCount?: unknown;
  } | null;
  embedding?: { values?: unknown } | null;
}

/**
 * Alasan blokir/berhenti dari provider (mis. "SAFETY", "OTHER"). Disaring ke
 * bentuk enum — HURUF BESAR/garis bawah saja — supaya teks bebas dari provider
 * tidak punya jalan masuk ke pesan error kita. Ini bukan kehati-hatian
 * berlebihan: satu-satunya cara menjamin body provider tidak bocor adalah tidak
 * pernah meneruskan string yang bentuknya tidak kita pastikan sendiri.
 */
function alasanBlokir(nilai: unknown): string {
  return typeof nilai === "string" && /^[A-Z_]{1,40}$/.test(nilai) ? nilai : "TIDAK_DIKETAHUI";
}

/**
 * `finishReason` yang berarti generasi SELESAI WAJAR. MAX_TOKENS ikut: teksnya
 * terpenggal, tapi pemanggillah yang meminta batas itu lewat `maxOutputTokens`.
 */
const SELESAI_WAJAR = new Set(["STOP", "MAX_TOKENS"]);

/**
 * `finishReason` yang berarti jawaban DITAHAN penyaring provider. Gemini tidak
 * memakai satu nilai saja: "SAFETY" hanyalah yang paling sering terlihat.
 * Semuanya berujung pada tindak lanjut yang sama — JANGAN diulang, karena
 * permintaan yang sama akan ditahan lagi.
 */
const SELESAI_DITAHAN = new Set([
  "SAFETY",
  "RECITATION",
  "LANGUAGE",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

/**
 * Kelaskan `finishReason` kandidat. Nilai yang TIDAK dikenal sengaja tidak
 * dianggap wajar: enum ini bertambah tanpa pemberitahuan, dan setiap nilai baru
 * sejauh ini menandai generasi yang gagal, bukan yang berhasil. Menganggapnya
 * wajar berarti mengembalikan teks kosong sebagai "sukses" — pemanggil lalu
 * tidak punya cara membedakan "model ditahan" dari "model memang menjawab
 * kosong". Tidak adanya `finishReason` sama sekali tetap dianggap wajar:
 * ketiadaan field bukan sinyal, dan kandidatnya sendiri masih diperiksa.
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

function bacaUsage(body: GeminiResponse): AiUsage {
  const meta = body.usageMetadata ?? {};
  return {
    promptTokens: angka(meta.promptTokenCount),
    completionTokens: angka(meta.candidatesTokenCount),
    totalTokens: angka(meta.totalTokenCount),
  };
}

/** Gabungkan `parts[].text` kandidat pertama. Kosong = dianggap tanpa teks. */
function bacaTeks(kandidat: GeminiCandidate): string {
  const parts = kandidat.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: unknown) => {
      const teks = (part as GeminiPart | null)?.text;
      return typeof teks === "string" ? teks : "";
    })
    .join("");
}

export function createGeminiProvider(config: GeminiConfig, fetchImpl?: FetchLike): AiProvider {
  const kirim: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));

  /** Satu panggilan REST + pemetaan status ke taksonomi error. */
  async function panggil(
    method: "generateContent" | "embedContent",
    model: string,
    payload: unknown,
    timeoutMs: number,
  ): Promise<GeminiResponse> {
    let response: Response;
    try {
      response = await kirim(`${config.baseUrl}/v1beta/models/${model}:${method}`, {
        method: "POST",
        headers: {
          // Key di HEADER, bukan query string: URL berakhir di log akses,
          // pesan error, dan riwayat proxy — header tidak.
          "x-goog-api-key": config.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Habis waktu adalah SATU-SATUNYA sumber abort di PR ini (pembatalan dari
      // pemanggil belum ada), jadi abort apa pun dipetakan ke AI_TIMEOUT.
      const jenis = err instanceof Error ? err.name : "Error";
      if (jenis === "TimeoutError" || jenis === "AbortError") {
        throw new AiProviderError("AI_TIMEOUT", GEMINI_PROVIDER, {
          detail: `batas ${timeoutMs} ms`,
        });
      }
      // Hanya NAMA kelas error yang ikut: pesan `fetch` bisa memuat URL.
      throw new AiProviderError("AI_NETWORK_ERROR", GEMINI_PROVIDER, { detail: jenis });
    }

    if (!response.ok) {
      // Body balasan gagal TIDAK dibaca sama sekali — tidak ada yang kita
      // butuhkan di sana, dan segala yang dibaca berisiko ikut ke log.
      const status = response.status;
      if (status === 429) throw new AiProviderError("AI_RATE_LIMIT", GEMINI_PROVIDER, { status });
      if (status >= 500) {
        throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", GEMINI_PROVIDER, { status });
      }
      throw new AiProviderError("AI_NETWORK_ERROR", GEMINI_PROVIDER, {
        status,
        detail: `HTTP ${status}`,
      });
    }

    const body: unknown = await response.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      throw new AiProviderError("AI_NETWORK_ERROR", GEMINI_PROVIDER, {
        detail: "balasan bukan JSON",
      });
    }
    return body as GeminiResponse;
  }

  /** Bagian bersama chat & JSON mode: susun payload, ambil teks kandidat. */
  async function hasilkanTeks(
    request: AiChatRequest,
    responseMimeType?: string,
  ): Promise<{ text: string; usage: AiUsage }> {
    const contents = request.messages
      .filter((pesan) => pesan.role !== "system")
      .map((pesan) => ({
        role: pesan.role === "assistant" ? "model" : "user",
        parts: [{ text: pesan.content }],
      }));
    const instruksi = request.messages.filter((pesan) => pesan.role === "system");

    const body = await panggil(
      "generateContent",
      config.chatModel,
      {
        contents,
        ...(instruksi.length > 0
          ? { systemInstruction: { parts: instruksi.map((pesan) => ({ text: pesan.content })) } }
          : {}),
        generationConfig: {
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(request.maxOutputTokens !== undefined
            ? { maxOutputTokens: request.maxOutputTokens }
            : {}),
          ...(responseMimeType !== undefined ? { responseMimeType } : {}),
        },
      },
      request.timeoutMs ?? config.timeoutMs,
    );

    const kandidat = Array.isArray(body.candidates) ? (body.candidates as GeminiCandidate[]) : [];
    const pertama = kandidat[0];

    // Diblokir penyaring keamanan: HTTP-nya 200, jadi memeriksa status saja
    // tidak cukup. Dua bentuknya — blokir prompt (tanpa kandidat) dan blokir
    // jawaban (finishReason dari SELESAI_DITAHAN) — sama-sama tidak boleh
    // diulang.
    const blockReason = body.promptFeedback?.blockReason;
    if (blockReason !== undefined && blockReason !== null) {
      throw new AiProviderError("AI_SAFETY_BLOCK", GEMINI_PROVIDER, {
        detail: alasanBlokir(blockReason),
      });
    }
    const alasanSelesai = pertama?.finishReason;
    const kelas = kelasSelesai(alasanSelesai);
    if (kelas === "ditahan") {
      throw new AiProviderError("AI_SAFETY_BLOCK", GEMINI_PROVIDER, {
        detail: alasanBlokir(alasanSelesai),
      });
    }
    if (kelas === "asing") {
      // Generasi berhenti karena sebab yang tidak kita kenali. Bukan blokir
      // (jadi bukan AI_SAFETY_BLOCK), bukan pula masalah transport — balasannya
      // utuh, isinya yang tidak bisa dipakai. Dilaporkan, bukan didiamkan.
      throw new AiProviderError("AI_INVALID_OUTPUT", GEMINI_PROVIDER, {
        detail: `berhenti karena ${alasanBlokir(alasanSelesai)}`,
      });
    }
    if (pertama === undefined) {
      // Bentuk tak terduga (bukan blokir, bukan error HTTP). Dilaporkan sebagai
      // kegagalan, bukan dibiarkan menjadi TypeError di kedalaman pemanggil.
      throw new AiProviderError("AI_NETWORK_ERROR", GEMINI_PROVIDER, {
        detail: "balasan tanpa kandidat",
      });
    }

    return { text: bacaTeks(pertama), usage: bacaUsage(body) };
  }

  return {
    name: GEMINI_PROVIDER,

    async chat(request): Promise<AiChatResponse> {
      const { text, usage } = await hasilkanTeks(request);
      return { text, usage, provider: GEMINI_PROVIDER, model: config.chatModel };
    },

    async chatJson<T>(request: AiChatRequest, schema: ZodType<T>): Promise<AiJsonResponse<T>> {
      const { text, usage } = await hasilkanTeks(request, "application/json");

      let mentah: unknown;
      try {
        mentah = JSON.parse(text);
      } catch {
        // Teksnya sendiri TIDAK ikut — ia keluaran model atas prompt yang bisa
        // memuat data pengguna.
        throw new AiProviderError("AI_INVALID_OUTPUT", GEMINI_PROVIDER, {
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
        throw new AiProviderError("AI_INVALID_OUTPUT", GEMINI_PROVIDER, {
          detail: `${hasil.error.issues.length} masalah pada: ${jalur}`,
        });
      }

      return { data: hasil.data, usage, provider: GEMINI_PROVIDER, model: config.chatModel };
    },

    async embed(request: AiEmbedRequest): Promise<AiEmbedResponse> {
      const body = await panggil(
        "embedContent",
        config.embedModel,
        {
          model: `models/${config.embedModel}`,
          content: { parts: [{ text: request.text }] },
        },
        request.timeoutMs ?? config.timeoutMs,
      );

      const values = body.embedding?.values;
      const vector = Array.isArray(values)
        ? values.filter((nilai): nilai is number => typeof nilai === "number")
        : [];

      // Panjang salah TIDAK dipotong atau ditambal: vektor yang "hampir benar"
      // tetap masuk kolom vector(768) dan mencemari hasil pencocokan diam-diam.
      if (vector.length !== AI_EMBED_DIMENSIONS) {
        throw new AiProviderError("AI_INVALID_OUTPUT", GEMINI_PROVIDER, {
          detail: `panjang vektor ${vector.length}, seharusnya ${AI_EMBED_DIMENSIONS}`,
        });
      }

      return {
        vector,
        dimensions: AI_EMBED_DIMENSIONS,
        provider: GEMINI_PROVIDER,
        model: config.embedModel,
      };
    },
  };
}
