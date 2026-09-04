// core/ai — kemampuan streaming gateway (PR-045, phase-06 L371-436).
//
// Dua hal hidup di sini, dan sengaja dipisah dari `core/http/sse.ts`:
//   1. MEMBACA aliran dari provider (Gemini/Groq mengirim SSE juga, tetapi
//      sebagai balasan HTTP mereka — bukan sebagai respons kita);
//   2. MENYALURKAN potongan itu ke sebuah sesi SSE milik kita.
// `core/http/sse.ts` tidak tahu apa-apa tentang AI, dan berkas ini tidak tahu
// apa-apa tentang `res` milik Express. Yang menyambungkan keduanya cuma
// `alirkanKeSse` di bawah.
//
// ADR-012 tetap berlaku utuh: tidak ada SDK provider, hanya `fetch` ber-DI,
// dan pemanggil di luar `core/ai` tidak pernah melihat nama provider.
import type { AiChatRequest, FetchLike } from "./types.js";
import { AiProviderError } from "./types.js";
import type { SseSesi } from "../http/sse.js";

/**
 * Kemampuan streaming — TERPISAH dari `AiProvider`, bukan ditempelkan padanya.
 *
 * Alasannya bukan kerapian tipe. `AiProvider` dipenuhi juga oleh provider
 * "belum dikonfigurasi" (`gateway.ts`) dan oleh pembungkus breaker/router;
 * memaksa `chatStream` masuk ke sana berarti setiap pembungkus wajib
 * meneruskan kemampuan yang mungkin tidak dimiliki apa pun di baliknya, dan
 * kegagalannya baru terlihat saat dipanggil. Sebagai antarmuka terpisah,
 * "provider ini bisa streaming" menjadi pertanyaan yang bisa DIJAWAB sebelum
 * satu byte pun dikirim — lihat `dukungStream`.
 */
export interface AiStreamProvider {
  readonly name: string;
  /** Potongan teks berurutan. Melempar `AiProviderError` seperti jalur lain. */
  chatStream(request: AiChatRequest): AsyncIterable<string>;
}

export function dukungStream(nilai: unknown): nilai is AiStreamProvider {
  return (
    typeof nilai === "object" &&
    nilai !== null &&
    typeof (nilai as AiStreamProvider).chatStream === "function"
  );
}

/**
 * Irisan `ReadableStream<Uint8Array>` yang dipakai pembaca di bawah.
 *
 * Sempit dengan sengaja (pola `FetchLike`, `QuotaRedisLike`): `Response.body`
 * asli memenuhinya, dan test memberi aliran palsu yang memecah bingkai SSE di
 * tempat-tempat paling jahat — persis di tengah `data:`, di antara `\r` dan
 * `\n` — tanpa perlu server maupun jaringan.
 */
export interface AliranBiner {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock?(): void;
  };
}

/** Sentinel akhir aliran gaya OpenAI; Groq memakainya, Gemini tidak. */
const SELESAI_OPENAI = "[DONE]";

/**
 * Urai balasan SSE provider menjadi muatan `data:` per bingkai.
 *
 * KENAPA INI TIDAK BOLEH DITULIS DENGAN `split("\n")` SAJA. Potongan yang
 * datang dari `fetch` TIDAK sejajar dengan bingkai SSE: satu `read()` bisa
 * berakhir di tengah kata `data`, di antara dua baris, atau membawa tiga
 * bingkai sekaligus. Pembaca yang mengurai per potongan akan bekerja sempurna
 * di test yang memberi satu bingkai per potongan, lalu memotong token secara
 * acak di jaringan nyata — kegagalan yang hanya muncul di 3G, yaitu justru
 * jaringan yang PR ini ada untuk melayaninya. Karena itu ada penyangga sisa
 * (`sisa`) yang dibawa antar potongan.
 */
export async function* uraiAliranSse(aliran: AliranBiner): AsyncGenerator<string> {
  const reader = aliran.getReader();
  const dekoder = new TextDecoder();
  let sisa = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` menahan potongan UTF-8 yang terbelah di batas byte —
      // tanpa itu, satu emoji yang jatuh di tepi potongan menjadi U+FFFD.
      sisa += dekoder.decode(value ?? new Uint8Array(), { stream: true });
      sisa = sisa.replace(/\r\n?/g, "\n");

      let batas = sisa.indexOf("\n\n");
      while (batas !== -1) {
        const bingkai = sisa.slice(0, batas);
        sisa = sisa.slice(batas + 2);
        const muatan = muatanBingkai(bingkai);
        if (muatan !== undefined) yield muatan;
        batas = sisa.indexOf("\n\n");
      }
    }
    // Bingkai terakhir tanpa baris kosong penutup: provider yang menutup
    // koneksi tepat setelah bingkai terakhir tetap tidak boleh kehilangannya.
    const ekor = muatanBingkai(sisa);
    if (ekor !== undefined) yield ekor;
  } finally {
    reader.releaseLock?.();
  }
}

/** Ambil gabungan baris `data:` dari satu bingkai; `undefined` bila bukan data. */
function muatanBingkai(bingkai: string): string | undefined {
  const baris = bingkai.split("\n");
  const data: string[] = [];
  for (const b of baris) {
    if (!b.startsWith("data:")) continue; // komentar/`event:`/`id:` diabaikan
    // Spesifikasi SSE membuang SATU spasi sesudah titik dua, bukan semua.
    const isi = b.slice(5);
    data.push(isi.startsWith(" ") ? isi.slice(1) : isi);
  }
  if (data.length === 0) return undefined;
  return data.join("\n");
}

/**
 * Baca aliran JSON-per-bingkai dan keluarkan potongan teks.
 *
 * `ambil` memetakan satu objek JSON provider menjadi teks — bagian yang
 * berbeda antara Gemini dan Groq; sisanya identik dan tidak perlu ditulis dua
 * kali. Bingkai yang bukan JSON atau tidak memuat teks DILEWATI, tidak
 * membatalkan aliran: provider menyelipkan bingkai metadata (alasan berhenti,
 * penilaian keamanan, cacah token) di antara token, dan menggugurkan jawaban
 * yang sudah setengah jalan karena metadata adalah kegagalan yang dibuat
 * sendiri.
 */
async function* potonganTeks(
  aliran: AliranBiner,
  ambil: (nilai: unknown) => string | undefined,
): AsyncGenerator<string> {
  for await (const muatan of uraiAliranSse(aliran)) {
    if (muatan === SELESAI_OPENAI) return;
    let nilai: unknown;
    try {
      nilai = JSON.parse(muatan);
    } catch {
      continue;
    }
    const teks = ambil(nilai);
    if (teks !== undefined && teks !== "") yield teks;
  }
}

/** Buka aliran HTTP ke provider dan petakan kegagalannya ke taksonomi kita. */
async function bukaAliran(
  kirim: FetchLike,
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<AliranBiner> {
  let response: Response;
  try {
    response = await kirim(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const jenis = err instanceof Error ? err.name : "Error";
    if (jenis === "TimeoutError" || jenis === "AbortError") {
      throw new AiProviderError("AI_TIMEOUT", provider, { detail: `batas ${timeoutMs} ms` });
    }
    // Hanya NAMA kelas error yang ikut: pesan `fetch` bisa memuat URL berkunci.
    throw new AiProviderError("AI_NETWORK_ERROR", provider, { detail: jenis });
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new AiProviderError("AI_RATE_LIMIT", provider, { status });
    if (status >= 500) throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", provider, { status });
    throw new AiProviderError("AI_NETWORK_ERROR", provider, {
      status,
      detail: `HTTP ${status}`,
    });
  }

  const body = response.body as AliranBiner | null;
  if (body === null) {
    throw new AiProviderError("AI_NETWORK_ERROR", provider, { detail: "balasan tanpa badan" });
  }
  return body;
}

/** Bentuk potongan Gemini yang kita baca — sisanya sengaja tidak dipetakan. */
function teksGemini(nilai: unknown): string | undefined {
  const kandidat = (nilai as { candidates?: unknown })?.candidates;
  if (!Array.isArray(kandidat) || kandidat.length === 0) return undefined;
  const bagian = (kandidat[0] as { content?: { parts?: unknown } })?.content?.parts;
  if (!Array.isArray(bagian)) return undefined;
  return bagian
    .map((p) => (p as { text?: unknown })?.text)
    .filter((t): t is string => typeof t === "string")
    .join("");
}

/** Bentuk potongan Groq (kompatibel OpenAI). */
function teksGroq(nilai: unknown): string | undefined {
  const pilihan = (nilai as { choices?: unknown })?.choices;
  if (!Array.isArray(pilihan) || pilihan.length === 0) return undefined;
  const isi = (pilihan[0] as { delta?: { content?: unknown } })?.delta?.content;
  return typeof isi === "string" ? isi : undefined;
}

export interface GeminiStreamConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  timeoutMs: number;
}

export function createGeminiStream(
  config: GeminiStreamConfig,
  fetchImpl?: FetchLike,
): AiStreamProvider {
  const kirim: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  return {
    name: "gemini",
    async *chatStream(request) {
      const contents = request.messages
        .filter((p) => p.role !== "system")
        .map((p) => ({
          role: p.role === "assistant" ? "model" : "user",
          parts: [{ text: p.content }],
        }));
      const instruksi = request.messages.filter((p) => p.role === "system");
      const body: Record<string, unknown> = { contents };
      if (instruksi.length > 0) {
        body["systemInstruction"] = { parts: instruksi.map((p) => ({ text: p.content })) };
      }
      const generationConfig: Record<string, unknown> = {};
      if (request.temperature !== undefined) generationConfig["temperature"] = request.temperature;
      if (request.maxOutputTokens !== undefined) {
        generationConfig["maxOutputTokens"] = request.maxOutputTokens;
      }
      if (Object.keys(generationConfig).length > 0) body["generationConfig"] = generationConfig;

      // `alt=sse` WAJIB: tanpa itu `streamGenerateContent` membalas satu larik
      // JSON utuh di akhir — secara teknis "streaming", secara pengalaman sama
      // saja dengan menunggu, yaitu persis yang PR ini hendak hilangkan.
      const aliran = await bukaAliran(
        kirim,
        "gemini",
        `${config.baseUrl}/v1beta/models/${config.chatModel}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            // Key di HEADER, bukan query: URL berakhir di log akses dan proxy.
            "x-goog-api-key": config.apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
        request.timeoutMs ?? config.timeoutMs,
      );
      yield* potonganTeks(aliran, teksGemini);
    },
  };
}

export interface GroqStreamConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  timeoutMs: number;
}

export function createGroqStream(
  config: GroqStreamConfig,
  fetchImpl?: FetchLike,
): AiStreamProvider {
  const kirim: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  return {
    name: "groq",
    async *chatStream(request) {
      const body: Record<string, unknown> = {
        model: config.chatModel,
        stream: true,
        messages: request.messages.map((p) => ({ role: p.role, content: p.content })),
      };
      if (request.temperature !== undefined) body["temperature"] = request.temperature;
      if (request.maxOutputTokens !== undefined) body["max_tokens"] = request.maxOutputTokens;

      const aliran = await bukaAliran(
        kirim,
        "groq",
        `${config.baseUrl}/openai/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
        request.timeoutMs ?? config.timeoutMs,
      );
      yield* potonganTeks(aliran, teksGroq);
    },
  };
}

/**
 * Router streaming: cadangan HANYA sebelum token pertama.
 *
 * Ini aturan korektness, bukan penyederhanaan. Begitu satu token sudah
 * terkirim ke klien, berpindah provider berarti menyambung dua jawaban dari
 * dua model yang berbeda menjadi satu paragraf — hasilnya kalimat yang
 * berubah arah di tengah, dan tidak ada satu pun cara bagi klien untuk
 * mengetahuinya. Kegagalan SESUDAH token pertama karena itu WAJIB muncul
 * sebagai galat (AC-4), bukan diselamatkan diam-diam.
 */
export function createAiStreamRouter(
  utama: AiStreamProvider,
  cadangan?: AiStreamProvider,
): AiStreamProvider {
  return {
    name: utama.name,
    async *chatStream(request) {
      let adaToken = false;
      try {
        for await (const potongan of utama.chatStream(request)) {
          adaToken = true;
          yield potongan;
        }
        return;
      } catch (err) {
        if (adaToken || cadangan === undefined) throw err;
      }
      yield* cadangan.chatStream(request);
    },
  };
}

/**
 * Salurkan potongan ke sesi SSE. Ini satu-satunya titik temu dua berkas.
 *
 * Kegagalan di tengah aliran diterjemahkan menjadi event `error` terstruktur
 * (AC-4) dan BUKAN lemparan: pemanggilnya adalah sebuah handler HTTP yang
 * header-nya sudah terkirim, jadi melempar ke `errorHandler` di titik ini
 * hanya menghasilkan respons kedua yang tidak akan pernah sampai.
 */
export async function alirkanKeSse(
  sesi: SseSesi,
  sumber: AsyncIterable<string>,
  event = "token",
): Promise<void> {
  try {
    for await (const potongan of sumber) {
      await sesi.kirim(potongan, event);
    }
    await sesi.selesai();
  } catch (err) {
    const kode = err instanceof AiProviderError ? err.code : "AI_NETWORK_ERROR";
    // Pesan provider TIDAK diteruskan apa adanya: ia bisa memuat URL, nama
    // model, atau potongan permintaan. Klien menerima kode + kalimat kita.
    await sesi.galat(
      kode,
      "Jawaban AI terhenti di tengah jalan",
      "Coba kirim ulang, atau lanjutkan tanpa bantuan AI",
    );
  }
}
