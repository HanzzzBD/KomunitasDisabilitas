// AI CV Builder di web (PR-068) — penampung kalimat & mesin `useAiStream`.
//
// AC yang dijaga di sini (tanpa browser):
//   - pengumuman per KALIMAT, bukan per token (risiko "SR berisik")
//   - kuota habis → beralih ke formulir dengan pesan jujur (degraded), bukan galat
//   - putus koneksi → sambung ulang dengan Last-Event-Id tanpa kehilangan giliran
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ApiClient, StreamOptions } from "@nawasena/api-client";
import type { AiChatTurn } from "@nawasena/schemas";
import { createPenampungKalimat, useAiStream } from "../src/features/cv-chat/index.js";

const SESI = "018f4c1e-0000-7000-8000-0000000000a1";
const AT = "2026-09-28T03:00:00.000Z";

describe("penampung kalimat", () => {
  it("melepas hanya kalimat utuh; serpihan kata ditahan", () => {
    const p = createPenampungKalimat();
    expect(p.tambah("Terima ka")).toEqual([]);
    expect(p.tambah("sih. Berapa la")).toEqual(["Terima kasih."]);
    expect(p.tambah("ma Anda bekerja? ")).toEqual(["Berapa lama Anda bekerja?"]);
    expect(p.tuntaskan()).toBeNull();
  });

  it("sisa tanpa tanda baca dituntaskan di akhir; markdown tidak ikut dibacakan", () => {
    const p = createPenampungKalimat();
    expect(p.tambah("**Bagus!** Lalu apa tugas")).toEqual(["Bagus!"]);
    expect(p.tambah(" Anda")).toEqual([]);
    expect(p.tuntaskan()).toBe("Lalu apa tugas Anda");
  });

  it("angka desimal/singkatan tanpa spasi sesudah titik tidak memotong kalimat", () => {
    const p = createPenampungKalimat();
    expect(p.tambah("Gaji 2.5 juta per bulan. ")).toEqual(["Gaji 2.5 juta per bulan."]);
  });
});

// ---------------------------------------------------------------------------

type Bingkai = { id: number; event: string; data: string };

const turnUser: AiChatTurn = { seq: 2, role: "user", content: "Kasir.", at: AT };
const turnAi: AiChatTurn = {
  seq: 3,
  role: "assistant",
  content: "Terima kasih. Berapa lama Anda bekerja?",
  at: AT,
};

const giliran = (id: number, t: AiChatTurn): Bingkai => ({
  id,
  event: "giliran",
  data: JSON.stringify(t),
});
const token = (id: number, data: string): Bingkai => ({ id, event: "token", data });

function sse(bingkai: readonly Bingkai[]): Response {
  const teks = bingkai
    .map((b) => `id: ${String(b.id)}\nevent: ${b.event}\ndata: ${b.data}\n\n`)
    .join("");
  return new Response(teks, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** Klien palsu: jawaban stream diambil berurutan; mencatat path & header. */
function klienPalsu(jawaban: Array<Response | Error>) {
  const panggilan: Array<{ path: string; opsi?: StreamOptions }> = [];
  const klien: ApiClient = {
    request: () => Promise.reject(new Error("tidak dipakai")),
    stream: (path, opsi) => {
      panggilan.push({ path, opsi });
      const j = jawaban.shift();
      if (j === undefined) return Promise.reject(new Error("jawaban habis"));
      return j instanceof Error ? Promise.reject(j) : Promise.resolve(j);
    },
  };
  return { klien, panggilan };
}

function pasang(klien: ApiClient) {
  const diterima: AiChatTurn[] = [];
  const muatUlang = vi.fn();
  const hook = renderHook(() =>
    useAiStream({
      klien,
      sessionId: SESI,
      onGiliran: (t) => diterima.push(t),
      onPerluMuatUlang: muatUlang,
      teksMengetik: "Pewawancara sedang mengetik…",
      tunda: () => Promise.resolve(),
    }),
  );
  return { ...hook, diterima, muatUlang };
}

describe("useAiStream — alur normal", () => {
  it("giliran tersimpan diteruskan; pengumuman: 'mengetik' lalu PER KALIMAT; berakhir diam", async () => {
    const { klien } = klienPalsu([
      sse([
        giliran(1, turnUser),
        token(2, "Terima ka"),
        token(3, "sih. Berapa lama "),
        token(4, "Anda bekerja?"),
        giliran(5, turnAi),
        { id: 6, event: "selesai", data: "" },
      ]),
    ]);
    const h = pasang(klien);

    await act(() => h.result.current.kirim("Kasir."));

    expect(h.diterima).toEqual([turnUser, turnAi]);
    expect(h.result.current.pengumuman.map((p) => p.teks)).toEqual([
      "Pewawancara sedang mengetik…",
      "Terima kasih.",
      "Berapa lama Anda bekerja?",
    ]);
    expect(h.result.current.status).toBe("diam");
    expect(h.result.current.draf).toBe("");
    expect(h.result.current.galat).toBeNull();
  });
});

describe("useAiStream — degradasi & galat", () => {
  it("event error ber-degraded (kuota habis di tengah) → galat degraded + retryAfterSeconds", async () => {
    const { klien } = klienPalsu([
      sse([
        giliran(1, turnUser),
        {
          id: 2,
          event: "error",
          data: JSON.stringify({
            code: "KUOTA_AI_HABIS",
            message: "Jatah AI hari ini habis",
            hint: "Coba besok",
            degraded: true,
            retryAfterSeconds: 7200,
          }),
        },
      ]),
    ]);
    const h = pasang(klien);
    await act(() => h.result.current.kirim("Halo"));

    expect(h.result.current.galat).toEqual({
      kode: "KUOTA_AI_HABIS",
      pesan: "Jatah AI hari ini habis",
      petunjuk: "Coba besok",
      degraded: true,
      retryAfterSeconds: 7200,
    });
    expect(h.result.current.status).toBe("diam");
  });

  it("penolakan pra-aliran AI_CHAT_DIMATIKAN (503 JSON) → degraded; AI_SEDANG_MENJAWAB → bukan degraded", async () => {
    const { ApiError } = await import("@nawasena/api-client");
    const mati = pasang(
      klienPalsu([
        new ApiError({ code: "AI_CHAT_DIMATIKAN", message: "Chat AI sedang tidak tersedia" }, 503),
      ]).klien,
    );
    await act(() => mati.result.current.kirim("Halo"));
    expect(mati.result.current.galat).toMatchObject({ kode: "AI_CHAT_DIMATIKAN", degraded: true });

    const sibuk = pasang(
      klienPalsu([new ApiError({ code: "AI_SEDANG_MENJAWAB", message: "Masih menjawab" }, 409)])
        .klien,
    );
    await act(() => sibuk.result.current.kirim("Halo"));
    expect(sibuk.result.current.galat).toMatchObject({
      kode: "AI_SEDANG_MENJAWAB",
      degraded: false,
    });
  });
});

describe("useAiStream — putus → sambung ulang", () => {
  it("aliran berakhir tanpa penutup → GET /stream dengan Last-Event-Id; giliran tidak hilang, token tidak dobel", async () => {
    const { klien, panggilan } = klienPalsu([
      // Putus sesudah token pertama — tidak ada `selesai`.
      sse([giliran(1, turnUser), token(2, "Terima kasih. ")]),
      sse([
        token(3, "Berapa lama Anda bekerja?"),
        giliran(4, turnAi),
        { id: 5, event: "selesai", data: "" },
      ]),
    ]);
    const h = pasang(klien);
    await act(() => h.result.current.kirim("Kasir."));

    expect(panggilan[1]).toEqual({
      path: `/ai/cv-chat/${SESI}/stream`,
      opsi: expect.objectContaining({ headers: { "last-event-id": "2" } }),
    });
    expect(h.diterima).toEqual([turnUser, turnAi]);
    expect(h.result.current.pengumuman.map((p) => p.teks)).toEqual([
      "Pewawancara sedang mengetik…",
      "Terima kasih.",
      "Berapa lama Anda bekerja?",
    ]);
    expect(h.result.current.galat).toBeNull();
  });

  it("aliran sudah tidak bisa disambung (404) → minta muat ulang transkrip, BUKAN galat", async () => {
    const { ApiError } = await import("@nawasena/api-client");
    const { klien } = klienPalsu([
      sse([giliran(1, turnUser)]),
      new ApiError(
        { code: "AI_ALIRAN_TIDAK_ADA", message: "Jawaban ini sudah tidak bisa disambung lagi" },
        404,
      ),
    ]);
    const h = pasang(klien);
    await act(() => h.result.current.kirim("Kasir."));

    expect(h.muatUlang).toHaveBeenCalledTimes(1);
    expect(h.result.current.galat).toBeNull();
    expect(h.result.current.status).toBe("diam");
  });

  it("server tak terjangkau terus → menyerah setelah 3 kali dengan pesan jujur", async () => {
    const { klien, panggilan } = klienPalsu([
      sse([giliran(1, turnUser)]),
      new Error("jaringan"),
      new Error("jaringan"),
      new Error("jaringan"),
    ]);
    const h = pasang(klien);
    await act(() => h.result.current.kirim("Kasir."));

    await waitFor(() => expect(h.result.current.galat?.kode).toBe("JARINGAN_GAGAL"));
    expect(panggilan).toHaveLength(4);
  });
});
