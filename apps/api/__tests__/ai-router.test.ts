// PR-042 — router dua provider + circuit breaker (AC-1, AC-3, AC-4, AC-5).
//
// Dua gaya mock dipakai dengan sengaja:
// - ADAPTER NYATA + `FetchLike` disuntik untuk AC yang berbicara tentang hasil
//   akhir (provider mana yang menjawab, bentuk responsnya). Memakai stub di sana
//   berarti menguji stub, bukan normalisasi yang jadi inti AC-5.
// - STUB `AiProvider` untuk AC yang berbicara tentang KEPUTUSAN router (kode
//   error mana yang mengalihkan, apa yang diteruskan ke cadangan), di mana
//   melewati HTTP hanya menambah derau.
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createAiRouter } from "../src/core/ai/router.js";
import { createCircuitBreaker } from "../src/core/ai/breaker.js";
import { createGeminiProvider } from "../src/core/ai/providers/gemini.js";
import { createGroqProvider } from "../src/core/ai/providers/groq.js";
import {
  AiProviderError,
  type AiChatRequest,
  type AiErrorCode,
  type AiProvider,
  type FetchLike,
} from "../src/core/ai/types.js";

const KONFIG_GEMINI = {
  apiKey: "kunci-gemini",
  baseUrl: "https://ai.contoh.invalid",
  chatModel: "gemini-2.0-flash",
  embedModel: "text-embedding-004",
  timeoutMs: 2_000,
};
const KONFIG_GROQ = {
  apiKey: "kunci-groq",
  baseUrl: "https://groq.contoh.invalid",
  chatModel: "llama-3.3-70b-versatile",
  timeoutMs: 2_000,
};

const PERMINTAAN: AiChatRequest = {
  messages: [
    { role: "system", content: "Jawab ringkas." },
    { role: "user", content: "Sebutkan tiga keterampilan." },
  ],
};

function balas(body: unknown, status = 200): FetchLike {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

const BALASAN_GEMINI = {
  candidates: [{ content: { parts: [{ text: "jawaban gemini" }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
};
const BALASAN_GROQ = {
  choices: [{ index: 0, message: { content: "jawaban groq" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
};

/** Provider palsu yang selalu gagal dengan kode tertentu. */
function providerGagal(nama: string, kode: AiErrorCode): AiProvider & { hits: () => number } {
  let hits = 0;
  const tolak = (): Promise<never> => {
    hits += 1;
    return Promise.reject(new AiProviderError(kode, nama));
  };
  return { name: nama, chat: tolak, chatJson: tolak, embed: tolak, hits: () => hits };
}

/** Provider palsu yang selalu berhasil; merekam permintaan yang ia terima. */
function providerBerhasil(nama: string) {
  const diterima: AiChatRequest[] = [];
  const jawab = (request: AiChatRequest) => {
    diterima.push(request);
    return Promise.resolve({
      text: `jawaban ${nama}`,
      provider: nama,
      model: `model-${nama}`,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
  };
  return {
    diterima,
    provider: {
      name: nama,
      chat: jawab,
      chatJson: (request: AiChatRequest) => {
        diterima.push(request);
        return Promise.resolve({
          data: {},
          provider: nama,
          model: `model-${nama}`,
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        });
      },
      embed: () =>
        Promise.resolve({ vector: [], dimensions: 0, provider: nama, model: `model-${nama}` }),
    } as AiProvider,
  };
}

describe("createAiRouter — AC-1: chat beralih ke Groq saat Gemini tidak sanggup", () => {
  it.each([429, 500, 503])("Gemini HTTP %i → Groq yang menjawab", async (status) => {
    const geminiFetch = vi.fn(balas({ error: "apa pun" }, status));
    const groqFetch = vi.fn(balas(BALASAN_GROQ));
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, geminiFetch),
      fallback: createGroqProvider(KONFIG_GROQ, groqFetch),
    });

    const hasil = await router.chat(PERMINTAAN);

    expect(hasil.text).toBe("jawaban groq");
    expect(geminiFetch).toHaveBeenCalledTimes(1);
    expect(groqFetch).toHaveBeenCalledTimes(1);
  });

  it("chatJson juga beralih — ia berbagi jalur yang sama dengan chat", async () => {
    // Spesifikasi hanya menyebut "chat", tetapi kedua kapabilitas memakai
    // endpoint dan sinyal kegagalan yang sama; membedakannya justru akan
    // membuat chatJson gagal di situasi yang chat-nya selamat.
    const groqFetch = vi.fn(
      balas({
        choices: [{ index: 0, message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      }),
    );
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas({}, 429))),
      fallback: createGroqProvider(KONFIG_GROQ, groqFetch),
    });

    const hasil = await router.chatJson(PERMINTAAN, z.object({ ok: z.boolean() }));
    expect(hasil.data).toEqual({ ok: true });
    expect(hasil.provider).toBe("groq");
  });

  it.each<AiErrorCode>(["AI_TIMEOUT", "AI_NETWORK_ERROR"])(
    "%s juga mengalihkan — ia sinyal kesehatan, bukan vonis isi",
    async (kode) => {
      const utama = providerGagal("gemini", kode);
      const cadangan = providerBerhasil("groq");
      const router = createAiRouter({ primary: utama, fallback: cadangan.provider });

      await expect(router.chat(PERMINTAAN)).resolves.toMatchObject({ provider: "groq" });
    },
  );

  it.each<AiErrorCode>(["AI_SAFETY_BLOCK", "AI_INVALID_OUTPUT", "AI_NOT_CONFIGURED"])(
    "%s TIDAK mengalihkan — cadangan tidak pernah disentuh",
    async (kode) => {
      // Blokir keamanan dan keluaran tak sesuai skema adalah VONIS ISI. Mencoba
      // provider lain berarti mencuci vonis itu sampai ada yang mau menjawab.
      const utama = providerGagal("gemini", kode);
      const cadangan = providerBerhasil("groq");
      const router = createAiRouter({ primary: utama, fallback: cadangan.provider });

      await expect(router.chat(PERMINTAAN)).rejects.toMatchObject({ code: kode });
      expect(cadangan.diterima).toHaveLength(0);
    },
  );

  it("cadangan menerima permintaan yang SAMA PERSIS — tanpa data tambahan", async () => {
    // Syarat kesetaraan payload (catatan keamanan PR-042): peralihan provider
    // tidak boleh menjadi celah tempat data ekstra ikut terkirim ke pihak kedua.
    const cadangan = providerBerhasil("groq");
    const router = createAiRouter({
      primary: providerGagal("gemini", "AI_RATE_LIMIT"),
      fallback: cadangan.provider,
    });

    await router.chat(PERMINTAAN);

    expect(cadangan.diterima).toHaveLength(1);
    expect(cadangan.diterima[0]).toBe(PERMINTAAN);
  });

  it("kedua provider gagal → error PROVIDER UTAMA yang terlihat, bukan error cadangan", async () => {
    // Groq tanpa kunci akan menolak AI_NOT_CONFIGURED. Menonjolkannya berarti
    // memberi tahu operator "layanan AI belum dikonfigurasi" padahal yang
    // sebenarnya terjadi adalah Gemini kehabisan kuota.
    const router = createAiRouter({
      primary: providerGagal("gemini", "AI_RATE_LIMIT"),
      fallback: providerGagal("groq", "AI_NOT_CONFIGURED"),
    });

    await expect(router.chat(PERMINTAAN)).rejects.toMatchObject({
      code: "AI_RATE_LIMIT",
      provider: "gemini",
    });
  });
});

describe("createAiRouter — AC-4/AC-5: provider yang menjawab & bentuk keluaran", () => {
  it("respons menyebut provider yang BENAR-BENAR menjawab", async () => {
    // Inilah kait yang dibaca pencatat `ai_usage` di PR-043.
    const routerGemini = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas(BALASAN_GEMINI))),
      fallback: createGroqProvider(KONFIG_GROQ, vi.fn(balas(BALASAN_GROQ))),
    });
    const routerGroq = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas({}, 503))),
      fallback: createGroqProvider(KONFIG_GROQ, vi.fn(balas(BALASAN_GROQ))),
    });

    await expect(routerGemini.chat(PERMINTAAN)).resolves.toMatchObject({ provider: "gemini" });
    await expect(routerGroq.chat(PERMINTAAN)).resolves.toMatchObject({ provider: "groq" });
  });

  it("bentuk respons identik siapa pun yang menjawab — hanya provider/model berbeda", async () => {
    const dariGemini = await createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas(BALASAN_GEMINI))),
      fallback: createGroqProvider(KONFIG_GROQ, vi.fn(balas(BALASAN_GROQ))),
    }).chat(PERMINTAAN);
    const dariGroq = await createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas({}, 503))),
      fallback: createGroqProvider(KONFIG_GROQ, vi.fn(balas(BALASAN_GROQ))),
    }).chat(PERMINTAAN);

    expect(Object.keys(dariGroq).sort()).toEqual(Object.keys(dariGemini).sort());
    // Bedanya HANYA di dua field identitas + teksnya sendiri; usage sudah
    // dinormalkan ke nama kita (promptTokens, bukan prompt_tokens).
    expect({ ...dariGroq, provider: "", model: "", text: "" }).toEqual({
      ...dariGemini,
      provider: "",
      model: "",
      text: "",
    });
  });
});

describe("createAiRouter — AC-3: embed tidak pernah beralih provider", () => {
  it("Gemini tumbang → error diteruskan apa adanya, Groq tidak disentuh", async () => {
    // Groq tidak punya endpoint embedding sama sekali; dan vektor dari model
    // lain tidak sebanding dengan yang sudah tersimpan di kolom vector(768).
    // Pemanggilnya (job antrean) yang mengulang dengan kebijakan retry-nya.
    const groqFetch = vi.fn(balas(BALASAN_GROQ));
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas({}, 503))),
      fallback: createGroqProvider(KONFIG_GROQ, groqFetch),
    });

    await expect(router.embed({ text: "apa saja" })).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_PROVIDER_UNAVAILABLE",
      provider: "gemini",
    });
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it("embed tetap dijaga breaker: sirkuit terbuka = gagal cepat tanpa jaringan", async () => {
    const geminiFetch = vi.fn(balas({}, 503));
    const breakerUtama = createCircuitBreaker({ threshold: 2 });
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, geminiFetch),
      fallback: createGroqProvider(KONFIG_GROQ, vi.fn(balas(BALASAN_GROQ))),
      breakers: { primary: breakerUtama, fallback: createCircuitBreaker() },
    });

    await expect(router.embed({ text: "a" })).rejects.toThrow();
    await expect(router.embed({ text: "b" })).rejects.toThrow();
    await expect(router.embed({ text: "c" })).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });

    // Panggilan ketiga tidak pernah menyentuh jaringan.
    expect(geminiFetch).toHaveBeenCalledTimes(2);
  });
});

describe("createAiRouter — AC-2 terpasang: breaker menghentikan panggilan sia-sia", () => {
  it("setelah 5 kegagalan, Gemini tidak dihubungi lagi — langsung ke Groq", async () => {
    const geminiFetch = vi.fn(balas({}, 503));
    const groqFetch = vi.fn(balas(BALASAN_GROQ));
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, geminiFetch),
      fallback: createGroqProvider(KONFIG_GROQ, groqFetch),
    });

    for (let i = 0; i < 7; i += 1) {
      await expect(router.chat(PERMINTAAN)).resolves.toMatchObject({ provider: "groq" });
    }

    // Lima panggilan pertama membayar batas tunggu Gemini; sisanya tidak.
    expect(geminiFetch).toHaveBeenCalledTimes(5);
    expect(groqFetch).toHaveBeenCalledTimes(7);
  });

  it("vonis isi tidak menggerakkan sirkuit — provider sehat tidak ikut diputus", async () => {
    const utama = providerGagal("gemini", "AI_SAFETY_BLOCK");
    const router = createAiRouter({
      primary: utama,
      fallback: providerBerhasil("groq").provider,
    });

    for (let i = 0; i < 8; i += 1) {
      await expect(router.chat(PERMINTAAN)).rejects.toMatchObject({ code: "AI_SAFETY_BLOCK" });
    }

    // Kedelapan panggilan benar-benar sampai ke provider: sirkuit tidak pernah
    // membuka, karena yang ditolak adalah permintaannya, bukan provider-nya.
    expect(utama.hits()).toBe(8);
  });
});

describe("createAiRouter — isolasi breaker per provider", () => {
  it("sirkuit Gemini terbuka tidak ikut membuka sirkuit Groq", async () => {
    // Dua breaker terpisah disuntik langsung supaya keadaannya bisa dibaca
    // tanpa menebak dari perilaku panggilan — kalau implementasi suatu saat
    // berbagi satu breaker untuk dua provider, test ini yang menangkapnya.
    const breakerGemini = createCircuitBreaker();
    const breakerGroq = createCircuitBreaker();
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas({}, 503))),
      fallback: createGroqProvider(KONFIG_GROQ, vi.fn(balas(BALASAN_GROQ))),
      breakers: { primary: breakerGemini, fallback: breakerGroq },
    });

    for (let i = 0; i < 5; i += 1) {
      await expect(router.chat(PERMINTAAN)).resolves.toMatchObject({ provider: "groq" });
    }

    expect(breakerGemini.state()).toBe("open");
    expect(breakerGroq.state()).toBe("closed");
    expect(breakerGroq.canAttempt()).toBe(true);
  });
});

describe("createAiRouter — tuas rollback AI_ROUTER_FORCE_PROVIDER", () => {
  it("dipaksa ke groq: Gemini tidak pernah dihubungi, bahkan untuk embed", async () => {
    const geminiFetch = vi.fn(balas(BALASAN_GEMINI));
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, geminiFetch),
      fallback: createGroqProvider(KONFIG_GROQ, vi.fn(balas(BALASAN_GROQ))),
      forceProvider: "groq",
    });

    expect(router.name).toBe("groq");
    await expect(router.chat(PERMINTAAN)).resolves.toMatchObject({ provider: "groq" });
    await expect(router.embed({ text: "a" })).rejects.toMatchObject({ provider: "groq" });
    expect(geminiFetch).not.toHaveBeenCalled();
  });

  it("dipaksa ke gemini: gagal berapa kali pun tidak pernah jatuh ke Groq", async () => {
    // Tuas ini juga melewati breaker: bila kita memakainya karena satu provider
    // bermasalah, mekanisme yang mungkin ikut bermasalah tidak boleh menghalangi.
    const groqFetch = vi.fn(balas(BALASAN_GROQ));
    const router = createAiRouter({
      primary: createGeminiProvider(KONFIG_GEMINI, vi.fn(balas({}, 503))),
      fallback: createGroqProvider(KONFIG_GROQ, groqFetch),
      forceProvider: "gemini",
    });

    for (let i = 0; i < 7; i += 1) {
      await expect(router.chat(PERMINTAAN)).rejects.toMatchObject({ provider: "gemini" });
    }
    expect(groqFetch).not.toHaveBeenCalled();
  });
});
