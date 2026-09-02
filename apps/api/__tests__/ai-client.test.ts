// `AiClient` (PR-043b) — satu pintu yang mengikat kuota → provider → jejak biaya.
//
// AC yang dijaga berkas ini:
// - AC-3 satu panggilan sukses = TEPAT SATU peristiwa pemakaian, berisi metadata
//   biaya saja (dan tidak satu kunci pun di luar daftar itu);
// - AC-4 provider yang tercatat adalah yang BENAR-BENAR menjawab — `"groq"`
//   setelah peralihan, tidak pernah `"router"`;
// - AC-5 token diambil apa adanya dari adapter; `embed` selalu 0/0 (disengaja);
// - AC-6 kegagalan pencatatan tidak pernah mencabut jawaban yang sudah jadi;
// - AC-8 kuota diperiksa SEBELUM provider — jatah habis = provider tak tersentuh;
// - AC-9 kegagalan yang layak mengembalikan jatah, yang tidak layak tidak.
//
// Konvensi: tidak ada jaringan sama sekali (provider palsu / adapter lewat
// `FetchLike` tidak diperlukan di sini), waktu lewat `clock` yang disuntik —
// BUKAN fake timer — dan kuota memakai mesin NYATA di atas Redis palsu supaya
// yang diuji adalah penegakan kuota, bukan stub yang mencocoki dirinya sendiri.
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  AiProviderError,
  createAiClient,
  createAiQuota,
  isKuotaHabis,
  kunciKuotaGlobal,
  kunciKuotaUser,
  type AiChatRequest,
  type AiChatResponse,
  type AiClient,
  type AiEmbedResponse,
  type AiErrorCode,
  type AiJsonResponse,
  type AiProvider,
  type AiQuota,
  type AiQuotaConfig,
  type AiUsage,
  type AiUsagePeristiwa,
  type AiUsageRecorder,
} from "../src/core/ai/index.js";
import { createAiRouter } from "../src/core/ai/router.js";
import { redisKuotaPalsu, type RedisKuotaPalsu } from "./helpers/redis-kuota.js";

const USER = "018f4c1e-0000-7000-8000-00000000aa01";
const ID_BARIS = "018f4c1e-0000-7000-8000-00000000bb02";

/** 05:00Z = 12:00 WIB — jauh dari batas hari, seperti di ai-quota.test.ts. */
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const HARI = "2026-08-31";

const PERMINTAAN: AiChatRequest = {
  messages: [{ role: "user", content: "Sebutkan tiga keterampilan." }],
};

const USAGE: AiUsage = { promptTokens: 7, completionTokens: 11, totalTokens: 18 };

function konfigurasi(perUser: Partial<Record<string, number>> = {}): AiQuotaConfig {
  return {
    perUserPerDay: {
      cv_chat: 3,
      cv_finalize: 2,
      cv_check: 2,
      simplify_text: 2,
      interview_sim: 2,
      rerank: 1,
      embed: 5,
      ...perUser,
    } as AiQuotaConfig["perUserPerDay"],
    globalPerDay: 100,
  };
}

/** Provider palsu dengan spy pada ketiga kapabilitas. */
function providerPalsu(nama = "gemini", usage: AiUsage = USAGE) {
  const chat = vi.fn(
    (): Promise<AiChatResponse> =>
      Promise.resolve({ text: `jawaban ${nama}`, provider: nama, model: `model-${nama}`, usage }),
  );
  const chatJson = vi.fn(
    (): Promise<AiJsonResponse<unknown>> =>
      Promise.resolve({ data: { nilai: 1 }, provider: nama, model: `model-${nama}`, usage }),
  );
  const embed = vi.fn(
    (): Promise<AiEmbedResponse> =>
      Promise.resolve({ vector: [0.1, 0.2], dimensions: 2, provider: nama, model: `embed-${nama}` }),
  );
  return { provider: { name: nama, chat, chatJson, embed } as unknown as AiProvider, chat, chatJson, embed };
}

/** Provider palsu yang selalu gagal dengan kode tertentu (spy jumlah panggilan). */
function providerGagal(nama: string, kode: AiErrorCode) {
  const tolak = vi.fn((): Promise<never> => Promise.reject(new AiProviderError(kode, nama)));
  return {
    provider: { name: nama, chat: tolak, chatJson: tolak, embed: tolak } as unknown as AiProvider,
    tolak,
  };
}

function recorderPalsu(mode: "sukses" | "menolak" | "melempar" = "sukses") {
  const dicatat: AiUsagePeristiwa[] = [];
  const catat = vi.fn((peristiwa: AiUsagePeristiwa): Promise<void> => {
    dicatat.push(peristiwa);
    if (mode === "menolak") return Promise.reject(new Error("antrean tumbang"));
    if (mode === "melempar") throw new Error("payload cacat");
    return Promise.resolve();
  });
  return { recorder: { catat } as AiUsageRecorder, catat, dicatat };
}

interface OpsiRakit {
  provider?: AiProvider;
  quota?: AiQuota;
  recorder?: AiUsageRecorder;
  redis?: RedisKuotaPalsu;
  config?: AiQuotaConfig;
  ids?: () => string;
  clock?: () => Date;
}

function rakit(opsi: OpsiRakit = {}): {
  client: AiClient;
  redis: RedisKuotaPalsu;
  logger: { error: ReturnType<typeof vi.fn> };
} {
  const redis = opsi.redis ?? redisKuotaPalsu();
  const quota =
    opsi.quota ??
    createAiQuota({
      redis,
      config: opsi.config ?? konfigurasi(),
      logger: { warn: vi.fn(), error: vi.fn() },
      clock: () => SIANG,
    });
  const logger = { error: vi.fn() };
  const client = createAiClient({
    provider: opsi.provider ?? providerPalsu().provider,
    quota,
    recorder: opsi.recorder ?? recorderPalsu().recorder,
    logger,
    ids: opsi.ids ?? (() => ID_BARIS),
    clock: opsi.clock ?? (() => SIANG),
  });
  return { client, redis, logger };
}

describe("AC-3 — satu panggilan sukses = tepat satu peristiwa pemakaian", () => {
  it("chat mencatat SEKALI, dengan metadata biaya dan tidak satu kunci pun di luarnya", async () => {
    const rec = recorderPalsu();
    const { client } = rakit({ recorder: rec.recorder });

    const hasil = await client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN);

    expect(hasil.text).toBe("jawaban gemini");
    expect(rec.catat).toHaveBeenCalledTimes(1);
    expect(rec.dicatat[0]).toEqual({
      id: ID_BARIS,
      userId: USER,
      feature: "cv_chat",
      provider: "gemini",
      tokensIn: 7,
      tokensOut: 11,
      createdAt: SIANG,
    });
    // Daftar kunci diperiksa TERPISAH: `toEqual` menganggap kunci bernilai
    // undefined tidak ada, jadi ia sendiri tidak akan menjaring `prompt: undefined`
    // yang kelak diselipkan seseorang. Inilah penjaga "tanpa PII" di hulu.
    expect(Object.keys(rec.dicatat[0] as object).sort()).toEqual([
      "createdAt",
      "feature",
      "id",
      "provider",
      "tokensIn",
      "tokensOut",
      "userId",
    ]);
  });

  it("createdAt datang dari jam yang disuntik, bukan dari waktu mesin", async () => {
    const rec = recorderPalsu();
    const lain = new Date("2026-08-31T09:30:00.000Z");
    const { client } = rakit({ recorder: rec.recorder, clock: () => lain });

    await client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN);

    expect(rec.dicatat[0]?.createdAt).toEqual(lain);
  });

  it("promptVersion hanya muncul bila konteksnya membawanya", async () => {
    const rec = recorderPalsu();
    const { client } = rakit({ recorder: rec.recorder });

    await client.chat({ userId: USER, feature: "cv_chat", promptVersion: "cv-chat.v2" }, PERMINTAAN);

    expect(rec.dicatat[0]).toMatchObject({ promptVersion: "cv-chat.v2" });
  });

  it("json() ikut mencatat — jalur JSON bukan lubang tanpa jejak biaya", async () => {
    const rec = recorderPalsu();
    const { client } = rakit({ recorder: rec.recorder });

    const hasil = await client.json(
      { userId: USER, feature: "cv_check" },
      PERMINTAAN,
      z.object({ nilai: z.number() }),
    );

    expect(hasil.provider).toBe("gemini");
    expect(rec.catat).toHaveBeenCalledTimes(1);
    expect(rec.dicatat[0]).toMatchObject({ feature: "cv_check", tokensIn: 7, tokensOut: 11 });
  });
});

describe("AC-4 — provider yang tercatat adalah yang BENAR-BENAR menjawab", () => {
  it("Gemini tumbang, Groq menjawab → yang tercatat 'groq', BUKAN 'router'", async () => {
    // Inilah alasan `AiClient` membaca `response.provider` dan bukan
    // `provider.name`: nama router adalah "router", dan jejak biaya yang
    // menyebut "router" tidak bisa dicocokkan dengan tagihan siapa pun.
    const utama = providerGagal("gemini", "AI_PROVIDER_UNAVAILABLE");
    const cadangan = providerPalsu("groq");
    const router = createAiRouter({ primary: utama.provider, fallback: cadangan.provider });
    const rec = recorderPalsu();
    const { client } = rakit({ provider: router, recorder: rec.recorder });

    const hasil = await client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN);

    expect(hasil.provider).toBe("groq");
    expect(rec.dicatat[0]?.provider).toBe("groq");
    expect(rec.dicatat.map((p) => p.provider)).not.toContain("router");
  });
});

describe("AC-5 — token dari adapter, apa adanya", () => {
  it("usage 7/11 tercatat 7/11 — tanpa taksiran", async () => {
    const rec = recorderPalsu();
    const { client } = rakit({
      provider: providerPalsu("gemini", { promptTokens: 7, completionTokens: 11, totalTokens: 18 })
        .provider,
      recorder: rec.recorder,
    });

    await client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN);

    expect(rec.dicatat[0]).toMatchObject({ tokensIn: 7, tokensOut: 11 });
  });

  it("embed SELALU 0/0 — disengaja: biaya embedding terlacak lewat cacah baris", async () => {
    // `AiEmbedResponse` memang tidak punya `usage` (Gemini embedContent tidak
    // mengembalikan usageMetadata). Yang dijamin di sini: barisnya TETAP lahir,
    // sehingga `ai_usage_monthly.requests` tetap menghitungnya.
    const rec = recorderPalsu();
    const { client } = rakit({ recorder: rec.recorder });

    await client.embed({ userId: USER, feature: "embed" }, { text: "halo" });

    expect(rec.catat).toHaveBeenCalledTimes(1);
    expect(rec.dicatat[0]).toMatchObject({
      feature: "embed",
      provider: "gemini",
      tokensIn: 0,
      tokensOut: 0,
    });
  });

  it("angka token aneh DIJEPIT, bukan membuat seluruh jejak biaya hilang", async () => {
    // `aiUsageRecordJobSchema` menuntut bilangan bulat tak-negatif: tanpa jepitan
    // ini, satu provider yang mengirim pecahan/negatif/NaN akan membuat barisnya
    // ditolak zod dan panggilan berbayar itu tidak meninggalkan jejak apa pun.
    const rec = recorderPalsu();
    const { client } = rakit({
      provider: providerPalsu("gemini", {
        promptTokens: -3,
        completionTokens: 2.7,
        totalTokens: Number.NaN,
      }).provider,
      recorder: rec.recorder,
    });

    await client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN);

    expect(rec.dicatat[0]).toMatchObject({ tokensIn: 0, tokensOut: 2 });
  });
});

describe("AC-6 — pencatatan tidak pernah mencabut jawaban yang sudah jadi", () => {
  it("recorder yang MENOLAK: chat tetap mengembalikan jawaban, kegagalannya dicatat error", async () => {
    const rec = recorderPalsu("menolak");
    const { client, logger } = rakit({ recorder: rec.recorder });

    await expect(client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN)).resolves.toMatchObject(
      { text: "jawaban gemini" },
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("recorder yang MELEMPAR sinkron pun tidak menembus ke pemanggil", async () => {
    const rec = recorderPalsu("melempar");
    const { client, logger } = rakit({ recorder: rec.recorder });

    await expect(client.embed({ userId: USER, feature: "embed" }, { text: "halo" })).resolves.toMatchObject(
      { dimensions: 2 },
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe("AC-8 — kuota menggerbangi LLM: diperiksa SEBELUM provider", () => {
  it("jatah habis → provider TIDAK PERNAH dipanggil dan tidak ada yang dicatat", async () => {
    const p = providerPalsu();
    const rec = recorderPalsu();
    const { client } = rakit({
      provider: p.provider,
      recorder: rec.recorder,
      config: konfigurasi({ cv_chat: 1 }),
    });

    await client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN);
    expect(p.chat).toHaveBeenCalledTimes(1);

    const err = await client
      .chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(isKuotaHabis(err)).toBe(true);
    // Inilah satu-satunya penggerbangan yang berarti: memeriksa SESUDAH memanggil
    // hanya menghitung uang yang sudah terbakar.
    expect(p.chat).toHaveBeenCalledTimes(1);
    expect(rec.catat).toHaveBeenCalledTimes(1);
  });

  it("tuas darurat (jatah 0) menolak embed tanpa menyentuh provider", async () => {
    const p = providerPalsu();
    const { client } = rakit({ provider: p.provider, config: konfigurasi({ embed: 0 }) });

    await expect(
      client.embed({ userId: USER, feature: "embed" }, { text: "halo" }),
    ).rejects.toSatisfy(isKuotaHabis);
    expect(p.embed).not.toHaveBeenCalled();
  });
});

describe("AC-9 — reserve-then-refund di jalur AiClient", () => {
  it("AI_TIMEOUT: jatah kembali, error asli diteruskan apa adanya, tidak ada baris dicatat", async () => {
    const rec = recorderPalsu();
    const redis = redisKuotaPalsu();
    const { client } = rakit({
      provider: providerGagal("gemini", "AI_TIMEOUT").provider,
      recorder: rec.recorder,
      redis,
    });

    await expect(client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN)).rejects.toMatchObject(
      { code: "AI_TIMEOUT" },
    );

    expect(redis.nilai(kunciKuotaUser(HARI, USER, "cv_chat"))).toBe(0);
    expect(redis.nilai(kunciKuotaGlobal(HARI))).toBe(0);
    expect(rec.catat).not.toHaveBeenCalled();
  });

  it.each<AiErrorCode>(["AI_SAFETY_BLOCK", "AI_INVALID_OUTPUT", "AI_RATE_LIMIT"])(
    "%s TIDAK mengembalikan jatah — tokennya sudah terbakar atau anggaran sedang tertekan",
    async (kode) => {
      const redis = redisKuotaPalsu();
      const { client } = rakit({ provider: providerGagal("gemini", kode).provider, redis });

      await expect(
        client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN),
      ).rejects.toMatchObject({ code: kode });

      expect(redis.nilai(kunciKuotaUser(HARI, USER, "cv_chat"))).toBe(1);
    },
  );

  it("kegagalan yang layak tetap memotong jatah bila ia terjadi lagi — refund bukan jatah gratis", async () => {
    const redis = redisKuotaPalsu();
    const { client } = rakit({
      provider: providerGagal("gemini", "AI_NETWORK_ERROR").provider,
      redis,
      config: konfigurasi({ cv_chat: 2 }),
    });

    for (let i = 0; i < 5; i += 1) {
      await expect(
        client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN),
      ).rejects.toMatchObject({ code: "AI_NETWORK_ERROR" });
    }
    // Lima kegagalan yang seluruhnya dikembalikan → penghitung tetap nol, dan
    // panggilan berikutnya masih punya jatah penuh.
    expect(redis.nilai(kunciKuotaUser(HARI, USER, "cv_chat"))).toBe(0);
  });
});

describe("E1 — kuota fail open: pemakaian TETAP dicatat", () => {
  it("Redis mati + AI_QUOTA_FAIL_OPEN → panggilan lewat, dan jejak biayanya justru lebih dibutuhkan", async () => {
    const redis = redisKuotaPalsu();
    redis.matikan();
    const quota = createAiQuota({
      redis,
      config: konfigurasi(),
      logger: { warn: vi.fn(), error: vi.fn() },
      clock: () => SIANG,
      failOpen: true,
    });
    const rec = recorderPalsu();
    const { client } = rakit({ quota, recorder: rec.recorder });

    await client.chat({ userId: USER, feature: "cv_chat" }, PERMINTAAN);

    expect(rec.catat).toHaveBeenCalledTimes(1);
    expect(rec.dicatat[0]).toMatchObject({ userId: USER, provider: "gemini" });
  });
});
