// Integration HTTP `GET /api/v1/ai/quota` (PR-043, AC-6) — server Express
// nyata, token RS256 nyata, guard sesi dari registrar PR-019.
//
// AC yang dijaga berkas ini: "endpoint mengembalikan sisa kuota per fitur milik
// PEMANGGIL", "route dideklarasikan lewat RouteRegistrar/access.authenticated()
// atau boot gagal", dan batas kebocoran: angka pagu global tidak pernah ikut
// keluar.
//
// Tidak butuh Docker: penghitungnya fake in-memory (helpers/redis-kuota.ts).
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { UserRole } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createAiModule } from "../src/modules/ai/index.js";
import { createAiQuota, kunciKuotaUser, type AiQuotaConfig } from "../src/core/ai/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { redisKuotaPalsu, type RedisKuotaPalsu } from "./helpers/redis-kuota.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";

/** 05:00Z = 12:00 WIB — 43.200 detik menuju reset. */
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const HARI = "2026-08-31";

/**
 * Angka pagu global sengaja khas (bukan 100/1000) supaya test bisa mencarinya
 * apa adanya di badan jawaban: bila kelak seseorang menambahkan `globalSisa`,
 * test ini yang merah, bukan review yang harus menangkapnya.
 */
const PAGU_GLOBAL = 987_654;

const tokens = createTokenService(SESSION_KEYS);

const akun: Record<string, { id: string; role: UserRole; tokenVersion: number }> = {
  [A]: { id: A, role: "seeker", tokenVersion: 0 },
  [B]: { id: B, role: "seeker", tokenVersion: 0 },
};

function testEnv(): Env {
  return loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
}

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
    globalPerDay: PAGU_GLOBAL,
  };
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(redis: RedisKuotaPalsu = redisKuotaPalsu()) {
  const env = testEnv();
  const logger = createLogger(env, {
    destination: new Writable({
      write(_chunk, _e, cb) {
        cb();
      },
    }),
  });
  const guards = createAccessGuards({
    tokenService: createTokenService(SESSION_KEYS),
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const quota = createAiQuota({
    redis,
    config: konfigurasi(),
    logger,
    clock: () => SIANG,
  });

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(createAiModule({ quota, routes: registry.forModule("/api/v1") }));
    },
  });
  // Gerbang PR-019: route tanpa deklarasi akses membuat boot GAGAL.
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, registry, redis };
}

function ambil(base: string, token?: string) {
  return fetch(`${base}/ai/quota`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

function tokenUntuk(userId: string): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 });
}

interface JawabanKuota {
  data: {
    hari: string;
    resetDalamDetik: number;
    fitur: Array<{ fitur: string; batas: number; terpakai: number; sisa: number }>;
    globalTersedia: boolean;
  };
}

describe("deklarasi route (AC-6)", () => {
  it("terdaftar sebagai GET /api/v1/ai/quota dengan akses authenticated", async () => {
    const { registry } = await boot();
    expect(registry.list()).toEqual([
      { method: "GET", path: "/api/v1/ai/quota", access: { kind: "authenticated" } },
    ]);
  });
});

describe("GET /api/v1/ai/quota — akses", () => {
  it("tanpa token → 401 TIDAK_TERAUTENTIKASI", async () => {
    const { base } = await boot();
    const res = await ambil(base);

    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "TIDAK_TERAUTENTIKASI",
    });
  });

  it("token tanda tangan asing → 401 SESI_TIDAK_VALID", async () => {
    const { base } = await boot();
    const res = await ambil(base, "bukan.token.sah");

    expect(res.status).toBe(401);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "SESI_TIDAK_VALID" });
  });
});

describe("GET /api/v1/ai/quota — isi jawaban", () => {
  it("melaporkan sisa jatah pemanggil per fitur", async () => {
    const redis = redisKuotaPalsu({ [kunciKuotaUser(HARI, A, "cv_chat")]: 4 });
    const { base } = await boot(redis);
    const res = await ambil(base, await tokenUntuk(A));

    expect(res.status).toBe(200);
    const body = (await res.json()) as JawabanKuota;
    expect(body.data.hari).toBe(HARI);
    expect(body.data.resetDalamDetik).toBe(43_200);
    expect(body.data.fitur).toContainEqual({
      fitur: "cv_chat",
      batas: 30,
      terpakai: 4,
      sisa: 26,
    });
    expect(body.data.globalTersedia).toBe(true);
  });

  it("pemanggil hanya melihat angkanya sendiri — tidak ada saluran menyebut orang lain", async () => {
    const redis = redisKuotaPalsu({ [kunciKuotaUser(HARI, A, "cv_chat")]: 7 });
    const { base } = await boot(redis);

    const punyaB = (await (await ambil(base, await tokenUntuk(B))).json()) as JawabanKuota;
    expect(punyaB.data.fitur.find((f) => f.fitur === "cv_chat")?.terpakai).toBe(0);

    // Tidak ada param/query untuk menyebut A; percobaan menyelundupkannya lewat
    // query tetap dijawab dengan angka milik B.
    const res = await fetch(`${base}/ai/quota?userId=${A}`, {
      headers: { authorization: `Bearer ${await tokenUntuk(B)}` },
    });
    const diselundupkan = (await res.json()) as JawabanKuota;
    expect(res.status).toBe(200);
    expect(diselundupkan.data.fitur.find((f) => f.fitur === "cv_chat")?.terpakai).toBe(0);
  });

  it("angka pagu global TIDAK ikut keluar (data operasional, PR-103)", async () => {
    const { base } = await boot();
    const res = await ambil(base, await tokenUntuk(A));
    const teks = await res.text();

    expect(teks).not.toContain(String(PAGU_GLOBAL));
    expect(JSON.parse(teks) as JawabanKuota).toMatchObject({ data: { globalTersedia: true } });
  });

  it("penghitung tak terbaca → 503 BELUM_SIAP, bukan angka karangan", async () => {
    const redis = redisKuotaPalsu();
    const { base } = await boot(redis);
    redis.matikan();

    const res = await ambil(base, await tokenUntuk(A));

    expect(res.status).toBe(503);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "BELUM_SIAP" });
  });

  it("membaca kuota TIDAK memakai kuota", async () => {
    const redis = redisKuotaPalsu();
    const { base } = await boot(redis);
    await ambil(base, await tokenUntuk(A));

    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(0);
  });
});
