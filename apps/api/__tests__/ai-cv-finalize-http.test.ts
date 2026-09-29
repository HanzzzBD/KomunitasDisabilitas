// Finalize AI CV Builder — integrasi HTTP (PR-067): server Express nyata,
// token RS256 nyata, mesin kuota ASLI (penghitung Redis palsu), antrean palsu.
//
// Yang dijaga: 202 + satu job + SATU jatah `cv_finalize`; finalize ganda aman
// (tanpa job/jatah kedua); semua penolakan pra-antrean TIDAK memakan jatah;
// antrean yang menolak mengembalikan sesi & jatah; chat ditolak selama
// finalisasi. Pekerjaan worker-nya diuji di `ai-cv-ekstraksi.test.ts`.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { AiExtractResumeJob, UserRole } from "@nawasena/schemas";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import {
  createAiQuota,
  cvInterviewerV1,
  kunciKuotaUser,
  type AiQuotaConfig,
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
  createAiCvFinalizeRouter,
  createCvChatController,
  createCvChatService,
  createCvFinalizeController,
  createCvFinalizeService,
  createRegistriAliran,
} from "../src/modules/ai/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { redisKuotaPalsu, type RedisKuotaPalsu } from "./helpers/redis-kuota.js";
import { repoSesiMemori } from "./helpers/chat-sessions-memori.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const HARI = "2026-08-31";
const KUNCI_FINALIZE = kunciKuotaUser(HARI, A, "cv_finalize");

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

const konfigurasi: AiQuotaConfig = {
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

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(
  o: { kuotaAwal?: Record<string, number>; jumlahCv?: number; antreanGagal?: boolean } = {},
) {
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const redis: RedisKuotaPalsu = redisKuotaPalsu(o.kuotaAwal);
  const quota = createAiQuota({ redis, config: konfigurasi, logger, clock: () => SIANG });
  const repo = repoSesiMemori();
  const chatSessions = createAiChatSessionsService({ repo, clock: () => SIANG });
  const registri = createRegistriAliran({ penunda: { tunda: () => undefined } });
  const antre: AiExtractResumeJob[] = [];
  const finalize = createCvFinalizeService({
    repo,
    registri,
    quota,
    cv: { jumlah: () => Promise.resolve(o.jumlahCv ?? 0) },
    maksCv: 5,
    jobs: {
      enqueue: (job) => {
        if (o.antreanGagal === true) return Promise.reject(new Error("Redis antrean mati"));
        antre.push(job);
        return Promise.resolve();
      },
    },
    aktif: true,
    clock: () => SIANG,
  });
  const cvChat = createCvChatService({
    chatSessions,
    ai: { stream: () => Promise.reject(new Error("tidak dipakai")) },
    registri,
    template: cvInterviewerV1,
    aktif: true,
    logger,
  });
  const routes = registry.forModule("/api/v1");
  createAiChatSessionsRouter(createAiChatSessionsController(chatSessions), routes);
  createAiCvChatRouter(createCvChatController(cvChat), routes);
  createAiCvFinalizeRouter(createCvFinalizeController(finalize), routes);
  const api = createServer(env, logger, { routes: (app) => app.use(routes.router) });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${String(port)}/api/v1`, antre, redis, repo, chatSessions };
}

async function header(userId = A): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 })}`,
    "content-type": "application/json",
  };
}

/** Sesi aktif milik A dengan salam + satu jawaban pengguna. */
async function sesiBerisi(ctx: Awaited<ReturnType<typeof boot>>, jawab = true): Promise<string> {
  const { session } = await ctx.chatSessions.mulaiAtauLanjutkan({ userId: A });
  await ctx.chatSessions.tambahGiliran({ userId: A }, session.id, {
    role: "assistant",
    content: cvInterviewerV1.salamPembuka,
  });
  if (jawab) {
    await ctx.chatSessions.tambahGiliran({ userId: A }, session.id, {
      role: "user",
      content: "Saya kasir dua tahun.",
    });
  }
  return session.id;
}

async function finalisasi(base: string, sesi: string, userId = A) {
  const res = await fetch(`${base}/ai/cv-chat/${sesi}/finalize`, {
    method: "POST",
    headers: await header(userId),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe("POST /ai/cv-chat/:session/finalize", () => {
  it("202 finalizing; satu job membawa reservasi cv_finalize; tepat SATU jatah terpotong", async () => {
    const ctx = await boot();
    const sesi = await sesiBerisi(ctx);

    const { res, body } = await finalisasi(ctx.base, sesi);
    expect(res.status).toBe(202);
    expect(body).toEqual({ data: { sessionId: sesi, status: "finalizing", resumeId: null } });
    expect(ctx.antre).toEqual([
      expect.objectContaining({
        sessionId: sesi,
        userId: A,
        reservasi: expect.objectContaining({ feature: "cv_finalize", userId: A, tercatat: true }),
      }),
    ]);
    expect(ctx.redis.nilai(KUNCI_FINALIZE)).toBe(1);
    expect(ctx.repo.baris.get(sesi)?.status).toBe("finalizing");
  });

  it("finalize GANDA → 202 yang sama, tanpa job kedua, tanpa jatah kedua", async () => {
    const ctx = await boot();
    const sesi = await sesiBerisi(ctx);
    await finalisasi(ctx.base, sesi);
    const kedua = await finalisasi(ctx.base, sesi);

    expect(kedua.res.status).toBe(202);
    expect(ctx.antre).toHaveLength(1);
    expect(ctx.redis.nilai(KUNCI_FINALIZE)).toBe(1);
  });

  it("sesudah draft jadi → 200 finalized dengan resumeId, tanpa jatah", async () => {
    const ctx = await boot();
    const sesi = await sesiBerisi(ctx);
    await finalisasi(ctx.base, sesi);
    await ctx.repo.selesaiFinalisasi(A, sesi, sesi, SIANG);

    const { res, body } = await finalisasi(ctx.base, sesi);
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { sessionId: sesi, status: "finalized", resumeId: sesi } });
    expect(ctx.redis.nilai(KUNCI_FINALIZE)).toBe(1);
  });

  it("finalize ulang setelah ekstraksi GAGAL → diterima lagi, jejak gagal dihapus", async () => {
    const ctx = await boot();
    const sesi = await sesiBerisi(ctx);
    await finalisasi(ctx.base, sesi);
    await ctx.repo.gagalFinalisasi(A, sesi, "AI_INVALID_OUTPUT", SIANG);

    const lagi = await finalisasi(ctx.base, sesi);
    expect(lagi.res.status).toBe(202);
    expect(ctx.antre).toHaveLength(2);
    expect(ctx.repo.baris.get(sesi)).toMatchObject({ status: "finalizing", extractionError: null });
  });

  it("penolakan pra-antrean TIDAK memakan jatah: sesi kosong 409, batas CV 409", async () => {
    const kosong = await boot();
    const s1 = await sesiBerisi(kosong, false);
    const r1 = await finalisasi(kosong.base, s1);
    expect(r1.res.status).toBe(409);
    expect(r1.body).toMatchObject({ code: "AI_SESI_KOSONG" });
    expect(kosong.redis.nilai(KUNCI_FINALIZE)).toBe(0);
    await active?.stop();

    const penuh = await boot({ jumlahCv: 5 });
    const s2 = await sesiBerisi(penuh);
    const r2 = await finalisasi(penuh.base, s2);
    expect(r2.res.status).toBe(409);
    expect(r2.body).toMatchObject({ code: "BATAS_CV_TERCAPAI" });
    expect(penuh.redis.nilai(KUNCI_FINALIZE)).toBe(0);
    expect(penuh.repo.baris.get(s2)?.status).toBe("active");
  });

  it("jatah finalize habis → 429 KUOTA_AI_HABIS (JSON) + Retry-After; sesi tetap aktif", async () => {
    const ctx = await boot({ kuotaAwal: { [KUNCI_FINALIZE]: 5 } });
    const sesi = await sesiBerisi(ctx);
    const { res, body } = await finalisasi(ctx.base, sesi);

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("43200");
    expect(body).toMatchObject({ code: "KUOTA_AI_HABIS" });
    expect(ctx.antre).toEqual([]);
    expect(ctx.repo.baris.get(sesi)?.status).toBe("active");
  });

  it("antrean menolak → sesi kembali aktif TANPA jejak gagal, jatah dikembalikan", async () => {
    const ctx = await boot({ antreanGagal: true });
    const sesi = await sesiBerisi(ctx);
    const { res } = await finalisasi(ctx.base, sesi);

    expect(res.status).toBe(500);
    expect(ctx.repo.baris.get(sesi)).toMatchObject({ status: "active", extractionError: null });
    expect(ctx.redis.nilai(KUNCI_FINALIZE)).toBe(0);
  });

  it("sesi milik orang lain → 404 identik dengan yang tidak ada", async () => {
    const ctx = await boot();
    const sesi = await sesiBerisi(ctx);
    const orang = await finalisasi(ctx.base, sesi, B);
    const tiada = await finalisasi(ctx.base, "018f4c1e-0000-7000-8000-0000000000ff");
    expect(orang.res.status).toBe(404);
    expect(orang.body).toEqual(tiada.body);
  });
});

describe("chat selama finalisasi", () => {
  it("pesan baru ditolak 409 AI_SESI_SEDANG_DIFINALISASI; 'mulai' mengembalikan sesi yang sama", async () => {
    const ctx = await boot();
    const sesi = await sesiBerisi(ctx);
    await finalisasi(ctx.base, sesi);

    const kirim = await fetch(`${ctx.base}/ai/cv-chat`, {
      method: "POST",
      headers: await header(),
      body: JSON.stringify({ sessionId: sesi, message: "tambahan" }),
    });
    expect(kirim.status).toBe(409);
    expect(await kirim.json()).toMatchObject({ code: "AI_SESI_SEDANG_DIFINALISASI" });

    const mulai = await fetch(`${ctx.base}/ai/cv-chat/sessions`, {
      method: "POST",
      headers: await header(),
    });
    expect(mulai.status).toBe(200);
    expect(await mulai.json()).toMatchObject({ data: { id: sesi, status: "finalizing" } });
  });
});
