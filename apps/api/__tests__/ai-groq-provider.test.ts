// PR-042 — contract test adapter Groq terhadap skema balasan yang riil.
//
// MEKANISME MOCK: `FetchLike` yang disuntik, pola yang sama dengan
// `ai-gemini-provider.test.ts`. Yang diuji bukan bahwa fetch dipanggil,
// melainkan bahwa BENTUK balasan Groq yang sebenarnya — `choices[].message`,
// `finish_reason`, `usage.*_tokens` — diterjemahkan ke kontrak KITA, dan bahwa
// tidak sepotong pun istilah khas Groq/OpenAI lolos melewati adapter.
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createGroqProvider } from "../src/core/ai/providers/groq.js";
import type { AiChatRequest, FetchLike } from "../src/core/ai/types.js";

const KONFIG = {
  apiKey: "kunci-groq-rahasia",
  baseUrl: "https://groq.contoh.invalid",
  chatModel: "llama-3.3-70b-versatile",
  timeoutMs: 2000,
};

const PERMINTAAN: AiChatRequest = {
  messages: [
    { role: "system", content: "Jawab ringkas." },
    { role: "user", content: "Sebutkan tiga keterampilan." },
  ],
};

/**
 * Penanda unik yang ditanam di body balasan provider. Setiap test kegagalan
 * memastikan penanda ini TIDAK muncul di pesan error — itulah cara kita
 * membuktikan larangan membocorkan payload, bukan dengan membacanya.
 */
const PENANDA_BODY = "JEJAK-BODY-GROQ-c0ffee";

function balas(body: unknown, status = 200): FetchLike {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

const BALASAN_CHAT = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1_700_000_000,
  model: "llama-3.3-70b-versatile",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Komunikasi, ketelitian, kerja sama." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
};

describe("createGroqProvider — chat", () => {
  it("balasan chat.completion menjadi respons bertipe (teks + pemakaian token)", async () => {
    const provider = createGroqProvider(KONFIG, vi.fn(balas(BALASAN_CHAT)));

    await expect(provider.chat(PERMINTAAN)).resolves.toEqual({
      text: "Komunikasi, ketelitian, kerja sama.",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
    });
  });

  it("tidak ada field khas Groq/OpenAI yang lolos melewati adapter", async () => {
    // AC-5: bentuk respons harus sama persis dengan yang dihasilkan Gemini.
    // `id`, `object`, `created`, `choices`, `finish_reason` berhenti di sini —
    // pemanggil yang bisa melihatnya akan mulai bergantung padanya.
    const provider = createGroqProvider(KONFIG, vi.fn(balas(BALASAN_CHAT)));
    const hasil = await provider.chat(PERMINTAAN);

    expect(Object.keys(hasil).sort()).toEqual(["model", "provider", "text", "usage"]);
    expect(Object.keys(hasil.usage).sort()).toEqual([
      "completionTokens",
      "promptTokens",
      "totalTokens",
    ]);
  });

  it("API key dikirim di header Authorization, TIDAK pernah di URL", async () => {
    const fetchMock = vi.fn(balas(BALASAN_CHAT));
    await createGroqProvider(KONFIG, fetchMock).chat(PERMINTAAN);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://groq.contoh.invalid/openai/v1/chat/completions");
    // URL berakhir di log akses & riwayat proxy; header tidak.
    expect(url).not.toContain(KONFIG.apiKey);
    expect(init.headers).toMatchObject({ authorization: `Bearer ${KONFIG.apiKey}` });
  });

  it("peran system/user/assistant dikirim apa adanya (permukaan kompatibel-OpenAI)", async () => {
    const fetchMock = vi.fn(balas(BALASAN_CHAT));
    await createGroqProvider(KONFIG, fetchMock).chat({
      messages: [
        { role: "system", content: "Jadilah ringkas." },
        { role: "assistant", content: "Sebelumnya saya bilang begini." },
        { role: "user", content: "Lanjutkan." },
      ],
    });

    const body: unknown = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toMatchObject({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system" }, { role: "assistant" }, { role: "user" }],
    });
  });

  it("field yang TIDAK didukung Groq tidak pernah dikirim", async () => {
    // `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name`, dan n > 1
    // ditolak/diabaikan Groq. Mengirimnya berarti mempertaruhkan panggilan pada
    // perilaku yang tidak dijanjikan siapa pun.
    const fetchMock = vi.fn(balas(BALASAN_CHAT));
    await createGroqProvider(KONFIG, fetchMock).chat({
      ...PERMINTAAN,
      temperature: 0.2,
      maxOutputTokens: 256,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "temperature"]);
    for (const pesan of body.messages as Record<string, unknown>[]) {
      expect(Object.keys(pesan).sort()).toEqual(["content", "role"]);
    }
  });
});

describe("createGroqProvider — embed", () => {
  it("selalu AI_PROVIDER_UNAVAILABLE: Groq tidak punya endpoint embedding", async () => {
    // Celah kapabilitas, bukan sekadar kebijakan router. Gagal lantang, karena
    // vektor dari model lain tidak sebanding dengan isi kolom vector(768).
    const fetchMock = vi.fn(balas(BALASAN_CHAT));
    const err = await createGroqProvider(KONFIG, fetchMock)
      .embed({ text: "apa saja" })
      .catch((e: unknown) => e);

    expect(err).toMatchObject({
      name: "AiProviderError",
      code: "AI_PROVIDER_UNAVAILABLE",
      provider: "groq",
    });
    // Tidak ada panggilan jaringan sama sekali — ia gagal sebelum menyentuh apa pun.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createGroqProvider — JSON mode (validasi zod di batas)", () => {
  const skema = z.object({ skills: z.array(z.string()), tahunPengalaman: z.number() });
  const teksJson = (isi: string): unknown => ({
    choices: [{ index: 0, message: { role: "assistant", content: isi }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
  });

  it("keluaran sah lolos zod dan keluar sebagai data bertipe", async () => {
    const provider = createGroqProvider(
      KONFIG,
      vi.fn(balas(teksJson('{"skills":["Excel"],"tahunPengalaman":3}'))),
    );

    const hasil = await provider.chatJson(PERMINTAAN, skema);
    expect(hasil.data).toEqual({ skills: ["Excel"], tahunPengalaman: 3 });
    expect(Object.keys(hasil).sort()).toEqual(["data", "model", "provider", "usage"]);
  });

  it("keluaran gagal zod = AI_INVALID_OUTPUT tanpa membocorkan keluaran model", async () => {
    const provider = createGroqProvider(
      KONFIG,
      vi.fn(balas(teksJson(`{"skills":"${PENANDA_BODY}","tahunPengalaman":"tiga"}`))),
    );

    const err = await provider.chatJson(PERMINTAAN, skema).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_INVALID_OUTPUT" });
    expect((err as Error).message).toContain("skills");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("keluaran bukan JSON = AI_INVALID_OUTPUT, bukan SyntaxError", async () => {
    // Disiplin JSON mode Llama lebih longgar daripada Gemini, jadi jalur ini
    // bukan kasus pinggiran — ia yang paling mungkin terjadi di produksi.
    const provider = createGroqProvider(
      KONFIG,
      vi.fn(balas(teksJson(`Tentu! Ini jawabannya: ${PENANDA_BODY}`))),
    );

    const err = await provider.chatJson(PERMINTAAN, skema).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_INVALID_OUTPUT" });
    expect((err as Error).name).not.toBe("SyntaxError");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("JSON mode meminta response_format json_object", async () => {
    const fetchMock = vi.fn(balas(teksJson('{"skills":[],"tahunPengalaman":0}')));
    await createGroqProvider(KONFIG, fetchMock).chatJson(PERMINTAAN, skema);

    const body: unknown = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toMatchObject({ response_format: { type: "json_object" } });
  });
});

describe("createGroqProvider — taksonomi error", () => {
  // Bentuk body error Groq TIDAK terdokumentasi. Karena itu test di bawah
  // mengirim body yang sengaja tidak berbentuk OpenAI: adapter harus tetap
  // memetakan berdasarkan STATUS saja, tanpa pernah membaca isinya.
  it("HTTP 429 → AI_RATE_LIMIT", async () => {
    const provider = createGroqProvider(KONFIG, vi.fn(balas({ pesan_aneh: PENANDA_BODY }, 429)));

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({
      name: "AiProviderError",
      code: "AI_RATE_LIMIT",
      provider: "groq",
      status: 429,
    });
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("HTTP 503 → AI_PROVIDER_UNAVAILABLE", async () => {
    const provider = createGroqProvider(KONFIG, vi.fn(balas([PENANDA_BODY], 503)));

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE", status: 503 });
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("HTTP 401 (kunci salah) → AI_NETWORK_ERROR, kuncinya tidak ikut", async () => {
    const provider = createGroqProvider(KONFIG, vi.fn(balas({ x: PENANDA_BODY }, 401)));

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "AI_NETWORK_ERROR", status: 401 });
    expect((err as Error).message).not.toContain(KONFIG.apiKey);
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("finish_reason content_filter → AI_SAFETY_BLOCK (HTTP-nya tetap 200)", async () => {
    const provider = createGroqProvider(
      KONFIG,
      vi.fn(
        balas({
          choices: [{ index: 0, message: { content: "" }, finish_reason: "content_filter" }],
        }),
      ),
    );

    await expect(provider.chat(PERMINTAAN)).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_SAFETY_BLOCK",
    });
  });

  it("finish_reason length = SUKSES, bukan error (pemanggil yang minta batasnya)", async () => {
    const provider = createGroqProvider(
      KONFIG,
      vi.fn(
        balas({
          choices: [{ index: 0, message: { content: "Terpeng" }, finish_reason: "length" }],
        }),
      ),
    );

    await expect(provider.chat(PERMINTAAN)).resolves.toMatchObject({ text: "Terpeng" });
  });

  it.each(["tool_calls", "sesuatu_yang_baru"])(
    "finish_reason asing (%s) → AI_INVALID_OUTPUT, bukan sukses berteks kosong",
    async (alasan) => {
      // `tool_calls` termasuk: kita tidak pernah mengirim `tools`, jadi
      // kemunculannya berarti balasan tanpa teks yang bisa dipakai.
      const provider = createGroqProvider(
        KONFIG,
        vi.fn(balas({ choices: [{ index: 0, message: {}, finish_reason: alasan }] })),
      );

      await expect(provider.chat(PERMINTAAN)).rejects.toMatchObject({
        code: "AI_INVALID_OUTPUT",
      });
    },
  );

  it("finish_reason berisi teks bebas disaring — tidak ikut ke pesan error", async () => {
    const provider = createGroqProvider(
      KONFIG,
      vi.fn(
        balas({ choices: [{ index: 0, message: {}, finish_reason: `bebas ${PENANDA_BODY}` }] }),
      ),
    );

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect((err as Error).message).toContain("tidak_diketahui");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("balasan tanpa choices → AI_NETWORK_ERROR, bukan TypeError", async () => {
    const provider = createGroqProvider(KONFIG, vi.fn(balas({ choices: [] })));

    await expect(provider.chat(PERMINTAAN)).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_NETWORK_ERROR",
    });
  });

  it("balasan bukan JSON → AI_NETWORK_ERROR", async () => {
    const provider = createGroqProvider(KONFIG, () =>
      Promise.resolve(new Response("<html>gateway</html>", { status: 200 })),
    );

    await expect(provider.chat(PERMINTAAN)).rejects.toMatchObject({ code: "AI_NETWORK_ERROR" });
  });

  it("fetch melempar TimeoutError → AI_TIMEOUT dengan batas yang disebut", async () => {
    // Tanpa fake timer: yang diuji adalah PEMETAAN abort → AI_TIMEOUT.
    // `AbortSignal.timeout` tidak menghormati fake timer, jadi memakainya justru
    // menguji sesuatu yang tidak terjadi di produksi.
    const provider = createGroqProvider(KONFIG, () => {
      const err = new Error("dibatalkan");
      err.name = "TimeoutError";
      return Promise.reject(err);
    });

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_TIMEOUT" });
    expect((err as Error).message).toContain("2000 ms");
  });

  it("fetch melempar error jaringan → AI_NETWORK_ERROR, hanya NAMA kelasnya yang ikut", async () => {
    const provider = createGroqProvider(KONFIG, () => {
      const err = new TypeError(`fetch gagal ke https://groq.contoh.invalid?k=${PENANDA_BODY}`);
      return Promise.reject(err);
    });

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "AI_NETWORK_ERROR" });
    expect((err as Error).message).toContain("TypeError");
    // Pesan `fetch` memuat URL — karena itu ia tidak pernah diteruskan.
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });
});
