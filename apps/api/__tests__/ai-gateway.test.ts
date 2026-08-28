// PR-041 — perakitan AI Gateway dari env.
//
// Yang dijaga di sini adalah keputusan deny-by-default: API tanpa
// `GEMINI_API_KEY` tetap boleh boot (fitur AI selalu punya jalur non-AI,
// ADR-005), TETAPI tidak ada satu pun panggilan AI yang diam-diam berhasil.
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createAiGateway, type AiGatewayEnv } from "../src/core/ai/gateway.js";

const ENV: AiGatewayEnv = {
  GEMINI_API_KEY: undefined,
  GEMINI_BASE_URL: "https://ai.contoh.invalid",
  GEMINI_CHAT_MODEL: "gemini-2.0-flash",
  GEMINI_EMBED_MODEL: "text-embedding-004",
  GEMINI_TIMEOUT_MS: 2_000,
};

const logger = () => ({ warn: vi.fn() });

describe("createAiGateway — tanpa GEMINI_API_KEY", () => {
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
    expect(JSON.stringify(log.warn.mock.calls)).toContain("GEMINI_API_KEY");
  });
});

describe("createAiGateway — dengan GEMINI_API_KEY", () => {
  it("merakit provider Gemini dan memakai fetch yang disuntik", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "siap" }] }, finishReason: "STOP" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const log = logger();
    const gateway = createAiGateway({ ...ENV, GEMINI_API_KEY: "kunci-uji" }, log, fetchMock);

    expect(gateway.name).toBe("gemini");
    await expect(
      gateway.chat({ messages: [{ role: "user", content: "halo" }] }),
    ).resolves.toMatchObject({ text: "siap", model: "gemini-2.0-flash" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
  });
});
