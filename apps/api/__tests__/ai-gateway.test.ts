// PR-041/PR-042 — perakitan AI Gateway dari env.
//
// Yang dijaga di sini adalah keputusan deny-by-default: API tanpa kunci AI tetap
// boleh boot (fitur AI selalu punya jalur non-AI, ADR-005), TETAPI tidak ada satu
// pun panggilan AI yang diam-diam berhasil. Sejak PR-042 ditambah satu keputusan
// lagi: kunci yang SEBAGIAN terisi tidak boleh mengubah bentuk gateway — ia tetap
// router dua provider, hanya salah satunya yang menolak.
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createAiGateway, type AiGatewayEnv } from "../src/core/ai/gateway.js";

const ENV: AiGatewayEnv = {
  GEMINI_API_KEY: undefined,
  GEMINI_BASE_URL: "https://ai.contoh.invalid",
  GEMINI_CHAT_MODEL: "gemini-2.0-flash",
  GEMINI_EMBED_MODEL: "text-embedding-004",
  GEMINI_TIMEOUT_MS: 2_000,
  GROQ_API_KEY: undefined,
  GROQ_BASE_URL: "https://groq.contoh.invalid",
  GROQ_CHAT_MODEL: "llama-3.3-70b-versatile",
  GROQ_TIMEOUT_MS: 2_000,
  AI_ROUTER_FORCE_PROVIDER: undefined,
};

const logger = () => ({ warn: vi.fn() });

const balasGemini = () =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: "siap" }] }, finishReason: "STOP" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
const balasGroq = () =>
  new Response(
    JSON.stringify({
      choices: [{ index: 0, message: { content: "siap dari groq" }, finish_reason: "stop" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("createAiGateway — tanpa satu pun kunci AI", () => {
  it("perakitan TIDAK melempar: boot API tidak bergantung pada kunci AI", () => {
    expect(() => createAiGateway(ENV, logger())).not.toThrow();
  });

  it("setiap kapabilitas ditolak AI_NOT_CONFIGURED", async () => {
    const gateway = createAiGateway(ENV, logger());
    const permintaan = { messages: [{ role: "user" as const, content: "halo" }] };
    const ditolak = { name: "AiProviderError", code: "AI_NOT_CONFIGURED" };

    await expect(gateway.chat(permintaan)).rejects.toMatchObject(ditolak);
    await expect(gateway.chatJson(permintaan, z.object({}))).rejects.toMatchObject(ditolak);
    await expect(gateway.embed({ text: "halo" })).rejects.toMatchObject(ditolak);
  });

  it("memperingatkan operator SEKALI saat dirakit, bukan tiap panggilan", async () => {
    const log = logger();
    const gateway = createAiGateway(ENV, log);
    await gateway.chat({ messages: [] }).catch(() => undefined);
    await gateway.embed({ text: "halo" }).catch(() => undefined);

    expect(log.warn).toHaveBeenCalledTimes(1);
    // Peringatannya menyebut nama variabelnya — bukan nilainya (tidak ada).
    const dicatat = JSON.stringify(log.warn.mock.calls);
    expect(dicatat).toContain("GEMINI_API_KEY");
    expect(dicatat).toContain("GROQ_API_KEY");
  });
});

describe("createAiGateway — hanya GEMINI_API_KEY", () => {
  it("merakit router dan memakai fetch yang disuntik", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(balasGemini()));
    const gateway = createAiGateway({ ...ENV, GEMINI_API_KEY: "kunci-uji" }, logger(), fetchMock);

    // Namanya "router": pemanggil tidak pernah tahu provider mana yang menjawab.
    // Yang menyebut provider sebenarnya adalah field `provider` di respons.
    expect(gateway.name).toBe("router");
    await expect(
      gateway.chat({ messages: [{ role: "user", content: "halo" }] }),
    ).resolves.toMatchObject({ text: "siap", provider: "gemini", model: "gemini-2.0-flash" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("memperingatkan bahwa cadangan tidak ada — sekali, saat dirakit", () => {
    const log = logger();
    createAiGateway({ ...ENV, GEMINI_API_KEY: "kunci-uji" }, log);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.warn.mock.calls)).toContain("GROQ_API_KEY");
  });

  it("Gemini gagal + Groq tanpa kunci → error ASLI Gemini yang terlihat", async () => {
    // Regresi yang paling mudah terjadi: cadangan yang tidak pernah dipasang
    // menutupi penyebab sebenarnya dengan "layanan AI belum dikonfigurasi".
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 429 })));
    const gateway = createAiGateway({ ...ENV, GEMINI_API_KEY: "kunci-uji" }, logger(), fetchMock);

    await expect(
      gateway.chat({ messages: [{ role: "user", content: "halo" }] }),
    ).rejects.toMatchObject({ code: "AI_RATE_LIMIT", provider: "gemini" });
  });
});

describe("createAiGateway — kedua kunci terisi", () => {
  it("tidak memperingatkan apa pun dan mengalihkan ke Groq saat Gemini 503", async () => {
    const log = logger();
    const fetchMock = vi.fn((input: string) =>
      Promise.resolve(
        input.includes("groq.contoh.invalid") ? balasGroq() : new Response("{}", { status: 503 }),
      ),
    );
    const gateway = createAiGateway(
      { ...ENV, GEMINI_API_KEY: "kunci-gemini", GROQ_API_KEY: "kunci-groq" },
      log,
      fetchMock,
    );

    await expect(
      gateway.chat({ messages: [{ role: "user", content: "halo" }] }),
    ).resolves.toMatchObject({
      text: "siap dari groq",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
    });
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("createAiGateway — AI_ROUTER_FORCE_PROVIDER", () => {
  it("memaksa seluruh panggilan ke satu provider (tuas rollback)", async () => {
    const alamat: string[] = [];
    const fetchMock = vi.fn((input: string) => {
      alamat.push(input);
      return Promise.resolve(balasGroq());
    });
    const gateway = createAiGateway(
      {
        ...ENV,
        GEMINI_API_KEY: "kunci-gemini",
        GROQ_API_KEY: "kunci-groq",
        AI_ROUTER_FORCE_PROVIDER: "groq",
      },
      logger(),
      fetchMock,
    );

    expect(gateway.name).toBe("groq");
    await expect(
      gateway.chat({ messages: [{ role: "user", content: "halo" }] }),
    ).resolves.toMatchObject({ provider: "groq" });
    expect(alamat).not.toHaveLength(0);
    expect(alamat.every((url) => url.includes("groq.contoh.invalid"))).toBe(true);
  });
});
