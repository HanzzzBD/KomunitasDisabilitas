// Integration HTTP feed matching (PR-073) — server Express nyata, token RS256
// nyata, guard sesi PR-019, kuota ASLI (Redis palsu), `AiClient` ASLI dengan
// provider penghitung, dan service re-rank worker ASLI yang dijalankan manual.
//
// Yang dibuktikan: kontrak identik mode normal/turun (golden), feed tetap sah
// saat AI mati, penjelasan tanpa istilah kondisi, pagination stabil, refresh
// berkuota, dan keadaan kosong. Tidak butuh Docker.
import { describe, it, expect, afterEach, vi } from "vitest";
import { Writable } from "node:stream";
import {
  matchesResponseSchema,
  type AiRerankFeedJob,
  type JobSearchResult,
  type MatchesResponse,
} from "@nawasena/schemas";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import {
  AiProviderError,
  createAiClient,
  createAiQuota,
  type AiProvider,
  type AiQuotaConfig,
} from "../src/core/ai/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import {
  BATAS_TUNGGU_RERANK_MS,
  createFeedCacheService,
  createMatchesController,
  createMatchesService,
  createMatchingRouter,
  createPenandaRerank,
  createRerankService,
  menyebutKondisi,
  type LowonganUntukFeed,
  type SkorLowongan,
} from "../src/modules/matching/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { redisKuotaPalsu } from "./helpers/redis-kuota.js";
import { repoMatchScoresMemori } from "./helpers/match-scores-memori.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const SIANG = new Date("2026-09-30T05:00:00.000Z"); // 12.00 WIB
const jobId = (n: number): string => `018f4c1e-0000-7000-8000-${String(n).padStart(12, "0")}`;
const JUMLAH = 25;

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

const tokens = createTokenService(SESSION_KEYS);
const akun = {
  [A]: { id: A, role: "seeker" as const, tokenVersion: 0 },
  [B]: { id: B, role: "seeker" as const, tokenVersion: 0 },
};

function kartu(n: number): LowonganUntukFeed {
  const k: JobSearchResult = {
    id: jobId(n),
    companyId: "018f4c1e-0000-7000-8000-0000000c0001",
    companyName: "PT Uji",
    title: `Lowongan ${String(n)}`,
    employmentType: "full_time",
    workMode: n % 2 === 0 ? "remote" : "onsite",
    city: "Bandung",
    province: "Jawa Barat",
    accommodations: ["jam_kerja_fleksibel"],
    publishedAt: "2026-09-01T00:00:00.000Z",
  };
  return { kartu: k, requirements: "Menguasai Excel", description: "Mengelola data." };
}

const skorN = (n: number): SkorLowongan[] =>
  Array.from({ length: n }, (_, i) => ({
    jobId: jobId(i + 1),
    skor: Number((0.9 - i * 0.01).toFixed(4)),
    komponen: { kemiripan: 0.9, akomodasi: 0.2, lokasi: 1, kebaruan: 1 },
  }));

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

interface OpsiBoot {
  rerankAktif?: boolean;
  gagalLlm?: boolean;
  hitung?: (userId: string) => SkorLowongan[] | null;
}

async function boot(o: OpsiBoot = {}) {
  let jam = SIANG;
  const clock = () => jam;
  const env = loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
  const logger = createLogger(env, {
    destination: new Writable({ write: (_c, _e, cb) => cb() }),
  });
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) => Promise.resolve(akun[id as keyof typeof akun] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const quota = createAiQuota({ redis: redisKuotaPalsu(), config: KONFIG, logger, clock });
  const repo = repoMatchScoresMemori();
  const penandaIsi = new Map<string, string>();
  const penanda = createPenandaRerank({
    redis: {
      set: (k: string, v: string) => Promise.resolve(void penandaIsi.set(k, v)),
      get: (k: string) => Promise.resolve(penandaIsi.get(k) ?? null),
    },
    logger,
  });
  const katalog = new Map(Array.from({ length: JUMLAH }, (_, i) => [jobId(i + 1), kartu(i + 1)]));
  const antre: AiRerankFeedJob[] = [];
  const hitung = vi.fn((actor: { userId: string }) =>
    Promise.resolve(o.hitung === undefined ? skorN(JUMLAH) : o.hitung(actor.userId)),
  );
  const feed = createFeedCacheService({
    repo,
    quota,
    jobs: {
      enqueue: (job) => {
        antre.push(job);
        return Promise.resolve();
      },
    },
    hitung,
    aktif: o.rerankAktif ?? true,
    penanda,
    logger,
    clock,
  });
  const profil = { city: "Bandung", province: "Jawa Barat", openToRemote: true };
  const service = createMatchesService({
    feed,
    bacaProfil: () => Promise.resolve(profil),
    // "Tuli" di keahlian: teks bebas pengguna yang TIDAK boleh sampai ke penjelasan.
    bacaKeahlian: () => Promise.resolve([{ name: "Tuli" }, { name: "Excel" }]),
    bacaLowongan: (ids) =>
      Promise.resolve(ids.flatMap((id) => (katalog.has(id) ? [katalog.get(id)!] : []))),
    clock,
  });

  // Worker re-rank ASLI di atas repo & kuota yang sama.
  const chatJson = vi.fn(() =>
    o.gagalLlm === true
      ? Promise.reject(new AiProviderError("AI_PROVIDER_UNAVAILABLE", "gemini"))
      : Promise.resolve({
          data: {
            urutan: [
              { ref: 3, alasan: "Cocok karena Anda menguasai Excel" },
              { ref: 1, alasan: "Cocok untuk Anda yang Tuli" }, // ditolak filter → template
            ],
          },
          provider: "gemini",
          model: "flash",
          usage: { promptTokens: 1, completionTokens: 1 },
        }),
  );
  const ai = createAiClient({
    provider: { name: "gemini", chat: vi.fn(), chatJson, embed: vi.fn() } as unknown as AiProvider,
    quota,
    recorder: { catat: () => Promise.resolve() },
    logger,
    clock,
  });
  const rerank = createRerankService({
    repo,
    ai,
    quota,
    bacaProfil: () =>
      Promise.resolve({ ...profil, headline: null, keahlian: [{ name: "Excel" }], pengalaman: [] }),
    bacaLowongan: (ids) =>
      Promise.resolve(
        ids.flatMap((id) => {
          const l = katalog.get(id);
          return l === undefined
            ? []
            : [{ ...l.kartu, requirements: l.requirements, description: l.description }];
        }),
      ),
    logger,
  });
  async function kerjakan() {
    while (antre.length > 0) {
      const job = antre.shift();
      if (job !== undefined) await rerank.jalankan(job, { percobaanTerakhir: true });
    }
  }

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createMatchingRouter(createMatchesController(service), registry.forModule("/api/v1")),
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  const base = `http://127.0.0.1:${String(port)}/api/v1`;

  async function panggil(
    metode: "GET" | "POST",
    path: string,
    userId: string | null = A,
  ): Promise<{ status: number; body: MatchesResponse & { code?: string } }> {
    const headers: Record<string, string> = {};
    if (userId !== null) {
      headers.authorization = `Bearer ${await tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 })}`;
    }
    const res = await fetch(`${base}${path}`, { method: metode, headers });
    return { status: res.status, body: (await res.json()) as MatchesResponse & { code?: string } };
  }

  return {
    registry,
    panggil,
    kerjakan,
    antre,
    chatJson,
    hitung,
    katalog,
    majukan: (ms: number) => {
      jam = new Date(jam.getTime() + ms);
    },
  };
}

/** Bentuk struktural: kunci + tipe, rekursif — nilai diabaikan. */
function bentuk(nilai: unknown): unknown {
  if (Array.isArray(nilai)) return nilai.length === 0 ? [] : [bentuk(nilai[0])];
  if (nilai !== null && typeof nilai === "object") {
    return Object.fromEntries(
      Object.entries(nilai)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, bentuk(v)]),
    );
  }
  return nilai === null ? "null|string" : typeof nilai === "string" ? "null|string" : typeof nilai;
}

describe("deklarasi route", () => {
  it("GET /me/matches & POST /me/matches/refresh — authenticated; tanpa sesi 401", async () => {
    const m = await boot();
    const rute = m.registry.list().map((r) => `${r.method} ${r.path} ${r.access.kind}`);
    expect(rute).toEqual(
      expect.arrayContaining([
        "GET /api/v1/me/matches authenticated",
        "POST /api/v1/me/matches/refresh authenticated",
      ]),
    );
    expect((await m.panggil("GET", "/me/matches", null)).status).toBe(401);
    expect((await m.panggil("POST", "/me/matches/refresh", null)).status).toBe(401);
  });
});

describe("mode normal, menyusun, dan turun", () => {
  it("muat pertama: skor + template, aiMenyusun; sesudah worker: urutan & penjelasan AI", async () => {
    const m = await boot();
    const pertama = await m.panggil("GET", "/me/matches");
    expect(pertama.status).toBe(200);
    expect(matchesResponseSchema.safeParse(pertama.body).success).toBe(true);
    expect(pertama.body.data).toHaveLength(20);
    expect(pertama.body.meta).toMatchObject({
      degraded: false,
      aiMenyusun: true,
      sisaRefresh: 2,
      alasanKosong: null,
      diperbaruiPada: SIANG.toISOString(),
    });
    expect(pertama.body.data.map((d) => d.job.id)).toEqual(skorN(20).map((s) => s.jobId));
    expect(pertama.body.data.every((d) => d.explanationSource === "template")).toBe(true);

    await m.kerjakan();
    const kedua = await m.panggil("GET", "/me/matches");
    expect(kedua.body.meta).toMatchObject({ degraded: false, aiMenyusun: false, sisaRefresh: 2 });
    expect(kedua.body.data[0]).toMatchObject({
      job: { id: jobId(3) },
      explanation: "Cocok karena Anda menguasai Excel.",
      explanationSource: "ai",
    });
    // Alasan LLM yang menyebut kondisi ditolak → item tetap ada, penjelasan template.
    expect(kedua.body.data[1]).toMatchObject({
      job: { id: jobId(1) },
      explanationSource: "template",
    });
    expect(m.chatJson).toHaveBeenCalledTimes(1);
  });

  it("GOLDEN: mode normal dan mode turun berkontrak identik", async () => {
    const normal = await boot();
    await normal.panggil("GET", "/me/matches");
    await normal.kerjakan();
    const n = (await normal.panggil("GET", "/me/matches")).body;
    await active?.stop();

    const turun = await boot({ rerankAktif: false });
    const t = (await turun.panggil("GET", "/me/matches")).body;

    expect(n.meta.degraded).toBe(false);
    expect(t.meta.degraded).toBe(true);
    expect(n.data.some((d) => d.explanationSource === "ai")).toBe(true);
    expect(t.data.every((d) => d.explanationSource === "template")).toBe(true);
    expect(matchesResponseSchema.safeParse(n).success).toBe(true);
    expect(matchesResponseSchema.safeParse(t).success).toBe(true);
    expect(bentuk(t)).toEqual(bentuk(n));
    expect(Object.keys(t.meta).sort()).toEqual(Object.keys(n.meta).sort());
  });

  it("AI mati (flag) → feed valid + template 'Cocok: remote, sesuai keahlian X', tanpa jatah", async () => {
    const m = await boot({ rerankAktif: false });
    const r = await m.panggil("GET", "/me/matches");
    expect(r.body.meta).toMatchObject({ degraded: true, aiMenyusun: false, sisaRefresh: 3 });
    const remote = r.body.data.find((d) => d.job.workMode === "remote");
    expect(remote?.explanation).toBe(
      "Cocok: bisa kerja dari rumah (remote), sesuai keahlian Excel.",
    );
    expect(m.antre).toHaveLength(0);
  });

  it("LLM gagal di percobaan terakhir → degraded, jatah kembali", async () => {
    const m = await boot({ gagalLlm: true });
    await m.panggil("GET", "/me/matches");
    await m.kerjakan();
    m.majukan(1_000);
    const r = await m.panggil("GET", "/me/matches");
    // Penanda masih "dijadwalkan" dan belum lewat batas → masih menunggu…
    expect(r.body.meta.aiMenyusun).toBe(true);
    m.majukan(BATAS_TUNGGU_RERANK_MS);
    const lewat = await m.panggil("GET", "/me/matches");
    expect(lewat.body.meta).toMatchObject({ degraded: true, aiMenyusun: false, sisaRefresh: 3 });
  });

  it("penjelasan TIDAK PERNAH menyebut kondisi — keahlian 'Tuli' di profil, alasan LLM 'yang Tuli'", async () => {
    const m = await boot();
    await m.panggil("GET", "/me/matches");
    await m.kerjakan();
    for (const path of ["/me/matches?limit=50", "/me/matches?limit=50"]) {
      const r = await m.panggil("GET", path);
      for (const d of r.body.data)
        expect(menyebutKondisi(d.explanation), d.explanation).toBe(false);
    }
  });
});

describe("pagination", () => {
  async function jelajah(
    m: Awaited<ReturnType<typeof boot>>,
    limit: number,
    sela?: () => Promise<void>,
  ) {
    const ids: string[] = [];
    let cursor: string | null = null;
    let halaman = 0;
    do {
      const q: string = cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`;
      const r = await m.panggil("GET", `/me/matches?limit=${String(limit)}${q}`);
      expect(r.status).toBe(200);
      ids.push(...r.body.data.map((d) => d.job.id));
      cursor = r.body.meta.nextCursor;
      if (halaman++ === 0 && sela !== undefined) await sela();
    } while (cursor !== null);
    return ids;
  }

  it("seluruh halaman = seluruh feed, tanpa duplikat, urutan skor", async () => {
    const m = await boot();
    const ids = await jelajah(m, 7);
    expect(ids).toEqual(skorN(JUMLAH).map((s) => s.jobId));
  });

  it("re-rank selesai DI ANTARA halaman → urutan halaman 1 tetap berlaku (stabil)", async () => {
    const m = await boot();
    const ids = await jelajah(m, 7, () => m.kerjakan());
    expect(ids).toEqual(skorN(JUMLAH).map((s) => s.jobId));
  });

  it("cursor angkatan lama (sesudah refresh) / rusak → 400; limit > 50 → 400", async () => {
    const m = await boot();
    const r = await m.panggil("GET", "/me/matches?limit=5");
    const cursor = r.body.meta.nextCursor ?? "";
    m.majukan(1_000);
    await m.panggil("POST", "/me/matches/refresh");
    const basi = await m.panggil("GET", `/me/matches?cursor=${encodeURIComponent(cursor)}`);
    expect(basi.status).toBe(400);
    expect(basi.body.code).toBe("VALIDATION_ERROR");
    expect((await m.panggil("GET", "/me/matches?cursor=bukan-cursor")).status).toBe(400);
    expect((await m.panggil("GET", "/me/matches?limit=51")).status).toBe(400);
  });

  it("lowongan yang sudah ditutup tidak disajikan dari cache", async () => {
    const m = await boot();
    await m.panggil("GET", "/me/matches");
    m.katalog.delete(jobId(1));
    const r = await m.panggil("GET", "/me/matches?limit=50");
    expect(r.body.data.map((d) => d.job.id)).not.toContain(jobId(1));
    expect(r.body.data).toHaveLength(JUMLAH - 1);
  });
});

describe("refresh berkuota", () => {
  it("POST refresh memotong jatah; ke-4 → feed yang ada + sisaRefresh 0; GET tidak memotong", async () => {
    const m = await boot();
    const awal = await m.panggil("GET", "/me/matches");
    expect(awal.body.meta.sisaRefresh).toBe(2);
    await m.panggil("GET", "/me/matches");
    for (const sisa of [1, 0]) {
      m.majukan(1_000);
      const r = await m.panggil("POST", "/me/matches/refresh");
      expect(r.status).toBe(200);
      expect(r.body.meta.sisaRefresh).toBe(sisa);
    }
    const sebelum = (await m.panggil("GET", "/me/matches")).body.meta.diperbaruiPada;
    m.majukan(1_000);
    const keempat = await m.panggil("POST", "/me/matches/refresh");
    expect(keempat.status).toBe(200);
    expect(keempat.body.meta).toMatchObject({ sisaRefresh: 0, diperbaruiPada: sebelum });
    expect(m.hitung).toHaveBeenCalledTimes(3);
  });
});

describe("keadaan kosong & isolasi", () => {
  it("profil tanpa vektor → data [] + profil-belum-siap; tanpa kandidat → tanpa-kecocokan", async () => {
    const m = await boot({ hitung: (u) => (u === A ? null : []) });
    const a = await m.panggil("GET", "/me/matches");
    expect(a.body).toMatchObject({
      data: [],
      meta: {
        alasanKosong: "profil-belum-siap",
        degraded: false,
        aiMenyusun: false,
        sisaRefresh: 3,
      },
    });
    const b = await m.panggil("GET", "/me/matches", B);
    expect(b.body.meta.alasanKosong).toBe("tanpa-kecocokan");
    expect(matchesResponseSchema.safeParse(a.body).success).toBe(true);
  });

  it("feed milik pemanggil saja", async () => {
    const m = await boot({ hitung: (u) => (u === A ? skorN(3) : skorN(1)) });
    expect((await m.panggil("GET", "/me/matches")).body.data).toHaveLength(3);
    expect((await m.panggil("GET", "/me/matches", B)).body.data).toHaveLength(1);
  });
});
