import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@nawasena/api-client";
import { kirimPesanCv } from "../src/cv/chat";

const ID = "01912345-89ab-7def-8123-456789abcdef";
const turn = {
  seq: 2,
  role: "assistant",
  content: "Ceritakan kemampuan Anda.",
  at: "2026-10-06T00:00:00.000Z",
};
const response = (sse: string) =>
  new Response(sse, { headers: { "content-type": "text/event-stream" } });

function opsi(fetch: ReturnType<typeof vi.fn>) {
  return {
    klien: createApiClient({ baseUrl: "https://api.test/api/v1", fetch }),
    sessionId: ID,
    message: "Saya menguasai Excel",
    signal: new AbortController().signal,
    onTurn: vi.fn(),
    onToken: vi.fn(),
    muatUlang: vi.fn(async () => undefined),
    tunda: vi.fn(async () => undefined),
  };
}

describe("CV AI Android", () => {
  it("menerima token dan giliran tersimpan tanpa mengubah fokus", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response(
          `id: 1\nevent: token\ndata: Ceritakan\n\nid: 2\nevent: giliran\ndata: ${JSON.stringify(turn)}\n\nevent: selesai\ndata: {}\n\n`,
        ),
      );
    const p = opsi(fetch);
    await kirimPesanCv(p);
    expect(p.onToken).toHaveBeenCalledWith("Ceritakan");
    expect(p.onTurn).toHaveBeenCalledWith(turn);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ sessionId: ID, message: p.message });
  });
  it("jaringan putus disambung dengan Last-Event-Id, pesan tidak dikirim dua kali", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response("id: 7\nevent: token\ndata: Hai\n\n"))
      .mockResolvedValueOnce(
        response(
          `id: 8\nevent: giliran\ndata: ${JSON.stringify(turn)}\n\nevent: selesai\ndata: {}\n\n`,
        ),
      );
    const p = opsi(fetch);
    await kirimPesanCv(p);
    expect(fetch.mock.calls[1]![1].method).toBe("GET");
    expect(fetch.mock.calls[1]![1].headers["last-event-id"]).toBe("7");
    expect(p.onTurn).toHaveBeenCalledTimes(1);
  });
  it("aliran habis masa simpan memuat jawaban dari transkrip", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(""))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "AI_ALIRAN_HILANG", message: "Tidak ada" }), {
          status: 404,
        }),
      );
    const p = opsi(fetch);
    await kirimPesanCv(p);
    expect(p.muatUlang).toHaveBeenCalledOnce();
  });
  it("degradasi AI diteruskan supaya pengguna dapat memilih CV dari profil", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response(
          'event: error\ndata: {"code":"KUOTA_AI_HABIS","message":"Jatah AI habis","hint":"Coba besok","degraded":true}\n\n',
        ),
      );
    const p = opsi(fetch);
    await expect(kirimPesanCv(p)).rejects.toMatchObject({ code: "KUOTA_AI_HABIS" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keluar dari layar membatalkan pembacaan tanpa memulai sambungan baru", async () => {
    const abort = new AbortController();
    const fetch = vi.fn(async () => {
      abort.abort();
      return response("");
    });
    const p = opsi(fetch);
    await kirimPesanCv({ ...p, signal: abort.signal });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(p.tunda).not.toHaveBeenCalled();
  });
});
