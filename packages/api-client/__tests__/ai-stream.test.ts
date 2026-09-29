// Aliran AI CV Builder di klien (PR-068): pengurai SSE, `ApiClient.stream`,
// dan pembuka aliran endpoint AI.
import { describe, it, expect, vi } from "vitest";
import {
  ApiError,
  createApiClient,
  resumeAiChatStream,
  streamAiChat,
  uraiSse,
  type ApiClient,
  type EventSse,
} from "../src/index.js";

/** Aliran byte yang dipotong di tempat-tempat paling jahat. */
function aliran(potongan: readonly string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of potongan) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

async function semua(gen: AsyncIterable<EventSse>): Promise<EventSse[]> {
  const hasil: EventSse[] = [];
  for await (const e of gen) hasil.push(e);
  return hasil;
}

describe("uraiSse", () => {
  it("bingkai terbelah di tengah kata `data`, CRLF, komentar detak, bingkai multi-baris", async () => {
    const hasil = await semua(
      uraiSse(
        aliran([
          "id: 1\r\nevent: tok",
          "en\r\nda",
          "ta: Halo \r\n\r\n: detak\n\n",
          'id: 2\nevent: giliran\ndata: {"a":1}\ndata: baris2\n\n',
        ]),
      ),
    );
    expect(hasil).toEqual([
      { id: 1, event: "token", data: "Halo " },
      { id: 2, event: "giliran", data: '{"a":1}\nbaris2' },
    ]);
  });

  it("bingkai terakhir tanpa baris kosong penutup tetap diserahkan", async () => {
    expect(await semua(uraiSse(aliran(["id: 7\nevent: selesai\ndata: "])))).toEqual([
      { id: 7, event: "selesai", data: "" },
    ]);
  });

  it("emoji yang terbelah di batas potongan byte tetap utuh", async () => {
    const enc = new TextEncoder();
    const penuh = enc.encode("data: 🙂\n\n");
    const s = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(penuh.slice(0, 8));
        c.enqueue(penuh.slice(8));
        c.close();
      },
    });
    expect(await semua(uraiSse(s))).toEqual([{ data: "🙂" }]);
  });
});

describe("ApiClient.stream", () => {
  it("menambah Authorization + Accept SSE, dan refresh sekali pada 401", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response(aliran(["data: ok\n\n"]), { status: 200 }));
    let token = "lama";
    const client = createApiClient({
      baseUrl: "https://x/api/v1",
      fetch,
      getAccessToken: () => token,
      refresh: () => {
        token = "baru";
        return true;
      },
    });

    const res = await client.stream!("/ai/cv-chat", { method: "POST", body: { a: 1 } });
    expect(res.status).toBe(200);
    const [, init] = fetch.mock.calls[1] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      authorization: "Bearer baru",
      accept: "text/event-stream",
      "content-type": "application/json",
    });
  });

  it("non-2xx sebelum aliran → ApiError ber-envelope (bukan badan mentah)", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "AI_SEDANG_MENJAWAB", message: "Masih menjawab" }), {
        status: 409,
      }),
    );
    const client = createApiClient({ baseUrl: "https://x", fetch });
    const err = (await client.stream!("/ai/cv-chat").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "AI_SEDANG_MENJAWAB", status: 409 });
  });
});

describe("pembuka aliran endpoint AI", () => {
  it("resumeAiChatStream mengirim Last-Event-Id dan membaca event", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(aliran(["id: 5\nevent: selesai\ndata: \n\n"]), { status: 200 }),
      );
    const client = createApiClient({ baseUrl: "https://x/api/v1", fetch });
    const events = await semua(
      await resumeAiChatStream(client, "018f4c1e-0000-7000-8000-0000000000a1", 4),
    );

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://x/api/v1/ai/cv-chat/018f4c1e-0000-7000-8000-0000000000a1/stream");
    expect(init.headers).toMatchObject({ "last-event-id": "4" });
    expect(events).toEqual([{ id: 5, event: "selesai", data: "" }]);
  });

  it("streamAiChat memvalidasi body lebih dulu — pesan kosong tidak pernah terkirim", async () => {
    const fetch = vi.fn();
    const client = createApiClient({ baseUrl: "https://x", fetch });
    await expect(
      streamAiChat(client, { sessionId: "018f4c1e-0000-7000-8000-0000000000a1", message: "  " }),
    ).rejects.toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("klien tanpa kemampuan stream → ApiError yang bisa dibacakan, bukan TypeError", async () => {
    const klien: ApiClient = { request: () => Promise.resolve(undefined as never) };
    await expect(
      streamAiChat(klien, { sessionId: "018f4c1e-0000-7000-8000-0000000000a1", message: "hai" }),
    ).rejects.toMatchObject({ code: "ALIRAN_TIDAK_DIDUKUNG" });
  });
});
