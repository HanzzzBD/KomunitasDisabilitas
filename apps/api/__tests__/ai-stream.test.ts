// Streaming gateway AI — PR-045 (`core/ai/stream.ts`).
//
// Semua di sini memakai `FetchLike` + aliran palsu, sesuai aturan repo: tidak
// ada msw, tidak ada nock, tidak ada jaringan. Yang penting bukan cuma "bisa
// mengurai SSE", melainkan bisa menguraikannya ketika potongan dari `fetch`
// TIDAK sejajar dengan bingkai — sebab itulah yang terjadi di 3G, dan itulah
// jaringan yang PR ini ada untuk melayaninya.
import { describe, it, expect, vi } from "vitest";
import {
  alirkanKeSse,
  createAiStreamRouter,
  createGeminiStream,
  createGroqStream,
  dukungStream,
  uraiAliranSse,
  type AiStreamProvider,
  type AliranBiner,
} from "../src/core/ai/stream.js";
import { AiProviderError, type FetchLike } from "../src/core/ai/types.js";
import type { SseSesi } from "../src/core/http/sse.js";

/** Aliran palsu yang mengeluarkan potongan PERSIS seperti yang diminta test. */
function aliranDari(potongan: readonly string[]): AliranBiner {
  const enc = new TextEncoder();
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i >= potongan.length) return { done: true };
          const nilai = enc.encode(potongan[i]);
          i += 1;
          return { done: false, value: nilai };
        },
      };
    },
  };
}

function fetchAliran(potongan: readonly string[], status = 200): FetchLike {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      body: aliranDari(potongan),
    }) as unknown as Response) as FetchLike;
}

function sesiPalsu() {
  const terkirim: Array<{ data: string; event?: string }> = [];
  const galat: Array<{ kode: string; pesan: string }> = [];
  let usai = false;
  const sesi = {
    id: "uji",
    idTerakhir: 0,
    terpasang: true,
    async lampirkan() {},
    async kirim(data: string, event?: string) {
      terkirim.push({ data, event });
    },
    async galat(kode: string, pesan: string) {
      galat.push({ kode, pesan });
    },
    async selesai() {
      usai = true;
    },
  } as unknown as SseSesi;
  return { sesi, terkirim, galat, usai: () => usai };
}

const PERMINTAAN = { messages: [{ role: "user" as const, content: "halo" }] };

async function kumpulkan(iter: AsyncIterable<string>): Promise<string[]> {
  const hasil: string[] = [];
  for await (const p of iter) hasil.push(p);
  return hasil;
}

describe("uraiAliranSse — pembingkaian ulang", () => {
  it("menyusun ulang bingkai yang TERBELAH antar potongan", async () => {
    // Kasus yang membedakan pembaca sungguhan dari yang cuma lulus test:
    // `fetch` memotong di mana saja, termasuk di tengah kata `data`.
    const aliran = aliranDari(["da", "ta: hal", "o\n", "\ndata: dunia\n\n"]);
    expect(await kumpulkan(uraiAliranSse(aliran))).toEqual(["halo", "dunia"]);
  });

  it("menggabungkan beberapa baris data dalam satu bingkai", async () => {
    const aliran = aliranDari(["data: a\ndata: b\n\n"]);
    expect(await kumpulkan(uraiAliranSse(aliran))).toEqual(["a\nb"]);
  });

  it("menerima CRLF dan mengabaikan komentar serta field lain", async () => {
    const aliran = aliranDari([": detak\r\n\r\n", "id: 4\r\nevent: x\r\ndata: isi\r\n\r\n"]);
    expect(await kumpulkan(uraiAliranSse(aliran))).toEqual(["isi"]);
  });

  it("bingkai terakhir TANPA baris kosong penutup tidak hilang", async () => {
    // Provider yang menutup koneksi tepat sesudah bingkai terakhir tetap tidak
    // boleh membuat token terakhir menguap.
    const aliran = aliranDari(["data: terakhir"]);
    expect(await kumpulkan(uraiAliranSse(aliran))).toEqual(["terakhir"]);
  });

  it("beberapa bingkai dalam SATU potongan semuanya keluar", async () => {
    const aliran = aliranDari(["data: a\n\ndata: b\n\ndata: c\n\n"]);
    expect(await kumpulkan(uraiAliranSse(aliran))).toEqual(["a", "b", "c"]);
  });
});

describe("pemetaan potongan provider", () => {
  const konfigGemini = {
    apiKey: "k",
    baseUrl: "https://gemini.test",
    chatModel: "m",
    timeoutMs: 1000,
  };
  const konfigGroq = { apiKey: "k", baseUrl: "https://groq.test", chatModel: "m", timeoutMs: 1000 };

  it("Gemini: mengambil teks dari candidates[].content.parts[]", async () => {
    const p = createGeminiStream(
      konfigGemini,
      fetchAliran([
        'data: {"candidates":[{"content":{"parts":[{"text":"ha"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n',
      ]),
    );
    expect(await kumpulkan(p.chatStream(PERMINTAAN))).toEqual(["ha", "lo"]);
  });

  it("Groq: mengambil teks dari choices[].delta.content dan berhenti di [DONE]", async () => {
    const p = createGroqStream(
      konfigGroq,
      fetchAliran([
        'data: {"choices":[{"delta":{"content":"ha"}}]}\n\n',
        "data: [DONE]\n\n",
        'data: {"choices":[{"delta":{"content":"TIDAK BOLEH"}}]}\n\n',
      ]),
    );
    expect(await kumpulkan(p.chatStream(PERMINTAAN))).toEqual(["ha"]);
  });

  it("bingkai metadata / bukan JSON DILEWATI, aliran tetap jalan", async () => {
    // Provider menyelipkan alasan berhenti dan penilaian keamanan di antara
    // token. Menggugurkan jawaban yang sudah setengah jalan karena metadata
    // adalah kegagalan yang dibuat sendiri.
    const p = createGeminiStream(
      konfigGemini,
      fetchAliran([
        'data: {"candidates":[{"content":{"parts":[{"text":"a"}]}}]}\n\n',
        "data: bukan-json\n\n",
        'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"b"}]}}]}\n\n',
      ]),
    );
    expect(await kumpulkan(p.chatStream(PERMINTAAN))).toEqual(["a", "b"]);
  });

  it("Gemini memakai alt=sse dan menaruh kunci di HEADER, bukan di URL", async () => {
    // Kunci sengaja PANJANG dan khas: `"k"` satu huruf bisa lolos
    // `not.toContain` secara kebetulan, dan assertion yang lulus karena
    // kebetulan tidak menjaga apa pun.
    const KUNCI = "rahasia-kunci-gemini-xyz789";
    const kirim = vi.fn(fetchAliran(["data: {}\n\n"]));
    const p = createGeminiStream({ ...konfigGemini, apiKey: KUNCI }, kirim as unknown as FetchLike);
    await kumpulkan(p.chatStream(PERMINTAAN));

    const [url, init] = kirim.mock.calls[0] as [string, RequestInit];
    // Tanpa `alt=sse`, Gemini membalas satu larik JSON di akhir — secara teknis
    // "streaming", secara pengalaman sama saja dengan menunggu.
    expect(url).toContain("streamGenerateContent");
    expect(url).toContain("alt=sse");
    // URL berakhir di log akses dan riwayat proxy; kunci tidak boleh ada di sana.
    expect(url).not.toContain(KUNCI);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KUNCI);
  });

  it("status gagal dipetakan ke taksonomi error, bukan dilempar mentah", async () => {
    const p = createGeminiStream(konfigGemini, fetchAliran([], 429));
    await expect(kumpulkan(p.chatStream(PERMINTAAN))).rejects.toMatchObject({
      code: "AI_RATE_LIMIT",
    });

    const q = createGeminiStream(konfigGemini, fetchAliran([], 503));
    await expect(kumpulkan(q.chatStream(PERMINTAAN))).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });
  });
});

describe("dukungStream", () => {
  it("membedakan provider yang bisa streaming dari yang tidak", () => {
    expect(dukungStream({ name: "x", chatStream: () => [] })).toBe(true);
    expect(dukungStream({ name: "x", chat: () => [] })).toBe(false);
    expect(dukungStream(null)).toBe(false);
  });
});

describe("createAiStreamRouter — cadangan HANYA sebelum token pertama", () => {
  function providerPalsu(nama: string, potongan: string[], gagalDi?: number): AiStreamProvider {
    return {
      name: nama,
      // eslint-disable-next-line @typescript-eslint/require-await
      async *chatStream() {
        for (let i = 0; i < potongan.length; i += 1) {
          if (gagalDi === i) throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", nama);
          yield potongan[i] as string;
        }
      },
    };
  }

  it("gagal SEBELUM token pertama → cadangan dipakai", async () => {
    const utama = providerPalsu("utama", ["x"], 0);
    const cadangan = providerPalsu("cadangan", ["a", "b"]);
    const router = createAiStreamRouter(utama, cadangan);

    expect(await kumpulkan(router.chatStream(PERMINTAAN))).toEqual(["a", "b"]);
  });

  it("gagal SESUDAH token pertama → dilempar, cadangan TIDAK dipakai", async () => {
    // Aturan korektness, bukan penyederhanaan: menyambung dua jawaban dari dua
    // model menjadi satu paragraf menghasilkan kalimat yang berubah arah di
    // tengah, dan klien tidak punya cara apa pun untuk mengetahuinya.
    const utama = providerPalsu("utama", ["a", "b"], 1);
    const cadangan = providerPalsu("cadangan", ["JANGAN"]);
    const router = createAiStreamRouter(utama, cadangan);

    const hasil: string[] = [];
    await expect(
      (async () => {
        for await (const p of router.chatStream(PERMINTAAN)) hasil.push(p);
      })(),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });

    expect(hasil).toEqual(["a"]);
    expect(hasil).not.toContain("JANGAN");
  });

  it("tanpa cadangan, kegagalan awal tetap dilempar", async () => {
    const router = createAiStreamRouter(providerPalsu("utama", ["x"], 0));
    await expect(kumpulkan(router.chatStream(PERMINTAAN))).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });
  });
});

describe("alirkanKeSse — jembatan ke sesi SSE", () => {
  async function* sumber(...potongan: string[]): AsyncGenerator<string> {
    for (const p of potongan) yield p;
  }

  it("menyalurkan tiap potongan sebagai event lalu menutup normal", async () => {
    const s = sesiPalsu();
    await alirkanKeSse(s.sesi, sumber("ha", "lo"));

    expect(s.terkirim).toEqual([
      { data: "ha", event: "token" },
      { data: "lo", event: "token" },
    ]);
    expect(s.usai()).toBe(true);
    expect(s.galat).toHaveLength(0);
  });

  it("galat mid-stream menjadi event error, BUKAN lemparan", async () => {
    // Header sudah terkirim di titik ini, jadi melempar ke `errorHandler` cuma
    // menghasilkan respons kedua yang tidak akan pernah sampai.
    async function* meledak(): AsyncGenerator<string> {
      yield "sebagian";
      throw new AiProviderError("AI_TIMEOUT", "gemini", { detail: "batas 1000 ms" });
    }
    const s = sesiPalsu();

    await expect(alirkanKeSse(s.sesi, meledak())).resolves.toBeUndefined();

    expect(s.terkirim).toEqual([{ data: "sebagian", event: "token" }]);
    expect(s.galat[0]?.kode).toBe("AI_TIMEOUT");
    expect(s.usai()).toBe(false);
  });

  it("pesan provider TIDAK diteruskan ke klien", async () => {
    // Pesan `AiProviderError` bisa memuat nama model, batas waktu, atau
    // potongan permintaan. Klien menerima kode + kalimat kita sendiri.
    async function* meledak(): AsyncGenerator<string> {
      yield "x";
      throw new AiProviderError("AI_TIMEOUT", "gemini", { detail: "rahasia-internal" });
    }
    const s = sesiPalsu();
    await alirkanKeSse(s.sesi, meledak());

    expect(s.galat[0]?.pesan).not.toContain("rahasia-internal");
    expect(s.galat[0]?.pesan).not.toContain("gemini");
  });

  it("kegagalan bukan AiProviderError tetap menjadi event error terstruktur", async () => {
    async function* meledak(): AsyncGenerator<string> {
      yield "x";
      throw new TypeError("bug kami sendiri");
    }
    const s = sesiPalsu();
    await alirkanKeSse(s.sesi, meledak());

    expect(s.galat[0]?.kode).toBe("AI_NETWORK_ERROR");
    expect(s.galat[0]?.pesan).not.toContain("bug kami sendiri");
  });
});
