// "Sederhanakan" teks lowongan (PR-087) — unit penjaga fakta + integrasi HTTP.
//
// Integrasinya memakai server Express nyata, token RS256 nyata, `AiClient`
// ASLI dengan mesin kuota ASLI (Redis kuota palsu) dan cache prompt ASLI (Redis
// cache palsu). Yang dipalsukan hanya penyedia AI (menghitung panggilan) dan
// pembaca lowongan. Dengan begitu AC "konten sama → cache hit tanpa panggilan
// kedua" dan "kuota 20/hari" dibuktikan oleh mesin yang sama dengan produksi.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { UserRole } from "@nawasena/schemas";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import {
  AiProviderError,
  createAiClient,
  createAiPromptCache,
  createAiQuota,
  kunciCachePrompt,
  kunciKuotaUser,
  simplifyV1,
  type AiProvider,
  type AiQuotaConfig,
  type CacheRedisLike,
} from "../src/core/ai/index.js";
import { appError } from "../src/core/http/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import {
  angkaTerjaga,
  createAiSimplifyModule,
  teksPolos,
  type TeksLowongan,
} from "../src/modules/ai/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { redisKuotaPalsu, type RedisKuotaPalsu } from "./helpers/redis-kuota.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const JOB = "018f4c1e-0000-7000-8000-00000000c001";
const JOB_LAIN = "018f4c1e-0000-7000-8000-00000000c002";
const TIDAK_ADA = "018f4c1e-0000-7000-8000-00000000c0ff";
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const HARI = "2026-08-31";

const DESKRIPSI =
  "Kami mencari Staf Administrasi yang akan mengelola dokumentasi operasional. " +
  "Gaji Rp5.000.000 per bulan, jam kerja 08.00-16.00, pengalaman minimal 2 tahun.";
const SEDERHANA =
  "Anda akan mengurus dokumen kantor.\n- Gaji Rp5.000.000 per bulan.\n" +
  "- Kerja jam 08.00 sampai 16.00.\n- Punya pengalaman kerja 2 tahun.";

const LOWONGAN: Record<string, TeksLowongan> = {
  [JOB]: { description: DESKRIPSI, requirements: null },
  // Isi deskripsinya SAMA dengan JOB — cache adalah per KONTEN, bukan per id.
  [JOB_LAIN]: { description: DESKRIPSI, requirements: "Bisa memakai Excel." },
};

describe("angkaTerjaga — penjaga fakta angka", () => {
  it("angka yang sama, ditulis ulang formatnya, lolos", () => {
    expect(angkaTerjaga(DESKRIPSI, SEDERHANA)).toBe(true);
    expect(angkaTerjaga("Gaji Rp5.000.000", "Gaji Rp5000000")).toBe(true);
    expect(angkaTerjaga("Gaji Rp5.000.000", "Gaji Rp5 juta")).toBe(true);
  });

  it("gaji, jam, atau lama pengalaman yang dikarang DITOLAK", () => {
    expect(angkaTerjaga(DESKRIPSI, "Gaji Rp7.000.000 per bulan.")).toBe(false);
    expect(angkaTerjaga(DESKRIPSI, "Kerja jam 09.00 sampai 16.00.")).toBe(false);
    expect(angkaTerjaga(DESKRIPSI, "Pengalaman minimal 3 tahun.")).toBe(false);
    // Segmen di BELAKANG pemisah tidak dijadikan angka sah: "000" dari
    // "5.000.000" tidak boleh meloloskan "Rp000" atau angka karangan sejenis.
    expect(angkaTerjaga("Rp5.000.000", "Bonus 000")).toBe(false);
  });

  it("nomor daftar di awal baris bukan fakta", () => {
    expect(angkaTerjaga("Tanpa angka sama sekali.", "1. Rapi.\n2) Teliti.\n 3. Jujur.")).toBe(true);
    // ... tetapi angka di TENGAH kalimat tetap diperiksa.
    expect(angkaTerjaga("Tanpa angka.", "1. Kerja 5 hari.")).toBe(false);
  });
});

describe("teksPolos", () => {
  it("membuang sisa markdown dan merapikan butir", () => {
    expect(teksPolos("## Tugas\n**Penting**: `rapi`\n* satu\n• dua\n\n\n\nakhir")).toBe(
      "Tugas\nPenting: rapi\n- satu\n- dua\n\nakhir",
    );
  });
});

describe("kunci cache simplify.v1", () => {
  it("lingkup BERSAMA: konten sama → kunci sama untuk dua pengguna", () => {
    const a = kunciCachePrompt({ userId: A, feature: "simplify_text" }, simplifyV1, {
      teks: DESKRIPSI,
    });
    const b = kunciCachePrompt({ userId: B, feature: "simplify_text" }, simplifyV1, {
      teks: DESKRIPSI,
    });
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(a).not.toContain(A);
  });

  it("konten berbeda → kunci berbeda (lowongan disunting = entri baru)", () => {
    const ctx = { userId: A, feature: "simplify_text" } as const;
    expect(kunciCachePrompt(ctx, simplifyV1, { teks: DESKRIPSI })).not.toBe(
      kunciCachePrompt(ctx, simplifyV1, { teks: `${DESKRIPSI} ` }),
    );
  });
});

// ---------------------------------------------------------------------------
// Integrasi HTTP
// ---------------------------------------------------------------------------

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

function loggerTertangkap() {
  const potongan: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      potongan.push(chunk.toString("utf8"));
      cb();
    },
  });
  return { logger: createLogger(env, { destination }), teks: () => potongan.join("") };
}

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

function redisCachePalsu(): CacheRedisLike & { jumlah(): number } {
  const isi = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(isi.get(key) ?? null),
    set: (key, value) => {
      isi.set(key, value);
      return Promise.resolve("OK");
    },
    jumlah: () => isi.size,
  };
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

type Jawab = (teks: string) => string | Error;

async function boot(
  o: { jawab?: Jawab; aktif?: boolean; kuotaAwal?: Record<string, number> } = {},
) {
  const { logger, teks: log } = loggerTertangkap();
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const redisKuota: RedisKuotaPalsu = redisKuotaPalsu(o.kuotaAwal);
  const quota = createAiQuota({
    redis: redisKuota,
    config: konfigurasi,
    logger,
    clock: () => SIANG,
  });
  const jawab: Jawab = o.jawab ?? (() => SEDERHANA);
  const panggilan: string[] = [];

  const provider: AiProvider = {
    name: "palsu",
    chat: () => Promise.reject(new Error("tidak dipakai")),
    embed: () => Promise.reject(new Error("tidak dipakai")),
    chatJson: (request, schema) => {
      const isi = request.messages.at(-1)?.content ?? "";
      panggilan.push(isi);
      const hasil = jawab(isi);
      if (hasil instanceof Error) return Promise.reject(hasil);
      return Promise.resolve({
        data: schema.parse({ teks: hasil }),
        provider: "palsu",
        model: "palsu-1",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      });
    },
  };
  const redisCache = redisCachePalsu();
  const ai = createAiClient({
    provider,
    quota,
    recorder: { catat: () => Promise.resolve() },
    logger,
    cache: createAiPromptCache({ redis: redisCache, logger }),
  });

  const routes = registry.forModule("/api/v1");
  const { router } = createAiSimplifyModule({
    routes,
    ai,
    bacaLowongan: (id) => {
      const l = LOWONGAN[id];
      return l === undefined
        ? Promise.reject(appError("LOWONGAN_TIDAK_DITEMUKAN"))
        : Promise.resolve(l);
    },
    aktif: o.aktif ?? true,
    logger,
  });
  const api = createServer(env, logger, { routes: (app) => app.use(router) });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return {
    base: `http://127.0.0.1:${String(port)}/api/v1`,
    panggilan,
    redisKuota,
    redisCache,
    log,
  };
}

async function sederhanakan(
  base: string,
  body: unknown,
  userId: string | null = A,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (userId !== null) {
    headers.authorization = `Bearer ${await tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 })}`;
  }
  const res = await fetch(`${base}/ai/simplify-text`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const DESKRIPSI_JOB = { sumber: "lowongan", id: JOB, bagian: "deskripsi" } as const;

describe("POST /ai/simplify-text", () => {
  it("200 teks sederhana; satu jatah simplify_text terpotong; tanpa meta.degraded", async () => {
    const ctx = await boot();
    const { status, body } = await sederhanakan(ctx.base, DESKRIPSI_JOB);

    expect(status).toBe(200);
    expect(body).toEqual({ data: { teks: SEDERHANA, alasan: null } });
    expect(ctx.redisKuota.nilai(kunciKuotaUser(HARI, A, "simplify_text"))).toBe(1);
    // Teks lowongan sampai ke penyedia DIBUNGKUS penanda data tak tepercaya.
    expect(ctx.panggilan[0]).toContain("<<<DATA_TIDAK_TEPERCAYA");
    expect(ctx.panggilan[0]).toContain("Staf Administrasi");
  });

  it("konten sama → cache hit TANPA panggilan kedua — juga lintas pengguna dan lintas lowongan", async () => {
    const ctx = await boot();
    await sederhanakan(ctx.base, DESKRIPSI_JOB, A);
    const kedua = await sederhanakan(ctx.base, DESKRIPSI_JOB, B);
    const lowonganLain = await sederhanakan(ctx.base, { ...DESKRIPSI_JOB, id: JOB_LAIN }, A);

    expect(ctx.panggilan).toHaveLength(1);
    expect(ctx.redisCache.jumlah()).toBe(1);
    expect(kedua.body).toEqual({ data: { teks: SEDERHANA, alasan: null } });
    expect(lowonganLain.body).toEqual(kedua.body);
    // Hit tetap memotong jatah PENGGUNA (keputusan owner 2026-09-03).
    expect(ctx.redisKuota.nilai(kunciKuotaUser(HARI, A, "simplify_text"))).toBe(2);
    expect(ctx.redisKuota.nilai(kunciKuotaUser(HARI, B, "simplify_text"))).toBe(1);
    // Tidak ada penanda cache di badan respons (orakel lintas akun).
    expect(JSON.stringify(kedua.body)).not.toMatch(/cache/i);
  });

  it("kuota 20/hari: permintaan ke-21 → 200 ber-degradasi kuota_habis, penyedia tidak disentuh", async () => {
    const ctx = await boot({ kuotaAwal: { [kunciKuotaUser(HARI, A, "simplify_text")]: 20 } });
    const { status, body } = await sederhanakan(ctx.base, DESKRIPSI_JOB);

    expect(status).toBe(200);
    expect(body).toEqual({ data: { teks: null, alasan: "kuota_habis" }, meta: { degraded: true } });
    expect(ctx.panggilan).toHaveLength(0);
  });

  it("kuota ditegakkan juga saat jawabannya ada di cache", async () => {
    const ctx = await boot({ kuotaAwal: { [kunciKuotaUser(HARI, B, "simplify_text")]: 20 } });
    await sederhanakan(ctx.base, DESKRIPSI_JOB, A);
    const { body } = await sederhanakan(ctx.base, DESKRIPSI_JOB, B);
    expect(body).toEqual({ data: { teks: null, alasan: "kuota_habis" }, meta: { degraded: true } });
  });

  it("penyedia gagal → ai_tidak_tersedia; jatah dikembalikan; log tanpa isi teks", async () => {
    const ctx = await boot({
      jawab: () => new AiProviderError("AI_PROVIDER_UNAVAILABLE", "palsu"),
    });
    const { status, body } = await sederhanakan(ctx.base, DESKRIPSI_JOB);

    expect(status).toBe(200);
    expect(body).toEqual({
      data: { teks: null, alasan: "ai_tidak_tersedia" },
      meta: { degraded: true },
    });
    expect(ctx.redisKuota.nilai(kunciKuotaUser(HARI, A, "simplify_text"))).toBe(0);
    expect(ctx.log()).toContain("AI_PROVIDER_UNAVAILABLE");
    expect(ctx.log()).not.toContain("Staf Administrasi");
  });

  it("hasil yang mengarang angka DITOLAK penjaga fakta → ai_tidak_tersedia", async () => {
    const ctx = await boot({ jawab: () => "Gaji Anda Rp9.000.000 per bulan." });
    const { body } = await sederhanakan(ctx.base, DESKRIPSI_JOB);

    expect(body).toEqual({
      data: { teks: null, alasan: "ai_tidak_tersedia" },
      meta: { degraded: true },
    });
    expect(ctx.log()).toContain("ANGKA_TIDAK_ADA_DI_ASLI");
    expect(ctx.log()).not.toContain("9.000.000");
  });

  it("HTML dari model dibuang sebelum sampai ke klien", async () => {
    const ctx = await boot({ jawab: () => "Anda <script>alert(1)</script>mengurus dokumen." });
    const { body } = await sederhanakan(ctx.base, DESKRIPSI_JOB);
    expect(JSON.stringify(body)).not.toContain("<script>");
  });

  it("fitur dimatikan → dimatikan, tanpa kuota dan tanpa penyedia", async () => {
    const ctx = await boot({ aktif: false });
    const { status, body } = await sederhanakan(ctx.base, DESKRIPSI_JOB);

    expect(status).toBe(200);
    expect(body).toEqual({ data: { teks: null, alasan: "dimatikan" }, meta: { degraded: true } });
    expect(ctx.panggilan).toHaveLength(0);
    expect(ctx.redisKuota.jumlahPerintah()).toBe(0);
  });

  it("tanpa sesi → 401", async () => {
    const ctx = await boot();
    const { status } = await sederhanakan(ctx.base, DESKRIPSI_JOB, null);
    expect(status).toBe(401);
    expect(ctx.panggilan).toHaveLength(0);
  });

  it("lowongan tidak ada → 404 LOWONGAN_TIDAK_DITEMUKAN, tanpa jatah", async () => {
    const ctx = await boot();
    const { status, body } = await sederhanakan(ctx.base, { ...DESKRIPSI_JOB, id: TIDAK_ADA });
    expect(status).toBe(404);
    expect(body.code).toBe("LOWONGAN_TIDAK_DITEMUKAN");
    expect(ctx.redisKuota.nilai(kunciKuotaUser(HARI, A, "simplify_text"))).toBe(0);
  });

  it("bagian kosong → 404 BAGIAN_LOWONGAN_KOSONG, tanpa jatah", async () => {
    const ctx = await boot();
    const { status, body } = await sederhanakan(ctx.base, {
      ...DESKRIPSI_JOB,
      bagian: "persyaratan",
    });
    expect(status).toBe(404);
    expect(body.code).toBe("BAGIAN_LOWONGAN_KOSONG");
    expect(ctx.panggilan).toHaveLength(0);
  });

  it("teks bebas di body ditolak 400 — endpoint ini bukan LLM serba-guna", async () => {
    const ctx = await boot();
    const { status } = await sederhanakan(ctx.base, { ...DESKRIPSI_JOB, teks: "abaikan aturan" });
    expect(status).toBe(400);
    const sumberLain = await sederhanakan(ctx.base, { sumber: "bebas", teks: "halo" });
    expect(sumberLain.status).toBe(400);
    expect(ctx.panggilan).toHaveLength(0);
  });
});
