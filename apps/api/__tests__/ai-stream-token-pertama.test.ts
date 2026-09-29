// Batas token-pertama pada router stream (PR-068b, utang U-26).
//
// Latensi Gemini melonjak menurut waktu (terukur 7–22 dtk pada 2026-09-28,
// ~1 dtk pada 2026-09-29). Router kini memindahkan permintaan ke cadangan bila
// provider utama BELUM mengirim satu token pun dalam batasnya — dan hanya saat
// itu: sesudah token pertama, aturan PR-045 (kegagalan = galat) tetap berlaku.
//
// Penjadwal disuntik (aturan repo: tanpa fake timer).
import { describe, it, expect } from "vitest";
import {
  AiProviderError,
  createAiStreamRouter,
  createGeminiStream,
  type AiStreamProvider,
  type LaporanStream,
} from "../src/core/ai/index.js";

function penjadwalManual() {
  const antre: Array<{ fn: () => void; ms: number; dihentikan: boolean }> = [];
  return {
    antre,
    penjadwal: {
      setelah(fn: () => void, ms: number) {
        const e = { fn, ms, dihentikan: false };
        antre.push(e);
        return () => {
          e.dihentikan = true;
        };
      },
    },
    picu() {
      for (const e of antre) if (!e.dihentikan) e.fn();
    },
  };
}

/** Provider utama yang diam sampai dibatalkan lewat `opsi.signal`. */
function utamaDiam(): AiStreamProvider & { dibatalkan: () => boolean } {
  let batal = false;
  return {
    name: "gemini",
    dibatalkan: () => batal,
    // eslint-disable-next-line require-yield -- diam sampai dibatalkan
    async *chatStream(_r, opsi) {
      await new Promise<void>((_, tolak) => {
        opsi?.signal?.addEventListener("abort", () => {
          batal = true;
          tolak(new AiProviderError("AI_TIMEOUT", "gemini"));
        });
      });
    },
  };
}

function cadangan(teks: readonly string[]): AiStreamProvider {
  return {
    name: "groq",
    async *chatStream(_r, opsi) {
      for (const t of teks) yield t;
      opsi?.saatSelesai?.({ provider: "groq" });
    },
  };
}

async function habiskan(sumber: AsyncIterable<string>): Promise<string> {
  let teks = "";
  for await (const p of sumber) teks += p;
  return teks;
}

describe("batas token-pertama", () => {
  it("utama diam melewati batas → dibatalkan, cadangan menjawab, laporan dari cadangan", async () => {
    const j = penjadwalManual();
    const utama = utamaDiam();
    const router = createAiStreamRouter(utama, cadangan(["Halo ", "dari Groq"]), {
      batasTokenPertamaMs: 8_000,
      penjadwal: j.penjadwal,
    });
    let laporan: LaporanStream | undefined;
    const hasil = habiskan(
      router.chatStream({ messages: [] }, { saatSelesai: (l) => (laporan = l) }),
    );
    await Promise.resolve();
    expect(j.antre.map((e) => e.ms)).toEqual([8_000]);

    j.picu();
    expect(await hasil).toBe("Halo dari Groq");
    expect(utama.dibatalkan()).toBe(true);
    expect(laporan?.provider).toBe("groq");
  });

  it("utama menjawab sebelum batas → tanpa cadangan, penjadwal dihentikan", async () => {
    const j = penjadwalManual();
    const router = createAiStreamRouter(
      {
        name: "gemini",
        async *chatStream() {
          yield "Cepat ";
          yield "dari Gemini";
        },
      },
      cadangan(["TIDAK BOLEH"]),
      { batasTokenPertamaMs: 8_000, penjadwal: j.penjadwal },
    );

    expect(await habiskan(router.chatStream({ messages: [] }))).toBe("Cepat dari Gemini");
    expect(j.antre[0]?.dihentikan).toBe(true);
  });

  it("gagal SESUDAH token pertama tetap galat — batas tidak mengubah aturan PR-045", async () => {
    const j = penjadwalManual();
    const router = createAiStreamRouter(
      {
        name: "gemini",
        async *chatStream() {
          yield "setengah";
          throw new AiProviderError("AI_NETWORK_ERROR", "gemini");
        },
      },
      cadangan(["TIDAK BOLEH"]),
      { batasTokenPertamaMs: 8_000, penjadwal: j.penjadwal },
    );
    await expect(habiskan(router.chatStream({ messages: [] }))).rejects.toMatchObject({
      code: "AI_NETWORK_ERROR",
    });
  });

  it("tanpa cadangan, batas tidak berlaku — utama boleh selambat timeout-nya", async () => {
    const j = penjadwalManual();
    const router = createAiStreamRouter(
      {
        name: "gemini",
        async *chatStream() {
          yield "lambat tapi sampai";
        },
      },
      undefined,
      { batasTokenPertamaMs: 8_000, penjadwal: j.penjadwal },
    );
    expect(await habiskan(router.chatStream({ messages: [] }))).toBe("lambat tapi sampai");
    expect(j.antre).toEqual([]);
  });

  it("adapter Gemini benar-benar membatalkan fetch-nya lewat opsi.signal", async () => {
    let dibatalkan = false;
    const gemini = createGeminiStream(
      { apiKey: "k", baseUrl: "https://g.invalid", chatModel: "m", timeoutMs: 60_000 },
      (_url, init) =>
        new Promise<Response>((_, tolak) => {
          init.signal?.addEventListener("abort", () => {
            dibatalkan = true;
            tolak(Object.assign(new Error("dibatalkan"), { name: "AbortError" }));
          });
        }),
    );
    const j = penjadwalManual();
    const router = createAiStreamRouter(gemini, cadangan(["ok"]), {
      batasTokenPertamaMs: 8_000,
      penjadwal: j.penjadwal,
    });
    const hasil = habiskan(router.chatStream({ messages: [] }));
    await Promise.resolve();
    j.picu();
    expect(await hasil).toBe("ok");
    expect(dibatalkan).toBe(true);
  });
});
