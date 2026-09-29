// Sesi AI CV Builder (PR-065) — unit service/kebijakan + HTTP `GET /ai/cv-chat/:session`.
//
// Tidak butuh Docker: repository palsu di memori. Yang dijalankan PostgreSQL
// (konkurensi, unique parsial, batas byte, selektor retensi, migrasi down)
// dibuktikan terpisah di `ai-chat-sessions-db.test.ts`.
import { describe, it, expect, afterEach, expectTypeOf } from "vitest";
import { Writable } from "node:stream";
import {
  aiChatSessionResponseSchema,
  aiChatTurnSchema,
  type AiChatTurn,
  type SensitiveProfile,
  type UserRole,
} from "@nawasena/schemas";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { AppError } from "../src/core/http/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import {
  createAiChatSessionPolicies,
  createAiChatSessionsController,
  createAiChatSessionsRouter,
  createAiChatSessionsService,
  type ChatSessionRow,
  type ChatSessionsRepository,
  type GiliranBaru,
  type HasilAppend,
} from "../src/modules/ai/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";
const SESI_A = "018f4c1e-0000-7000-8000-0000000000a1";
const WAKTU = new Date("2026-09-28T03:00:00.000Z");

/** Repository palsu: satu sesi milik A, dan hasil append yang bisa diatur. */
function repoPalsu(hasilAppend: HasilAppend = { ok: false, sebab: "tidak-ada" }) {
  const sesi: ChatSessionRow & { userId: string } = {
    userId: A,
    id: SESI_A,
    status: "active",
    transcript: [{ seq: 1, role: "assistant", content: "Halo!", at: WAKTU.toISOString() }],
    createdAt: WAKTU,
    updatedAt: WAKTU,
    finalizedAt: null,
    resumeId: null,
    extractionFailedAt: null,
    extractionError: null,
  };
  const panggilanAppend: unknown[] = [];
  const repo: ChatSessionsRepository = {
    findOwned: (userId, id) =>
      Promise.resolve(userId === sesi.userId && id === sesi.id ? sesi : null),
    findActive: () => Promise.resolve(null),
    createOrGetActive: () => Promise.resolve({ row: sesi, baru: false }),
    appendTurn: (...args) => {
      panggilanAppend.push(args);
      return Promise.resolve(hasilAppend);
    },
    listForExport: () => Promise.resolve([sesi]),
    countRetention: () => Promise.resolve(0),
    deleteRetentionBatch: () => Promise.resolve(0),
    mulaiFinalisasi: () => Promise.resolve("tidak-ada"),
    batalFinalisasi: () => Promise.resolve(false),
    selesaiFinalisasi: () => Promise.resolve(false),
    gagalFinalisasi: () => Promise.resolve(false),
  };
  return { repo, panggilanAppend };
}

async function kodeGalat(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error("seharusnya melempar");
}

describe("guard tipe — transkrip tidak punya tempat bagi data sensitif profil", () => {
  it("tidak ada satu pun key SensitiveProfile di AiChatTurn maupun GiliranBaru", () => {
    // Compile-time: bila kelak seseorang menambah `disabilityTypes` ke giliran,
    // `Extract` tidak lagi `never` dan typecheck merah.
    expectTypeOf<Extract<keyof AiChatTurn, keyof SensitiveProfile>>().toEqualTypeOf<never>();
    expectTypeOf<keyof GiliranBaru>().toEqualTypeOf<"role" | "content">();
  });

  it("skema giliran `.strict()` menolak field tambahan saat runtime", () => {
    const hasil = aiChatTurnSchema.safeParse({
      seq: 1,
      role: "user",
      content: "hai",
      at: WAKTU.toISOString(),
      disabilityTypes: ["tuli"],
    });
    expect(hasil.success).toBe(false);
  });
});

describe("service — validasi & pemetaan hasil repository", () => {
  it("role `system` dan field tambahan ditolak sebelum menyentuh repository", async () => {
    const { repo, panggilanAppend } = repoPalsu();
    const svc = createAiChatSessionsService({ repo });

    expect(
      await kodeGalat(
        svc.tambahGiliran({ userId: A }, SESI_A, { role: "system", content: "x" } as never),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      await kodeGalat(
        svc.tambahGiliran({ userId: A }, SESI_A, {
          role: "user",
          content: "x",
          accommodationNeeds: {},
        } as never),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(
      await kodeGalat(svc.tambahGiliran({ userId: A }, SESI_A, { role: "user", content: "" })),
    ).toBe("VALIDATION_ERROR");
    expect(panggilanAppend).toEqual([]);
  });

  it.each([
    ["tidak-ada", "AI_SESI_TIDAK_DITEMUKAN"],
    ["selesai", "AI_SESI_SUDAH_SELESAI"],
    ["penuh", "AI_TRANSKRIP_PENUH"],
  ] as const)("penolakan repository `%s` → %s", async (sebab, kode) => {
    const { repo } = repoPalsu({ ok: false, sebab });
    const svc = createAiChatSessionsService({ repo });

    expect(
      await kodeGalat(svc.tambahGiliran({ userId: A }, SESI_A, { role: "user", content: "hai" })),
    ).toBe(kode);
  });

  it("stempel waktu giliran dari jam server, bukan dari pemanggil", async () => {
    const turn = { seq: 2, role: "user" as const, content: "hai", at: WAKTU.toISOString() };
    const { repo, panggilanAppend } = repoPalsu({ ok: true, turn });
    const svc = createAiChatSessionsService({ repo, clock: () => WAKTU });

    expect(
      await svc.tambahGiliran({ userId: A }, SESI_A, { role: "user", content: "hai" }),
    ).toEqual(turn);
    const [userId, sesiId, giliran] = panggilanAppend[0] as [string, string, unknown];
    expect([userId, sesiId, giliran]).toEqual([
      A,
      SESI_A,
      { role: "user", content: "hai", at: WAKTU },
    ]);
  });
});

describe("kebijakan retensi", () => {
  it("dua kategori bernama, cutoff = sekarang − hari", async () => {
    const dipanggil: Array<[string, Date]> = [];
    const [final, ditinggal] = createAiChatSessionPolicies({
      repository: {
        countRetention: (k, c) => {
          dipanggil.push([k, c]);
          return Promise.resolve(0);
        },
        deleteRetentionBatch: () => Promise.resolve(0),
      },
      days: 30,
    });

    expect([final?.nama, ditinggal?.nama]).toEqual([
      "ai_chat_sessions.finalized",
      "ai_chat_sessions.abandoned",
    ]);
    await final?.hitung(WAKTU);
    await ditinggal?.hitung(WAKTU);
    const cutoff = new Date(WAKTU.getTime() - 30 * 86_400_000);
    expect(dipanggil).toEqual([
      ["finalized", cutoff],
      ["abandoned", cutoff],
    ]);
  });
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const tokens = createTokenService(SESSION_KEYS);
const akun: Record<string, { id: string; role: UserRole; tokenVersion: number }> = {
  [A]: { id: A, role: "seeker", tokenVersion: 0 },
  [B]: { id: B, role: "seeker", tokenVersion: 0 },
};

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot() {
  const env = loadEnv({
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
    REDIS_URL: "redis://127.0.0.1:9",
    REDIS_QUEUE_URL: "redis://127.0.0.1:9",
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
  });
  const logger = createLogger(env, {
    destination: new Writable({
      write(_chunk, _e, cb) {
        cb();
      },
    }),
  });
  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) => Promise.resolve(akun[id] ?? null),
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
  const svc = createAiChatSessionsService({ repo: repoPalsu().repo });
  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createAiChatSessionsRouter(
          createAiChatSessionsController(svc),
          registry.forModule("/api/v1"),
        ),
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, registry };
}

async function ambil(base: string, sesi: string, userId?: string) {
  const headers: Record<string, string> =
    userId === undefined
      ? {}
      : {
          authorization: `Bearer ${await tokens.signAccessToken({ sub: userId, role: "seeker", ver: 0 })}`,
        };
  return fetch(`${base}/ai/cv-chat/${sesi}`, { headers });
}

describe("GET /api/v1/ai/cv-chat/:session", () => {
  it("dideklarasikan authenticated (bukan self — `:session` bukan id pengguna)", async () => {
    const { registry } = await boot();
    expect(registry.list()).toEqual([
      { method: "GET", path: "/api/v1/ai/cv-chat/:session", access: { kind: "authenticated" } },
    ]);
  });

  it("tanpa token → 401", async () => {
    const { base } = await boot();
    expect((await ambil(base, SESI_A)).status).toBe(401);
  });

  it("pemilik → 200, bentuk sesuai kontrak, tidak boleh di-cache", async () => {
    const { base } = await boot();
    const res = await ambil(base, SESI_A, A);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const badan = aiChatSessionResponseSchema.parse(await res.json());
    expect(badan.data).toMatchObject({ id: SESI_A, status: "active", turns: [{ seq: 1 }] });
  });

  it("sesi milik orang lain → 404 yang sama persis dengan sesi yang tidak ada", async () => {
    const { base } = await boot();
    const milikOrang = await ambil(base, SESI_A, B);
    const tidakAda = await ambil(base, "018f4c1e-0000-7000-8000-0000000000ff", A);

    expect(milikOrang.status).toBe(404);
    expect(await milikOrang.json()).toEqual(await tidakAda.json());
  });

  it("`session` bukan UUID → 400 di gerbang, bukan 500 dari Prisma", async () => {
    const { base } = await boot();
    const res = await ambil(base, "bukan-uuid", A);

    expect(res.status).toBe(400);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
