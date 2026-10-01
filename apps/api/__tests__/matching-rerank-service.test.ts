// Kebijakan cache/refresh (API) + eksekusi re-rank (worker) — PR-072.
//
// Kuota dan `AiClient` di sini ASLI (`createAiQuota` di atas Redis palsu,
// `createAiClient` dengan provider penghitung): AC "tanpa panggilan LLM" dan
// "refresh ke-4 → cache + info kuota" dibuktikan lewat penghitung panggilan
// provider dan penghitung kuota yang sesungguhnya, bukan lewat mock service.
import { describe, it, expect, vi } from "vitest";
import type { AiRerankFeedJob } from "@nawasena/schemas";
import {
  AiProviderError,
  createAiClient,
  createAiQuota,
  type AiProvider,
  type AiQuotaConfig,
  type RerankKeluaran,
} from "../src/core/ai/index.js";
import {
  UMUR_CACHE_FEED_MS,
  createFeedCacheService,
  createRerankService,
  type LowonganUntukRerank,
  type SkorLowongan,
} from "../src/modules/matching/index.js";
import { redisKuotaPalsu } from "./helpers/redis-kuota.js";
import { repoMatchScoresMemori } from "./helpers/match-scores-memori.js";

const USER = "018f4c1e-0000-7000-8000-00000000aaaa";
const SIANG = new Date("2026-09-30T05:00:00.000Z");
const jobId = (n: number): string => `018f4c1e-0000-7000-8000-${String(n).padStart(12, "0")}`;

const KONFIG: AiQuotaConfig = {
  perUserPerDay: {
    cv_chat: 30,
    cv_finalize: 5,
    cv_check: 5,
    simplify_text: 20,
    interview_sim: 5,
    rerank: 3,
    embed: 100,
  },
  globalPerDay: 1_000,
};

const skorN = (n: number): SkorLowongan[] =>
  Array.from({ length: n }, (_, i) => ({
    jobId: jobId(i + 1),
    skor: 0.9 - i * 0.01,
    komponen: { kemiripan: 0.9, akomodasi: 0.5, lokasi: 1, kebaruan: 1 },
  }));

const lowonganDari = (ids: readonly string[]): LowonganUntukRerank[] =>
  ids.map((id) => ({
    id,
    title: `Lowongan ${id.slice(-2)}`,
    description: "Mengelola data.",
    requirements: null,
    workMode: "remote",
    city: null,
    province: null,
    accommodations: [],
  }));

function rakit(o: { aktif?: boolean; jawaban?: RerankKeluaran; gagal?: AiProviderError } = {}) {
  let jam = SIANG;
  const clock = () => jam;
  const redis = redisKuotaPalsu();
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const quota = createAiQuota({ redis, config: KONFIG, logger, clock });
  const chatJson = vi.fn(() =>
    o.gagal !== undefined
      ? Promise.reject(o.gagal)
      : Promise.resolve({
          data: o.jawaban ?? { urutan: [{ ref: 2, alasan: "Cocok karena bisa dari rumah" }] },
          provider: "gemini",
          model: "flash",
          usage: { promptTokens: 10, completionTokens: 5 },
        }),
  );
  const provider = {
    name: "gemini",
    chat: vi.fn(),
    chatJson,
    embed: vi.fn(),
  } as unknown as AiProvider;
  const ai = createAiClient({
    provider,
    quota,
    recorder: { catat: () => Promise.resolve() },
    logger,
    clock,
  });
  const repo = repoMatchScoresMemori();
  const antre: AiRerankFeedJob[] = [];
  const hitung = vi.fn(() => Promise.resolve<SkorLowongan[] | null>(skorN(25)));
  const enqueue = vi.fn((job: AiRerankFeedJob) => {
    antre.push(job);
    return Promise.resolve();
  });
  const feed = createFeedCacheService({
    repo,
    quota,
    jobs: { enqueue },
    hitung,
    aktif: o.aktif ?? true,
    logger,
    clock,
  });
  const bacaLowongan = vi.fn((ids: readonly string[]) => Promise.resolve(lowonganDari(ids)));
  const rerank = createRerankService({
    repo,
    ai,
    quota,
    bacaProfil: () =>
      Promise.resolve({
        headline: null,
        city: null,
        province: null,
        openToRemote: true,
        keahlian: [{ name: "Excel" }],
        pengalaman: [],
      }),
    bacaLowongan,
    logger,
  });
  /** Worker memproses semua job yang mengantre. */
  async function kerjakan(opsi = { percobaanTerakhir: true }) {
    const hasil = [];
    while (antre.length > 0) {
      const job = antre.shift();
      if (job !== undefined) hasil.push(await rerank.jalankan(job, opsi));
    }
    return hasil;
  }
  return {
    feed,
    rerank,
    repo,
    antre,
    enqueue,
    hitung,
    chatJson,
    quota,
    redis,
    bacaLowongan,
    kerjakan,
    majukan: (ms: number) => {
      jam = new Date(jam.getTime() + ms);
    },
  };
}

const aktor = { userId: USER, requestId: "req-pr072" };

describe("feed cache — AC-1: request kedua dalam 24 jam tanpa LLM", () => {
  it("muat pertama: angkatan baru + 1 job; muat kedua (<24 jam): cache, 0 panggilan LLM tambahan", async () => {
    const m = rakit();
    const pertama = await m.feed.segarkan(aktor, { paksa: false });
    expect(pertama).toMatchObject({ sumber: "baru", rerank: "dijadwalkan", sisaRefresh: 2 });
    expect(pertama.feed).toHaveLength(25);
    expect(m.antre).toHaveLength(1);

    await m.kerjakan();
    expect(m.chatJson).toHaveBeenCalledTimes(1);

    // 6 jam kemudian — hari WIB yang sama (12.00 → 18.00), cache masih segar.
    m.majukan(6 * 60 * 60 * 1000);
    const kedua = await m.feed.segarkan(aktor, { paksa: false });
    expect(kedua).toMatchObject({ sumber: "cache", rerank: "tidak-perlu", sisaRefresh: 2 });
    expect(m.hitung).toHaveBeenCalledTimes(1);
    expect(m.antre).toHaveLength(0);
    expect(m.chatJson).toHaveBeenCalledTimes(1);
    // Hasil re-rank terbaca dari cache: ref 2 di urutan teratas, berpenjelasan.
    expect(kedua.feed[0]).toMatchObject({
      jobId: jobId(2),
      rank: 1,
      explanation: "Cocok karena bisa dari rumah.",
    });
  });

  it("cache tepat 24 jam → dihitung ulang dan di-rerank lagi (jatah hari baru terpotong)", async () => {
    const m = rakit();
    await m.feed.segarkan(aktor, { paksa: false });
    m.majukan(UMUR_CACHE_FEED_MS);
    const lagi = await m.feed.segarkan(aktor, { paksa: false });
    // 24 jam selalu melewati tengah malam WIB: jatah hari baru 3 − 1.
    expect(lagi).toMatchObject({ sumber: "baru", rerank: "dijadwalkan", sisaRefresh: 2 });
    expect(m.hitung).toHaveBeenCalledTimes(2);
  });
});

describe("feed cache — AC-3: refresh ke-4 dalam sehari → cache + info kuota", () => {
  it("tiga refresh memotong jatah; yang keempat memakai cache tanpa menghitung ulang", async () => {
    const m = rakit();
    for (const sisa of [2, 1, 0]) {
      const h = await m.feed.segarkan(aktor, { paksa: true });
      expect(h).toMatchObject({ sumber: "baru", rerank: "dijadwalkan", sisaRefresh: sisa });
      await m.kerjakan();
    }
    const cacheSebelum = m.repo.baris(USER).map((b) => ({ ...b }));

    const keempat = await m.feed.segarkan(aktor, { paksa: true });
    expect(keempat).toMatchObject({ sumber: "cache", rerank: "kuota-habis", sisaRefresh: 0 });
    expect(m.hitung).toHaveBeenCalledTimes(3);
    expect(m.antre).toHaveLength(0);
    expect(m.chatJson).toHaveBeenCalledTimes(3);
    // Cache lama UTUH, termasuk hasil re-rank-nya.
    expect(m.repo.baris(USER)).toEqual(cacheSebelum);
    expect(keempat.feed[0]?.rank).toBe(1);
  });

  it("cache terinvalidasi (profil disunting) + jatah habis → skor deterministik baru, tanpa job", async () => {
    const m = rakit();
    for (let i = 0; i < 3; i++) await m.feed.segarkan(aktor, { paksa: true });
    m.antre.length = 0;
    // Invalidasi PR-069: `profile.updated` menghapus seluruh baris pengguna.
    await m.repo.gantiAngkatan(USER, [], new Date(0));
    const h = await m.feed.segarkan(aktor, { paksa: false });
    expect(h).toMatchObject({ sumber: "baru", rerank: "kuota-habis", sisaRefresh: 0 });
    expect(m.antre).toHaveLength(0);
    expect(h.feed.every((b) => b.rank === null && b.explanation === null)).toBe(true);
  });
});

describe("feed cache — jalur turun lain", () => {
  it("rerank dimatikan (flag) → tanpa jatah, tanpa job; refresh paksa memakai cache", async () => {
    const m = rakit({ aktif: false });
    const h = await m.feed.segarkan(aktor, { paksa: false });
    expect(h).toMatchObject({ sumber: "baru", rerank: "dimatikan", sisaRefresh: 3 });
    const paksa = await m.feed.segarkan(aktor, { paksa: true });
    expect(paksa).toMatchObject({ sumber: "cache", rerank: "dimatikan", sisaRefresh: 3 });
    expect(m.enqueue).not.toHaveBeenCalled();
  });

  it("tanpa vektor profil (hitung → null) → profil-belum-siap, jatah dikembalikan", async () => {
    const m = rakit();
    m.hitung.mockResolvedValueOnce(null);
    const h = await m.feed.segarkan(aktor, { paksa: false });
    expect(h).toMatchObject({ sumber: "baru", rerank: "profil-belum-siap", sisaRefresh: 3 });
    expect(h.computedAt).toBeNull();
  });

  it("antrean menolak → feed deterministik tetap ada, jatah dikembalikan", async () => {
    const m = rakit();
    m.enqueue.mockRejectedValueOnce(new Error("redis mati"));
    const h = await m.feed.segarkan(aktor, { paksa: false });
    expect(h).toMatchObject({ sumber: "baru", rerank: "gagal-antre", sisaRefresh: 3 });
    expect(h.feed).toHaveLength(25);
  });

  it("hitung skor gagal → error naik, jatah dikembalikan", async () => {
    const m = rakit();
    m.hitung.mockRejectedValueOnce(new Error("db mati"));
    await expect(m.feed.segarkan(aktor, { paksa: false })).rejects.toThrow("db mati");
    expect((await m.quota.ringkasan(USER)).fitur.find((f) => f.fitur === "rerank")?.sisa).toBe(3);
  });
});

describe("rerank worker — whitelist & angkatan", () => {
  it("hanya top-20 dikirim; lowongan titipan model tidak pernah masuk feed", async () => {
    const m = rakit({
      jawaban: {
        urutan: [
          { ref: 21, alasan: "Titipan di luar top-20" },
          { ref: 999, alasan: "Titipan" },
          { ref: 5, alasan: "Cocok dengan Excel Anda" },
        ],
      },
    });
    await m.feed.segarkan(aktor, { paksa: false });
    const [hasil] = await m.kerjakan();
    expect(hasil).toEqual({ status: "selesai", diperbarui: 20, berpenjelasan: 1 });
    expect(m.bacaLowongan.mock.calls[0]?.[0]).toHaveLength(20);

    const feed = await m.repo.bacaFeed(USER);
    expect(feed).toHaveLength(25);
    expect(new Set(feed.map((b) => b.jobId))).toEqual(new Set(skorN(25).map((s) => s.jobId)));
    expect(feed[0]).toMatchObject({ jobId: jobId(5), rank: 1 });
    // Di luar top-20: tanpa rank, tetap di feed menurut skor.
    expect(feed.filter((b) => b.rank === null).map((b) => b.jobId)).toEqual(
      [21, 22, 23, 24, 25].map(jobId),
    );
  });

  it("angkatan basi (diganti sebelum job jalan) → dilewati, jatah pulang, tanpa LLM", async () => {
    const m = rakit();
    await m.feed.segarkan(aktor, { paksa: false });
    const basi = m.antre.shift();
    m.majukan(1_000);
    await m.feed.segarkan(aktor, { paksa: true });
    expect(basi).toBeDefined();
    if (basi === undefined) return;
    const hasil = await m.rerank.jalankan(basi, { percobaanTerakhir: false });
    expect(hasil).toEqual({ status: "dilewati", sebab: "angkatan-basi" });
    expect(m.chatJson).not.toHaveBeenCalled();
    expect((await m.quota.ringkasan(USER)).fitur.find((f) => f.fitur === "rerank")?.sisa).toBe(2);
  });

  it("provider gagal: bukan percobaan terakhir → dilempar (retry); terakhir → gagal + jatah pulang", async () => {
    const m = rakit({ gagal: new AiProviderError("AI_PROVIDER_UNAVAILABLE", "gemini") });
    await m.feed.segarkan(aktor, { paksa: false });
    const job = m.antre[0];
    expect(job).toBeDefined();
    if (job === undefined) return;
    await expect(m.rerank.jalankan(job, { percobaanTerakhir: false })).rejects.toThrow();
    const akhir = await m.rerank.jalankan(job, { percobaanTerakhir: true });
    expect(akhir).toEqual({ status: "gagal", kode: "AI_PROVIDER_UNAVAILABLE" });
    expect((await m.quota.ringkasan(USER)).fitur.find((f) => f.fitur === "rerank")?.sisa).toBe(3);
    // Feed tetap utuh, tanpa rank.
    expect(m.repo.baris(USER).every((b) => b.rank === null)).toBe(true);
  });

  it("worker TIDAK memotong jatah kedua (memakai reservasi API)", async () => {
    const m = rakit();
    await m.feed.segarkan(aktor, { paksa: false });
    await m.kerjakan();
    expect((await m.quota.ringkasan(USER)).fitur.find((f) => f.fitur === "rerank")?.sisa).toBe(2);
  });
});
