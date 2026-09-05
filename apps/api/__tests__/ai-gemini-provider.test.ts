// PR-041 — contract test adapter Gemini terhadap skema balasan yang riil.
//
// MEKANISME MOCK: `FetchLike` yang disuntik, pola yang sama dengan
// `auth-google-exchange.test.ts`. Yang diuji BUKAN bahwa fetch dipanggil,
// melainkan bahwa BENTUK balasan Gemini yang sebenarnya — `candidates`,
// `promptFeedback`, `usageMetadata`, `embedding.values` — diterjemahkan ke
// kontrak kita, dan bahwa setiap bentuk kegagalan mendarat di kode yang
// berbeda. Skema Gemini berubah tanpa memberi tahu siapa pun; fixture di
// berkas inilah yang akan merah lebih dulu, bukan pengguna.
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createGeminiProvider } from "../src/core/ai/providers/gemini.js";
import type { AiChatRequest, FetchLike } from "../src/core/ai/types.js";

const KONFIG = {
  apiKey: "kunci-uji-rahasia",
  baseUrl: "https://ai.contoh.invalid",
  chatModel: "gemini-2.0-flash",
  embedModel: "text-embedding-004",
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
 * membuktikan larangan membocorkan payload (AC-8), bukan dengan membacanya.
 */
const PENANDA_BODY = "JEJAK-BODY-PROVIDER-c0ffee";

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
  candidates: [
    {
      content: {
        parts: [{ text: "Komunikasi, " }, { text: "ketelitian, kerja sama." }],
        role: "model",
      },
      finishReason: "STOP",
    },
  ],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 },
};

const vektor768 = (): number[] => Array.from({ length: 768 }, (_, i) => i / 1000);

describe("createGeminiProvider — chat", () => {
  it("balasan generateContent menjadi respons bertipe (teks + pemakaian token)", async () => {
    const provider = createGeminiProvider(KONFIG, vi.fn(balas(BALASAN_CHAT)));

    await expect(provider.chat(PERMINTAAN)).resolves.toEqual({
      // parts[] digabung — Gemini memecah jawaban panjang jadi beberapa bagian.
      text: "Komunikasi, ketelitian, kerja sama.",
      provider: "gemini",
      model: "gemini-2.0-flash",
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
    });
  });

  it("API key dikirim di header, TIDAK pernah di URL", async () => {
    const fetchMock = vi.fn(balas(BALASAN_CHAT));
    await createGeminiProvider(KONFIG, fetchMock).chat(PERMINTAAN);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://ai.contoh.invalid/v1beta/models/gemini-2.0-flash:generateContent");
    // URL berakhir di log akses & riwayat proxy; header tidak.
    expect(url).not.toContain(KONFIG.apiKey);
    expect(init.headers).toMatchObject({ "x-goog-api-key": KONFIG.apiKey });
  });

  it("pesan system menjadi systemInstruction, assistant menjadi peran 'model'", async () => {
    const fetchMock = vi.fn(balas(BALASAN_CHAT));
    await createGeminiProvider(KONFIG, fetchMock).chat({
      messages: [
        { role: "system", content: "Jadilah ringkas." },
        { role: "assistant", content: "Sebelumnya saya bilang begini." },
        { role: "user", content: "Lanjutkan." },
      ],
    });

    const body: unknown = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: "Jadilah ringkas." }] },
      contents: [{ role: "model" }, { role: "user" }],
    });
  });
});

describe("createGeminiProvider — embed", () => {
  it("mengembalikan vektor 768 dimensi", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ embedding: { values: vektor768() } })),
    );

    const hasil = await provider.embed({ text: "penyandang disabilitas daksa, admin" });
    expect(hasil.vector).toHaveLength(768);
    expect(hasil.dimensions).toBe(768);
    expect(hasil.model).toBe("text-embedding-004");
  });

  it("vektor berpanjang salah = AI_INVALID_OUTPUT, BUKAN dipotong/ditambal", async () => {
    // Vektor 512 dimensi tidak muat di kolom vector(768). Menyamarkannya
    // dengan padding akan menghasilkan skor kemiripan yang salah diam-diam.
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ embedding: { values: vektor768().slice(0, 512) } })),
    );

    await expect(provider.embed({ text: "apa saja" })).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_INVALID_OUTPUT",
    });
  });
});

describe("createGeminiProvider — JSON mode (validasi zod di batas)", () => {
  const skema = z.object({ skills: z.array(z.string()), tahunPengalaman: z.number() });
  const teksJson = (isi: string): unknown => ({
    candidates: [{ content: { parts: [{ text: isi }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
  });

  it("keluaran sah lolos zod dan keluar sebagai data bertipe", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas(teksJson('{"skills":["Excel"],"tahunPengalaman":3}'))),
    );

    const hasil = await provider.chatJson(PERMINTAAN, skema);
    expect(hasil.data).toEqual({ skills: ["Excel"], tahunPengalaman: 3 });
  });

  it("keluaran gagal zod = error terstruktur, bukan crash", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas(teksJson(`{"skills":"${PENANDA_BODY}","tahunPengalaman":"tiga"}`))),
    );

    const err = await provider.chatJson(PERMINTAAN, skema).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_INVALID_OUTPUT" });
    // Pesannya menyebut JALUR field bermasalah (milik skema kita) — tidak
    // sepotong pun keluaran model, yang bisa memuat data pengguna.
    expect((err as Error).message).toContain("skills");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("keluaran bukan JSON sama sekali = AI_INVALID_OUTPUT, bukan SyntaxError", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas(teksJson(`Maaf, saya tidak bisa. ${PENANDA_BODY}`))),
    );

    const err = await provider.chatJson(PERMINTAAN, skema).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_INVALID_OUTPUT" });
    expect((err as Error).name).not.toBe("SyntaxError");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("keluaran berpagar ```json juga AI_INVALID_OUTPUT — tidak pura-pura berhasil di-parse", async () => {
    // responseMimeType application/json biasanya mencegah ini, tapi model bisa
    // saja tetap membungkus jawabannya. JSON.parse tidak mengerti pagar
    // markdown, jadi ini HARUS jatuh ke jalur gagal yang sama seperti prosa —
    // bukan sukses diam-diam, bukan pula crash tak tertangkap.
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas(teksJson('```json\n{"skills":["Excel"],"tahunPengalaman":3}\n```'))),
    );

    const err = await provider.chatJson(PERMINTAAN, skema).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_INVALID_OUTPUT" });
  });

  it("JSON mode meminta responseMimeType application/json", async () => {
    const fetchMock = vi.fn(balas(teksJson('{"skills":[],"tahunPengalaman":0}')));
    await createGeminiProvider(KONFIG, fetchMock).chatJson(PERMINTAAN, skema);

    const body: unknown = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toMatchObject({ generationConfig: { responseMimeType: "application/json" } });
  });
});

describe("createGeminiProvider — taksonomi error", () => {
  // Tiga kelas ini dibedakan karena TINDAK LANJUTNYA berbeda: kuota habis →
  // coba provider lain nanti; provider tumbang → jalur non-AI; diblokir aman →
  // jangan pernah diulang.
  it("HTTP 429 → AI_RATE_LIMIT", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(
        balas({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: PENANDA_BODY } }, 429),
      ),
    );

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_RATE_LIMIT", status: 429 });
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("HTTP 503 → AI_PROVIDER_UNAVAILABLE", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ error: { code: 503, status: "UNAVAILABLE", message: PENANDA_BODY } }, 503)),
    );

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({
      name: "AiProviderError",
      code: "AI_PROVIDER_UNAVAILABLE",
      status: 503,
    });
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("HTTP 200 dengan promptFeedback.blockReason → AI_SAFETY_BLOCK", async () => {
    // Blokir keamanan datang sebagai 200. Memeriksa status saja akan membaca
    // `candidates[0]` yang tidak ada dan meledak sebagai TypeError.
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ candidates: [], promptFeedback: { blockReason: "SAFETY" } })),
    );

    await expect(provider.chat(PERMINTAAN)).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_SAFETY_BLOCK",
    });
  });

  it("blockReason berisi teks bebas disaring — tidak ikut ke pesan error", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ candidates: [], promptFeedback: { blockReason: `bebas ${PENANDA_BODY}` } })),
    );

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "AI_SAFETY_BLOCK" });
    expect((err as Error).message).toContain("TIDAK_DIKETAHUI");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  // Blokir jawaban (bukan blokir prompt): kandidatnya ADA, promptFeedback
  // tidak, dan `finishReason`-lah satu-satunya penanda. Gemini memakai beberapa
  // nilai untuk ini; semuanya harus mendarat di kode yang sama, sebab tindak
  // lanjutnya sama — jangan diulang.
  it.each(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"])(
    "finishReason %s pada kandidat → AI_SAFETY_BLOCK, bukan teks kosong yang 'sukses'",
    async (alasan) => {
      const provider = createGeminiProvider(
        KONFIG,
        vi.fn(
          balas({
            candidates: [{ content: { parts: [], role: "model" }, finishReason: alasan }],
            usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 0, totalTokenCount: 9 },
          }),
        ),
      );

      const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
      expect(err).toMatchObject({ name: "AiProviderError", code: "AI_SAFETY_BLOCK" });
      expect((err as Error).message).toContain(alasan);
    },
  );

  it("finishReason blokir di JSON mode juga AI_SAFETY_BLOCK, bukan AI_INVALID_OUTPUT", async () => {
    // Kalau blokirnya lolos, teks kosong akan sampai ke JSON.parse dan keluar
    // sebagai "keluaran bukan JSON" — pemanggil lalu menyalahkan bentuk jawaban
    // padahal permintaannya yang ditolak.
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] })),
    );

    await expect(provider.chatJson(PERMINTAAN, z.object({ a: z.string() }))).rejects.toMatchObject({
      code: "AI_SAFETY_BLOCK",
    });
  });

  it("finishReason yang tidak dikenal → AI_INVALID_OUTPUT, bukan sukses berteks kosong", async () => {
    // "OTHER" adalah nilai nyata Gemini untuk sebab yang tidak ia rinci. Ia
    // bukan blokir, jadi bukan AI_SAFETY_BLOCK — tapi juga bukan jawaban yang
    // boleh dipakai. Diam-diam mengembalikan "" menutup satu-satunya cara
    // pemanggil tahu generasinya gagal.
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ candidates: [{ content: { parts: [] }, finishReason: "OTHER" }] })),
    );

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_INVALID_OUTPUT" });
    expect((err as Error).message).toContain("OTHER");
  });

  it("finishReason berisi teks bebas disaring — tidak ikut ke pesan error", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(
        balas({
          candidates: [
            { content: { parts: [{ text: PENANDA_BODY }] }, finishReason: `bebas ${PENANDA_BODY}` },
          ],
        }),
      ),
    );

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect((err as Error).message).toContain("TIDAK_DIKETAHUI");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("finishReason MAX_TOKENS tetap sukses — terpenggal atas permintaan pemanggil", async () => {
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(
        balas({
          candidates: [
            { content: { parts: [{ text: "Komunikasi, kete" }] }, finishReason: "MAX_TOKENS" },
          ],
          usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 },
        }),
      ),
    );

    await expect(provider.chat({ ...PERMINTAAN, maxOutputTokens: 4 })).resolves.toMatchObject({
      text: "Komunikasi, kete",
    });
  });

  it("balasan 200 tanpa kandidat dan tanpa blockReason = gagal terlaporkan, bukan crash", async () => {
    const provider = createGeminiProvider(KONFIG, vi.fn(balas({ candidates: [] })));

    await expect(provider.chat(PERMINTAAN)).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_NETWORK_ERROR",
    });
  });

  it("jaringan mati → AI_NETWORK_ERROR dengan jenis error saja", async () => {
    const provider = createGeminiProvider(KONFIG, () =>
      Promise.reject(new TypeError(`fetch failed ${PENANDA_BODY}`)),
    );

    const err = await provider.chat(PERMINTAAN).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "AiProviderError", code: "AI_NETWORK_ERROR" });
    expect((err as Error).message).toContain("TypeError");
    expect((err as Error).message).not.toContain(PENANDA_BODY);
  });

  it("kunci API dan isi prompt pengguna TIDAK PERNAH muncul di pesan error", async () => {
    // Beda dari test PENANDA_BODY di atas (yang membuktikan body provider tak
    // bocor): ini membuktikan dua hal lain secara eksplisit — apiKey dari
    // config, dan teks prompt dari PEMANGGIL — sama-sama absen (AC-8).
    const promptRahasia = "riwayat kerja saya sebagai admin gudang PT Rahasia Sejahtera";
    const provider = createGeminiProvider(
      KONFIG,
      vi.fn(balas({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, 429)),
    );

    const err = await provider
      .chat({ messages: [{ role: "user", content: promptRahasia }] })
      .catch((e: unknown) => e);

    expect((err as Error).message).not.toContain(KONFIG.apiKey);
    expect((err as Error).message).not.toContain(promptRahasia);
  });
});

describe("createGeminiProvider — batas tunggu", () => {
  it("panggilan yang tidak dijawab berakhir AI_TIMEOUT, tidak menggantung", async () => {
    const provider = createGeminiProvider({ ...KONFIG, timeoutMs: 40 }, (_url, init) => {
      expect(init.signal).toBeDefined();
      // Meniru `fetch` sungguhan: permintaan yang tidak pernah dijawab hanya
      // berakhir ketika signal-nya abort.
      const signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(signal.reason as Error);
        });
      });
    });

    const mulai = Date.now();
    await expect(provider.chat(PERMINTAAN)).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_TIMEOUT",
    });
    expect(Date.now() - mulai).toBeLessThan(2_000);
  });

  it("batas tunggu bisa ditimpa per panggilan", async () => {
    const fetchMock = vi.fn(balas({ embedding: { values: vektor768() } }));
    await createGeminiProvider(KONFIG, fetchMock).embed({ text: "halo", timeoutMs: 1_234 });
    // Nilai timeout tidak terbaca dari AbortSignal, jadi yang dibuktikan di
    // sini adalah jalurnya: panggilan tetap membawa signal miliknya sendiri.
    expect(fetchMock.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });

  it("nilai batas tunggu per panggilan BENAR-BENAR dipakai, bukan hanya bawaan config", async () => {
    // Test di atas hanya membuktikan ADA signal. Ini membuktikan NILAINYA:
    // AbortSignal.timeout dipanggil dengan override (1234), bukan bawaan
    // config (2000) — kalau adaptor diam-diam mengabaikan override, test ini
    // yang akan merah, bukan test di atas.
    const spy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(balas({ embedding: { values: vektor768() } }));
    await createGeminiProvider(KONFIG, fetchMock).embed({ text: "halo", timeoutMs: 1_234 });

    expect(spy).toHaveBeenCalledWith(1_234);
    expect(spy).not.toHaveBeenCalledWith(KONFIG.timeoutMs);
    spy.mockRestore();
  });
});
