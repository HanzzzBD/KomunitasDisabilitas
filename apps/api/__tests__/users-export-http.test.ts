// Integration HTTP ekspor data pribadi (PR-022) — server Express nyata, token
// RS256 nyata, guard sesi dari registrar PR-019.
//
// AC yang dijaga file ini: "tidak ada data pihak lain di payload", "ekspor
// ter-audit", "rate limit bekerja", dan "format JSON stabil (versioned)" —
// yang terakhir diperiksa dengan mem-parse response memakai kontrak zod yang
// SAMA dengan yang dipakai FE, bukan dengan mencocokkan bentuk buatan test.
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import type { AuditAction, UserRole } from "@nawasena/schemas";
import { dataExportSchema, EXPORT_FORMAT_VERSION } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createUsersModule, EXPORT_POLICY } from "../src/modules/users/index.js";
import type { ExportRedisLike } from "../src/modules/users/repositories/export-quota.repository.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { SESSION_KEYS } from "./helpers/session.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";

const tokens = createTokenService(SESSION_KEYS);

interface BarisUser {
  id: string;
  fullName: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  role: UserRole;
  tokenVersion: number;
  googleId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

function userAwal(): BarisUser[] {
  return [
    {
      id: A,
      fullName: "Rina Pratiwi",
      email: "rina@contoh.id",
      emailVerified: false,
      phone: "+6281234567890",
      role: "seeker",
      tokenVersion: 0,
      googleId: null,
      createdAt: new Date("2026-08-01T03:00:00.000Z"),
      deletedAt: null,
    },
    {
      id: B,
      fullName: "Bayu Santoso",
      email: "bayu@contoh.id",
      emailVerified: true,
      phone: null,
      role: "admin",
      tokenVersion: 0,
      googleId: "google-bayu",
      createdAt: new Date("2026-08-02T03:00:00.000Z"),
      deletedAt: null,
    },
  ];
}

/** Prisma palsu: tabel users in-memory dengan `select` yang dihormati. */
function fakePrisma(rows: BarisUser[]) {
  const client = {
    user: {
      findFirst: ({
        where,
        select,
      }: {
        where: { id?: string; deletedAt?: null };
        select: Record<string, boolean>;
      }) => {
        const found = rows.find((u) => u.deletedAt === null && u.id === where.id);
        if (found === undefined) return Promise.resolve(null);
        // `select` DIHORMATI: kolom yang tidak diminta repository tidak ikut
        // terbawa. Fake yang mengembalikan baris penuh akan membuat test lulus
        // atas kebocoran yang produksi tidak punya — atau menyembunyikan yang
        // punya (pelajaran PR-020).
        const keluar: Record<string, unknown> = {};
        for (const kolom of Object.keys(select)) {
          keluar[kolom] = (found as unknown as Record<string, unknown>)[kolom];
        }
        return Promise.resolve(keluar);
      },
    },
  };
  return client as unknown as PrismaClient;
}

/** Redis in-memory untuk kuota ekspor. */
function fakeRedis(): ExportRedisLike {
  const nilai = new Map<string, number>();
  const ttl = new Map<string, number>();
  return {
    async incr(key) {
      const next = (nilai.get(key) ?? 0) + 1;
      nilai.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      ttl.set(key, seconds);
      return 1;
    },
    async ttl(key) {
      return ttl.get(key) ?? -1;
    },
  };
}

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

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot() {
  const env = testEnv();
  const baris = userAwal();
  const logSink: string[] = [];
  const logger = createLogger(env, {
    destination: new Writable({
      write(chunk, _e, cb) {
        logSink.push(String(chunk));
        cb();
      },
    }),
  });
  const audit: Array<{ action: AuditAction; entityId: string | null; meta: unknown }> = [];

  const guards = createAccessGuards({
    tokenService: tokens,
    findSessionUser: (id) => {
      const u = baris.find((r) => r.deletedAt === null && r.id === id);
      return Promise.resolve(
        u === undefined ? null : { id: u.id, role: u.role, tokenVersion: u.tokenVersion },
      );
    },
  });
  const registry = createRouteRegistry({ guardsFor: guards.guardsFor });

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createUsersModule({
          prisma: fakePrisma(baris),
          redis: fakeRedis(),
          routes: registry.forModule("/api/v1"),
          auditLog: (_actor, action, _entity, entityId, meta) => {
            audit.push({ action, entityId, meta });
          },
        }),
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, baris, audit, logSink };
}

async function tokenUntuk(userId: string, role: UserRole = "seeker"): Promise<string> {
  return tokens.signAccessToken({ sub: userId, role, ver: 0 });
}

function unduh(base: string, token?: string) {
  return fetch(`${base}/me/export`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/v1/me/export — berkas", () => {
  it("200 dan isinya lolos kontrak zod yang sama dengan yang dipakai FE", async () => {
    const { base } = await boot();

    const res = await unduh(base, await tokenUntuk(A));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    const parsed = dataExportSchema.safeParse(body.data);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect((body.data as { formatVersion: number }).formatVersion).toBe(EXPORT_FORMAT_VERSION);
  });

  it("berisi data PEMILIK TOKEN, dengan cara masuk yang diturunkan", async () => {
    const { base } = await boot();

    const res = await unduh(base, await tokenUntuk(B, "admin"));
    const body = (await res.json()) as { data: { account: Record<string, unknown> } };

    expect(body.data.account).toMatchObject({
      id: B,
      fullName: "Bayu Santoso",
      emailVerified: true,
      phone: null,
      authMethods: ["google"],
    });
  });

  it("tidak memuat field internal maupun pengenal provider", async () => {
    const { base } = await boot();

    const res = await unduh(base, await tokenUntuk(B, "admin"));
    const teks = await res.text();

    // `googleId` ada di baris DB milik B dan sengaja tidak pernah keluar.
    expect(teks).not.toContain("google-bayu");
    expect(teks).not.toContain("tokenVersion");
    expect(teks).not.toContain("deletedAt");
  });

  it("dua token berbeda → dua berkas berbeda, tanpa data pihak lain (AC)", async () => {
    const { base } = await boot();

    const dariA = await (await unduh(base, await tokenUntuk(A))).text();
    const dariB = await (await unduh(base, await tokenUntuk(B, "admin"))).text();

    expect(dariA).toContain("Rina Pratiwi");
    expect(dariA).not.toContain("Bayu Santoso");
    expect(dariA).not.toContain("bayu@contoh.id");
    expect(dariB).toContain("Bayu Santoso");
    expect(dariB).not.toContain("Rina Pratiwi");
    expect(dariB).not.toContain("+6281234567890");
  });
});

describe("GET /api/v1/me/export — penjagaan", () => {
  it("tanpa token → 401", async () => {
    const { base } = await boot();

    const res = await unduh(base);

    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("TIDAK_TERAUTENTIKASI");
  });

  it("permintaan ke-4 dalam jendela → 429 dengan Retry-After (AC)", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(A);
    for (let i = 0; i < EXPORT_POLICY.maxPerWindow; i += 1) {
      expect((await unduh(base, token)).status).toBe(200);
    }

    const res = await unduh(base, token);

    expect(res.status).toBe(429);
    // Retry-After wajib ada: 429 tanpa itu memaksa klien menebak (SDD §11).
    expect(res.headers.get("retry-after")).toBe(String(EXPORT_POLICY.windowSeconds));
    const body = (await res.json()) as { code: string; hint: string };
    expect(body.code).toBe("TERLALU_BANYAK_PERMINTAAN");
    expect(body.hint.length).toBeGreaterThan(0);
  });

  it("kuota satu pengguna tidak menghabiskan jatah pengguna lain", async () => {
    const { base } = await boot();
    const tokenA = await tokenUntuk(A);
    for (let i = 0; i < EXPORT_POLICY.maxPerWindow + 1; i += 1) await unduh(base, tokenA);

    const res = await unduh(base, await tokenUntuk(B, "admin"));

    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/me/export — audit & log", () => {
  it("setiap ekspor tercatat; yang ditolak kuota tidak (AC)", async () => {
    const { base, audit } = await boot();
    const token = await tokenUntuk(A);
    for (let i = 0; i < EXPORT_POLICY.maxPerWindow + 1; i += 1) await unduh(base, token);

    expect(audit).toHaveLength(EXPORT_POLICY.maxPerWindow);
    expect(audit[0]).toMatchObject({
      action: "DATA_EXPORTED",
      entityId: A,
      meta: { format: "json", formatVersion: EXPORT_FORMAT_VERSION, sections: ["account"] },
    });
  });

  it("isi berkas tidak pernah muncul di log", async () => {
    const { base, logSink } = await boot();

    await unduh(base, await tokenUntuk(A));

    const semua = logSink.join("");
    expect(semua).not.toContain("rina@contoh.id");
    expect(semua).not.toContain("+6281234567890");
  });
});
