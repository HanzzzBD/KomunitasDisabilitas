// AI CV Builder — integrasi HTTP (PR-066): server Express nyata, token RS256
// nyata, SSE nyata lewat soket, `AiClient` + mesin kuota ASLI.
//
// Yang dipalsukan hanya tiga tepi: provider stream (tanpa jaringan), penghitung
// kuota Redis (helpers/redis-kuota), dan tabel sesi (repository di memori —
// jaminan konkurensinya milik PostgreSQL dan sudah dibuktikan PR-065 di
// `ai-chat-sessions-db.test.ts`).
//
// AC phase-10 PR-066 yang dijaga di sini:
//   - streaming end-to-end (mock provider)
//   - kuota habis → event error terstruktur (degraded) di stream
//   - putus → sambung tanpa kehilangan giliran
//   - versi prompt tercatat di ai_usage
//   - fallback Groq menghasilkan format giliran yang sama
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { AiChatTurn, UserRole } from "@nawasena/schemas";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import {
  AiProviderError,
  createAiClient,
  createAiQuota,
  createAiStreamRouter,
  cvInterviewerV1,
  kunciKuotaUser,
  type AiQuotaConfig,
  type AiStreamProvider,
  type AiUsagePeristiwa,
} from "../src/core/ai/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import {
  createAiChatSessionsController,
  createAiChatSessionsRouter,
  createAiChatSessionsService,
  createAiCvChatRouter,
  createCvChatController,
  createCvChatService,
  createRegistriAliran,
  type ChatSessionRow,
  type ChatSessionsRepository,
} from "../src/modules/ai/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { redisKuotaPalsu } from "./helpers/redis-kuota.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
/** 05:00Z = 12:00 WIB. */
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const HARI = "2026-08-31";

const tokens = createTokenService(SESSION_KEYS);
const akun: Record<string, { id: string; role: UserRole; tokenVersion: number }> = {
  [A]: { id: A, role: "seeker", tokenVersion: 0 },
  [B]: { id: B, role: "seeker", tokenVersion: 0 },
};

const env = loadEnv({
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
  REDIS_URL: "redis://127.0.0.1:9",
  REDIS_QUEUE_URL: "redis://127.0.0.1:9",
  NODE_ENV: "test",
  PORT: "0",
  HOST: "127.0.0.1",
});
const logger = createLogger(env, { destination: new Writable({ write: (_c, _e, cb) => cb() }) });

function konfigurasi(): AiQuotaConfig {
  return {
    perUserPerDay: {
      cv_chat: 30,
      cv_finalize: 5,
      cv_check: 5,
      simplify_text: 20,
      interview_sim: 10,
      rerank: 3,
      embed: 50,
    },
    globalPerDay: 10_000,
  };
}

/** Tabel `ai_chat_sessions` di memori — kontrak repository yang sama. */
function repoMemori(): ChatSessionsRepository {
  const baris = new Map<string, ChatSessionRow & { userId: string }>();
  const salin = (b: ChatSessionRow): ChatSessionRow => ({ ...b, transcript: [...b.transcript] });
  const aktif = (u: string) =>
    [...baris.values()].find((b) => b.userId === u && b.status === "active");
  return {
    findOwned: (u, id) => {
      const b = baris.get(id);
      return Promise.resolve(b !== undefined && b.userId === u ? salin(b) : null);
    },
    findActive: (u) => {
      const b = aktif(u);
      return Promise.resolve(b === undefined ? null : salin(b));
    },
    createOrGetActive: (u, id, now) => {
      const ada = aktif(u);
      if (ada !== undefined) return Promise.resolve({ row: salin(ada), baru: false });
      const b = {
        userId: u,
        id,
        status: "active" as const,
        transcript: [],
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
      };
      baris.set(id, b);
      return Promise.resolve({ row: salin(b), baru: true });
    },
    appendTurn: (u, id, g, batas) => {
      const b = baris.get(id);
      if (b === undefined || b.userId !== u)
        return Promise.resolve({ ok: false as const, sebab: "tidak-ada" as const });
      if (b.status !== "active")
        return Promise.resolve({ ok: false as const, sebab: "selesai" as const });
      if (b.transcript.length >= batas.maxTurns)
        return Promise.resolve({ ok: false as const, sebab: "penuh" as const });
      const turn: AiChatTurn = {
        seq: b.transcript.length + 1,
        role: g.role,
        content: g.content,
        at: g.at.toISOString(),
      };
      b.transcript.push(turn);
      b.updatedAt = g.at;
      return Promise.resolve({ ok: true as const, turn });
    },
    listForExport: () => Promise.resolve([]),
    countRetention: () => Promise.resolve(0),
    deleteRetentionBatch: () => Promise.resolve(0),
  };
}

/** Provider stream palsu: potongan tetap, opsional menunggu gerbang di tengah. */
function streamPalsu(
  nama: string,
  potongan: readonly string[],
  opsi: { gerbang?: Promise<void>; setelah?: number } = {},
): AiStreamProvider & { dipanggil: number } {
  const p = {
    name: nama,
    dipanggil: 0,
    async *chatStream(_r: unknown, o?: { saatSelesai?(l: unknown): void }) {
      p.dipanggil += 1;
      for (const [i, teks] of potongan.entries()) {
        if (opsi.gerbang !== undefined && i === (opsi.setelah ?? 1)) await opsi.gerbang;
        yield teks;
      }
      o?.saatSelesai?.({
        provider: nama,
        usage: { promptTokens: 120, completionTokens: 14, totalTokens: 134 },
      });
    },
  };
  return p as AiStreamProvider & { dipanggil: number };
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(o: {
  stream: AiStreamProvider;
  kuotaAwal?: Record<string, number>;
  aktif?: boolean;
}) {
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const quota = createAiQuota({
    redis: redisKuotaPalsu(o.kuotaAwal),
    config: konfigurasi(),
    logger,
    clock: () => SIANG,
  });
  const tercatat: AiUsagePeristiwa[] = [];
  const client = createAiClient({
    provider: {} as never,
    streamProvider: o.stream,
    quota,
    recorder: {
      catat: (p) => {
        tercatat.push(p);
        return Promise.resolve();
      },
    },
    logger,
    clock: () => SIANG,
  });
  const chatSessions = createAiChatSessionsService({ repo: repoMemori(), clock: () => SIANG });
  const cvChat = createCvChatService({
    chatSessions,
    ai: client,
    registri: createRegistriAliran({ penunda: { tunda: () => undefined } }),
    template: cvInterviewerV1,
    aktif: o.aktif ?? true,
    logger,
  });
  const routes = registry.forModule("/api/v1");
  createAiChatSessionsRouter(createAiChatSessionsController(chatSessions), routes);
  createAiCvChatRouter(createCvChatController(cvChat), routes);

  const api = createServer(env, logger, { routes: (app) => app.use(routes.router) });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${String(port)}/api/v1`, tercatat };
}

async function header(userId: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 })}`,
    "content-type": "application/json",
  };
}

async function mulai(base: string, userId = A) {
  const res = await fetch(`${base}/ai/cv-chat/sessions`, {
    method: "POST",
    headers: await header(userId),
  });
  return { res, body: (await res.json()) as { data: { id: string; turns: AiChatTurn[] } } };
}

async function kirim(
  base: string,
  sessionId: string,
  message: string,
  userId = A,
  signal?: AbortSignal,
) {
  return fetch(`${base}/ai/cv-chat`, {
    method: "POST",
    headers: await header(userId),
    body: JSON.stringify({ sessionId, message }),
    ...(signal === undefined ? {} : { signal }),
  });
}

interface EventSse {
  id?: number;
  event?: string;
  data: string;
}

/** Pembaca SSE minimal — bingkai dipisah baris kosong, komentar (`:`) dilewati. */
async function* bacaSse(res: Response): AsyncGenerator<EventSse> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const dek = new TextDecoder();
  let sisa = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    sisa += dek.decode(value, { stream: true });
    let i = sisa.indexOf("\n\n");
    while (i !== -1) {
      const bingkai = sisa.slice(0, i);
      sisa = sisa.slice(i + 2);
      i = sisa.indexOf("\n\n");
      if (bingkai.startsWith(":")) continue;
      const e: EventSse = { data: "" };
      const data: string[] = [];
      for (const b of bingkai.split("\n")) {
        if (b.startsWith("id: ")) e.id = Number(b.slice(4));
        else if (b.startsWith("event: ")) e.event = b.slice(7);
        else if (b.startsWith("data: ")) data.push(b.slice(6));
      }
      e.data = data.join("\n");
      yield e;
    }
  }
}

async function semua(res: Response): Promise<EventSse[]> {
  const hasil: EventSse[] = [];
  for await (const e of bacaSse(res)) hasil.push(e);
  return hasil;
}

const GEMINI_TOKEN = ["Terima kasih. ", "Berapa lama ", "Anda bekerja di sana?"];

describe("POST /ai/cv-chat/sessions", () => {
  it("sesi baru 201 berisi salam statis; panggilan kedua 200 sesi yang sama — tanpa AI", async () => {
    const stream = streamPalsu("gemini", GEMINI_TOKEN);
    const { base, tercatat } = await boot({ stream });

    const pertama = await mulai(base);
    expect(pertama.res.status).toBe(201);
    expect(pertama.body.data.turns).toEqual([
      expect.objectContaining({ seq: 1, role: "assistant", content: cvInterviewerV1.salamPembuka }),
    ]);

    const kedua = await mulai(base);
    expect(kedua.res.status).toBe(200);
    expect(kedua.body.data.id).toBe(pertama.body.data.id);
    expect(kedua.body.data.turns).toHaveLength(1);

    expect(stream.dipanggil).toBe(0);
    expect(tercatat).toEqual([]);
  });
});

describe("POST /ai/cv-chat — streaming end-to-end", () => {
  it("giliran → token… → giliran → selesai; transkrip dan ai_usage tercatat", async () => {
    const { base, tercatat } = await boot({ stream: streamPalsu("gemini", GEMINI_TOKEN) });
    const { body } = await mulai(base);

    const res = await kirim(base, body.data.id, "Saya kasir di toko roti.");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const events = await semua(res);
    expect(events.map((e) => e.event)).toEqual([
      "giliran",
      "token",
      "token",
      "token",
      "giliran",
      "selesai",
    ]);
    // Nomor event naik tanpa lubang — dasar sambung ulang.
    expect(events.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6]);

    const pengguna = JSON.parse(events[0]?.data ?? "") as AiChatTurn;
    const asisten = JSON.parse(events[4]?.data ?? "") as AiChatTurn;
    expect(pengguna).toMatchObject({ seq: 2, role: "user", content: "Saya kasir di toko roti." });
    expect(asisten).toMatchObject({ seq: 3, role: "assistant", content: GEMINI_TOKEN.join("") });

    const sesi = await fetch(`${base}/ai/cv-chat/${body.data.id}`, { headers: await header(A) });
    const { data } = (await sesi.json()) as { data: { turns: AiChatTurn[] } };
    expect(data.turns.map((t) => t.role)).toEqual(["assistant", "user", "assistant"]);

    // AC: versi prompt tercatat di ai_usage.
    expect(tercatat).toEqual([
      expect.objectContaining({
        userId: A,
        feature: "cv_chat",
        provider: "gemini",
        promptVersion: "cv-interviewer.v1",
        tokensIn: 120,
        tokensOut: 14,
      }),
    ]);
  });

  it("fallback Groq: format giliran tersimpan SAMA dengan jawaban Gemini", async () => {
    const gemini: AiStreamProvider = {
      name: "gemini",
      // eslint-disable-next-line require-yield -- tumbang sebelum token pertama
      async *chatStream() {
        throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", "gemini");
      },
    };
    const groq = streamPalsu("groq", [
      "Asisten: **Terima kasih.** ",
      "Berapa lama Anda bekerja di sana?\n\n\n",
    ]);
    const { base, tercatat } = await boot({ stream: createAiStreamRouter(gemini, groq) });
    const { body } = await mulai(base);

    const events = await semua(await kirim(base, body.data.id, "Kasir."));
    const asisten = JSON.parse(
      events.filter((e) => e.event === "giliran")[1]?.data ?? "",
    ) as AiChatTurn;

    expect(asisten.content).toBe("Terima kasih. Berapa lama Anda bekerja di sana?");
    expect(tercatat[0]).toMatchObject({ provider: "groq", promptVersion: "cv-interviewer.v1" });
  });
});

describe("POST /ai/cv-chat — kuota & degradasi", () => {
  it("kuota habis → event `error` KUOTA_AI_HABIS ber-degradasi + retryAfterSeconds; provider tak disentuh", async () => {
    const stream = streamPalsu("gemini", GEMINI_TOKEN);
    const { base, tercatat } = await boot({
      stream,
      kuotaAwal: { [kunciKuotaUser(HARI, A, "cv_chat")]: 30 },
    });
    const { body } = await mulai(base);

    const res = await kirim(base, body.data.id, "Halo");
    expect(res.status).toBe(200);
    const events = await semua(res);

    expect(events.map((e) => e.event)).toEqual(["giliran", "error"]);
    const galat = JSON.parse(events[1]?.data ?? "") as Record<string, unknown>;
    expect(galat).toMatchObject({ code: "KUOTA_AI_HABIS", degraded: true });
    expect(galat["retryAfterSeconds"]).toBe(43_200);
    expect(stream.dipanggil).toBe(0);
    expect(tercatat).toEqual([]);

    // Pesan pengguna TIDAK hilang: ia tetap di transkrip untuk ekstraksi.
    const sesi = await fetch(`${base}/ai/cv-chat/${body.data.id}`, { headers: await header(A) });
    const { data } = (await sesi.json()) as { data: { turns: AiChatTurn[] } };
    expect(data.turns.at(-1)).toMatchObject({ role: "user", content: "Halo" });
  });

  it("provider tidak tersedia sebelum token pertama → `error` ber-degradasi", async () => {
    const mati: AiStreamProvider = {
      name: "gemini",
      // eslint-disable-next-line require-yield -- gagal sebelum token pertama
      async *chatStream() {
        throw new AiProviderError("AI_NOT_CONFIGURED", "gemini");
      },
    };
    const { base } = await boot({ stream: mati });
    const { body } = await mulai(base);
    const events = await semua(await kirim(base, body.data.id, "Halo"));
    expect(JSON.parse(events.at(-1)?.data ?? "")).toMatchObject({
      code: "AI_NOT_CONFIGURED",
      degraded: true,
    });
  });

  it("tuas AI_CV_CHAT_ENABLED=false → 503 AI_CHAT_DIMATIKAN (JSON) di kedua POST", async () => {
    const { base } = await boot({ stream: streamPalsu("gemini", GEMINI_TOKEN), aktif: false });
    const r1 = await fetch(`${base}/ai/cv-chat/sessions`, {
      method: "POST",
      headers: await header(A),
    });
    expect(r1.status).toBe(503);
    expect(await r1.json()).toMatchObject({ code: "AI_CHAT_DIMATIKAN" });
    const r2 = await kirim(base, "018f4c1e-0000-7000-8000-0000000000a1", "Halo");
    expect(r2.status).toBe(503);
  });
});

describe("POST /ai/cv-chat — pra-aliran (JSON)", () => {
  it("sesi milik orang lain → 404; tanpa token → 401; body tak sah → 400", async () => {
    const { base } = await boot({ stream: streamPalsu("gemini", GEMINI_TOKEN) });
    const { body } = await mulai(base, A);

    const milikOrang = await kirim(base, body.data.id, "Halo", B);
    expect(milikOrang.status).toBe(404);
    expect(await milikOrang.json()).toMatchObject({ code: "AI_SESI_TIDAK_DITEMUKAN" });

    const tanpaToken = await fetch(`${base}/ai/cv-chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: body.data.id, message: "x" }),
    });
    expect(tanpaToken.status).toBe(401);

    const kosong = await kirim(base, body.data.id, "   ");
    expect(kosong.status).toBe(400);
  });
});

describe("putus → sambung ulang tanpa kehilangan giliran", () => {
  it("koneksi diputus di tengah; GET /stream + Last-Event-Id menerima sisa aliran, giliran tersimpan", async () => {
    let buka!: () => void;
    const gerbang = new Promise<void>((r) => {
      buka = r;
    });
    const { base } = await boot({
      stream: streamPalsu("gemini", GEMINI_TOKEN, { gerbang, setelah: 1 }),
    });
    const { body } = await mulai(base);

    // 1. Terima sampai token pertama, lalu PUTUS (simulasi 3G).
    const pemutus = new AbortController();
    const res = await kirim(base, body.data.id, "Kasir.", A, pemutus.signal);
    const diterima: EventSse[] = [];
    try {
      for await (const e of bacaSse(res)) {
        diterima.push(e);
        if (e.event === "token") break;
      }
    } finally {
      pemutus.abort();
    }
    const idTerakhir = diterima.at(-1)?.id ?? 0;
    expect(diterima.map((e) => e.event)).toEqual(["giliran", "token"]);

    // 2. Selama jawaban masih mengalir, pesan kedua ditolak 409 (JSON).
    const bentrok = await kirim(base, body.data.id, "Halo lagi");
    expect(bentrok.status).toBe(409);
    expect(await bentrok.json()).toMatchObject({ code: "AI_SEDANG_MENJAWAB" });

    // 3. Sambung ulang, lalu biarkan provider melanjutkan.
    const sambung = await fetch(`${base}/ai/cv-chat/${body.data.id}/stream`, {
      headers: { ...(await header(A)), "last-event-id": String(idTerakhir) },
    });
    expect(sambung.status).toBe(200);
    buka();
    const sisa = await semua(sambung);

    // Tanpa duplikat, tanpa lubang: id melanjutkan tepat setelah yang diterima.
    expect(sisa[0]?.id).toBe(idTerakhir + 1);
    expect(sisa.map((e) => e.event)).toEqual(["token", "token", "giliran", "selesai"]);
    const teks = [...diterima, ...sisa]
      .filter((e) => e.event === "token")
      .map((e) => e.data)
      .join("");
    expect(teks).toBe(GEMINI_TOKEN.join(""));

    // 4. Giliran asisten tersimpan utuh.
    const sesi = await fetch(`${base}/ai/cv-chat/${body.data.id}`, { headers: await header(A) });
    const { data } = (await sesi.json()) as { data: { turns: AiChatTurn[] } };
    expect(data.turns.map((t) => t.role)).toEqual(["assistant", "user", "assistant"]);
    expect(data.turns[2]?.content).toBe(GEMINI_TOKEN.join(""));
  });

  it("sambung ulang aliran orang lain / yang tidak ada → 404; Last-Event-Id rusak → 400", async () => {
    const { base } = await boot({ stream: streamPalsu("gemini", GEMINI_TOKEN) });
    const { body } = await mulai(base);
    await semua(await kirim(base, body.data.id, "Kasir."));

    const orangLain = await fetch(`${base}/ai/cv-chat/${body.data.id}/stream`, {
      headers: await header(B),
    });
    expect(orangLain.status).toBe(404);
    expect(await orangLain.json()).toMatchObject({ code: "AI_ALIRAN_TIDAK_ADA" });

    const rusak = await fetch(`${base}/ai/cv-chat/${body.data.id}/stream`, {
      headers: { ...(await header(A)), "last-event-id": "abc" },
    });
    expect(rusak.status).toBe(400);

    // Aliran sudah selesai tetapi masih dalam retensi: pemilik menerima
    // putar ulang lengkap termasuk `selesai`.
    const ulang = await fetch(`${base}/ai/cv-chat/${body.data.id}/stream`, {
      headers: { ...(await header(A)), "last-event-id": "4" },
    });
    expect((await semua(ulang)).map((e) => e.event)).toEqual(["giliran", "selesai"]);
  });
});
