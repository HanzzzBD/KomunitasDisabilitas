// Integration HTTP modul `companies` (PR-051) — server Express nyata, token
// RS256 nyata, guard sesi/role dari registrar PR-019, Prisma palsu in-memory.
//
// Acceptance Criteria yang dijaga file ini:
//   AC-1 seeker tidak dapat memutasi (403, matrix)
//   AC-2 verify → status berubah + audit + event
//   AC-3 public GET hanya field publik (snapshot kontrak)
//   AC-4 taksonomi akomodasi tervalidasi
//   AC-5 un-verify (koreksi) dimungkinkan + audit
//   AC-6 GET /companies/:id/jobs publik, hanya lowongan aktif (PR-054)
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import { AUDIT_ACTION, type UserRole } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createCompaniesModule } from "../src/modules/companies/index.js";
import {
  assertRoutesDeclared,
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
} from "../src/core/auth/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { busUji } from "./helpers/events.js";

const SEEKER = "018f4c1e-0000-7000-8000-00000000aaaa";
const ADMIN = "018f4c1e-0000-7000-8000-00000000cccc";
const TAK_ADA = "018f4c1e-0000-7000-8000-0000000000ff";

const tokens = createTokenService(SESSION_KEYS);

interface BarisCompany {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  city: string | null;
  inclusivityStatus: "unverified" | "self_claimed" | "verified";
  accommodationsAvailable: string[];
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function barisBaru(overrides: Partial<BarisCompany> = {}): BarisCompany {
  return {
    id: "018f4c1e-1111-7000-8000-000000000001",
    name: "PT Inklusif Fiktif",
    description: null,
    website: null,
    city: "Jakarta",
    inclusivityStatus: "unverified",
    accommodationsAvailable: [],
    verifiedBy: null,
    verifiedAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

interface BarisJob {
  id: string;
  companyId: string;
  title: string;
  employmentType: string;
  workMode: string;
  city: string | null;
  province: string | null;
  status: "draft" | "published" | "closed";
  publishedAt: Date | null;
  expiresAt: Date | null;
}

function jobBaru(overrides: Partial<BarisJob> = {}): BarisJob {
  return {
    id: "018f4c1e-2222-7000-8000-000000000001",
    companyId: "018f4c1e-1111-7000-8000-000000000001",
    title: "Staf Admin",
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    status: "published",
    publishedAt: new Date("2026-08-01T00:00:00Z"),
    expiresAt: null,
    ...overrides,
  };
}

/** Prisma palsu: tabel `companies`+`jobs` in-memory — pola sama dengan profiles-http.test.ts. */
function fakePrisma(rows: BarisCompany[], jobs: BarisJob[] = []) {
  const ambil = (id: string) => rows.find((r) => r.id === id);

  const company = {
    findMany: ({ orderBy }: { orderBy?: { name: "asc" | "desc" } } = {}) => {
      const salinan = rows.map((r) => ({ ...r }));
      if (orderBy?.name === "asc") salinan.sort((a, b) => a.name.localeCompare(b.name));
      return Promise.resolve(salinan);
    },
    findUnique: ({ where }: { where: { id: string } }) => {
      const found = ambil(where.id);
      return Promise.resolve(found === undefined ? null : { ...found });
    },
    create: ({ data }: { data: Omit<BarisCompany, "inclusivityStatus" | "verifiedBy" | "verifiedAt" | "createdAt" | "updatedAt"> & Partial<BarisCompany> }) => {
      const baris = barisBaru({ ...data });
      rows.push(baris);
      return Promise.resolve({ ...baris });
    },
    updateMany: ({ where, data }: { where: { id: string }; data: Partial<BarisCompany> }) => {
      const baris = ambil(where.id);
      if (baris === undefined) return Promise.resolve({ count: 0 });
      Object.assign(baris, data, { updatedAt: new Date() });
      return Promise.resolve({ count: 1 });
    },
  };

  const job = {
    findMany: ({
      where,
      orderBy,
    }: {
      where: { companyId: string; status: string; OR: Array<Record<string, unknown>> };
      orderBy?: { publishedAt: "asc" | "desc" };
    }) => {
      const agora = new Date();
      let hasil = jobs.filter((j) => j.companyId === where.companyId && j.status === where.status);
      hasil = hasil.filter((j) => j.expiresAt === null || j.expiresAt > agora);
      if (orderBy?.publishedAt === "desc") {
        hasil = [...hasil].sort((a, b) => {
          const wa = a.publishedAt?.getTime() ?? 0;
          const wb = b.publishedAt?.getTime() ?? 0;
          return wb - wa;
        });
      }
      return Promise.resolve(hasil.map((j) => ({ ...j })));
    },
  };

  return { company, job } as unknown as PrismaClient;
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

const akun: Record<string, { id: string; role: UserRole; tokenVersion: number }> = {
  [SEEKER]: { id: SEEKER, role: "seeker", tokenVersion: 0 },
  [ADMIN]: { id: ADMIN, role: "admin", tokenVersion: 0 },
};

interface Jejak {
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
}

let active: ApiServer | null = null;
afterEach(async () => {
  await active?.stop();
  active = null;
});

async function boot(options: { baris?: BarisCompany[]; jobs?: BarisJob[] } = {}) {
  const env = testEnv();
  const baris = options.baris ?? [];
  const jobs = options.jobs ?? [];
  const audit: Jejak[] = [];
  const events = busUji();
  const eventsDiterima: unknown[] = [];
  events.on("company.verified", (payload) => {
    eventsDiterima.push(payload);
  });
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

  const api = createServer(env, logger, {
    routes: (app) => {
      app.use(
        createCompaniesModule({
          prisma: fakePrisma(baris, jobs),
          routes: registry.forModule("/api/v1"),
          auditLog: (_actor, action, entity, entityId, meta) => {
            audit.push({ action, entity, entityId, meta });
          },
          events,
        }).router,
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return { base: `http://127.0.0.1:${port}/api/v1`, baris, audit, eventsDiterima, registry };
}

async function tokenUntuk(userId: string): Promise<string> {
  const user = akun[userId]!;
  return tokens.signAccessToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
}

function panggil(base: string, method: string, path: string, token?: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function badan(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/companies/:id — publik (AC-3)", () => {
  it("tanpa token → 200 (publik dengan sengaja)", async () => {
    const { base, baris } = await boot({ baris: [barisBaru()] });
    const res = await panggil(base, "GET", `/companies/${baris[0]!.id}`);

    expect(res.status).toBe(200);
  });

  it("hanya field publik — TIDAK ada verifiedBy", async () => {
    const { base, baris } = await boot({
      baris: [barisBaru({ verifiedBy: ADMIN, inclusivityStatus: "verified" })],
    });
    const res = await panggil(base, "GET", `/companies/${baris[0]!.id}`);
    const body = await badan(res);

    expect(body.data).toMatchObject({
      name: "PT Inklusif Fiktif",
      inclusivityStatus: "verified",
    });
    expect(body.data).not.toHaveProperty("verifiedBy");
  });

  it("id tidak ada → 404 PERUSAHAAN_TIDAK_DITEMUKAN", async () => {
    const { base } = await boot();
    const res = await panggil(base, "GET", `/companies/${TAK_ADA}`);

    expect(res.status).toBe(404);
    expect(await badan(res)).toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" });
  });

  it("id bukan UUID → 400 VALIDATION_ERROR", async () => {
    const { base } = await boot();
    const res = await panggil(base, "GET", "/companies/bukan-uuid");

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/companies/:id/jobs — lowongan aktif publik (AC-6)", () => {
  it("tanpa token → 200 (publik), hanya lowongan published & belum lewat tenggat", async () => {
    const perusahaan = barisBaru();
    const { base } = await boot({
      baris: [perusahaan],
      jobs: [
        jobBaru({ id: "018f4c1e-2222-7000-8000-000000000001", companyId: perusahaan.id }),
        jobBaru({
          id: "018f4c1e-2222-7000-8000-000000000002",
          companyId: perusahaan.id,
          status: "draft",
        }),
        jobBaru({
          id: "018f4c1e-2222-7000-8000-000000000003",
          companyId: perusahaan.id,
          status: "closed",
        }),
        jobBaru({
          id: "018f4c1e-2222-7000-8000-000000000004",
          companyId: perusahaan.id,
          expiresAt: new Date("2020-01-01T00:00:00Z"),
        }),
      ],
    });

    const res = await panggil(base, "GET", `/companies/${perusahaan.id}/jobs`);
    expect(res.status).toBe(200);
    const body = await badan(res);
    expect(body.data).toEqual([
      expect.objectContaining({ id: "018f4c1e-2222-7000-8000-000000000001" }),
    ]);
  });

  it("lowongan tanpa tenggat (expiresAt null) tetap aktif", async () => {
    const perusahaan = barisBaru();
    const { base } = await boot({
      baris: [perusahaan],
      jobs: [jobBaru({ companyId: perusahaan.id, expiresAt: null })],
    });

    const res = await panggil(base, "GET", `/companies/${perusahaan.id}/jobs`);
    const body = await badan(res);
    expect(body.data).toHaveLength(1);
  });

  it("perusahaan lain tidak ikut terbawa", async () => {
    const perusahaan = barisBaru();
    const lain = barisBaru({ id: "018f4c1e-1111-7000-8000-000000000099" });
    const { base } = await boot({
      baris: [perusahaan, lain],
      jobs: [jobBaru({ companyId: lain.id })],
    });

    const res = await panggil(base, "GET", `/companies/${perusahaan.id}/jobs`);
    expect((await badan(res)).data).toEqual([]);
  });

  it("id perusahaan tidak ada → 404 PERUSAHAAN_TIDAK_DITEMUKAN", async () => {
    const { base } = await boot();
    const res = await panggil(base, "GET", `/companies/${TAK_ADA}/jobs`);

    expect(res.status).toBe(404);
    expect(await badan(res)).toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" });
  });
});

describe("rute /admin/companies* — matriks akses (AC-1)", () => {
  it("tanpa token → 401 di seluruh route admin", async () => {
    const { base } = await boot();
    for (const [method, path] of [
      ["GET", "/admin/companies"],
      ["POST", "/admin/companies"],
      ["PUT", `/admin/companies/${TAK_ADA}`],
      ["POST", `/admin/companies/${TAK_ADA}/verify`],
    ] as const) {
      const res = await panggil(base, method, path);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("seeker (bukan admin) → 403 TIDAK_BERHAK di seluruh route admin", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(SEEKER);
    for (const [method, path] of [
      ["GET", "/admin/companies"],
      ["POST", "/admin/companies"],
      ["PUT", `/admin/companies/${TAK_ADA}`],
      ["POST", `/admin/companies/${TAK_ADA}/verify`],
    ] as const) {
      const res = await panggil(base, method, path, token, method === "GET" ? undefined : {});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await badan(res)).toMatchObject({ code: "TIDAK_BERHAK" });
    }
  });
});

describe("POST /api/v1/admin/companies — create (admin)", () => {
  it("admin membuat perusahaan → 201, status lahir unverified, audit create", async () => {
    const { base, baris, audit } = await boot();
    const res = await panggil(base, "POST", "/admin/companies", await tokenUntuk(ADMIN), {
      name: "Toko Baru Fiktif",
    });

    expect(res.status).toBe(201);
    const body = await badan(res);
    expect(body.data).toMatchObject({ name: "Toko Baru Fiktif", inclusivityStatus: "unverified" });
    expect(baris).toHaveLength(1);
    expect(audit).toEqual([
      expect.objectContaining({
        action: AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
        meta: { operation: "create" },
      }),
    ]);
  });

  it("nama kosong → 400 VALIDATION_ERROR", async () => {
    const { base } = await boot();
    const res = await panggil(base, "POST", "/admin/companies", await tokenUntuk(ADMIN), {
      name: "",
    });

    expect(res.status).toBe(400);
  });

  it("taksonomi akomodasi liar → 400 VALIDATION_ERROR (AC-4)", async () => {
    const { base } = await boot();
    const res = await panggil(base, "POST", "/admin/companies", await tokenUntuk(ADMIN), {
      name: "Toko Fiktif",
      accommodationsAvailable: ["kursi_pijat"],
    });

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("taksonomi akomodasi valid → diterima", async () => {
    const { base } = await boot();
    const res = await panggil(base, "POST", "/admin/companies", await tokenUntuk(ADMIN), {
      name: "Toko Fiktif",
      accommodationsAvailable: ["akses_kursi_roda", "ramah_screen_reader"],
    });

    expect(res.status).toBe(201);
    expect((await badan(res)).data).toMatchObject({
      accommodationsAvailable: ["akses_kursi_roda", "ramah_screen_reader"],
    });
  });
});

describe("PUT /api/v1/admin/companies/:id — update & un-verify (AC-5)", () => {
  it("admin mengubah nama → 200, audit update", async () => {
    const { base, baris, audit } = await boot({ baris: [barisBaru()] });
    const res = await panggil(
      base,
      "PUT",
      `/admin/companies/${baris[0]!.id}`,
      await tokenUntuk(ADMIN),
      { name: "Nama Baru" },
    );

    expect(res.status).toBe(200);
    expect((await badan(res)).data).toMatchObject({ name: "Nama Baru" });
    expect(audit).toEqual([
      expect.objectContaining({ meta: { operation: "update" } }),
    ]);
  });

  it("id tidak ada → 404 PERUSAHAAN_TIDAK_DITEMUKAN", async () => {
    const { base } = await boot();
    const res = await panggil(base, "PUT", `/admin/companies/${TAK_ADA}`, await tokenUntuk(ADMIN), {
      name: "Apapun",
    });

    expect(res.status).toBe(404);
  });

  it("inclusivityStatus: 'verified' DITOLAK di PUT (400) — hanya lewat /verify", async () => {
    const { base, baris } = await boot({ baris: [barisBaru()] });
    const res = await panggil(
      base,
      "PUT",
      `/admin/companies/${baris[0]!.id}`,
      await tokenUntuk(ADMIN),
      { inclusivityStatus: "verified" },
    );

    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(baris[0]?.inclusivityStatus).toBe("unverified"); // tidak tersentuh
  });

  it("un-verify: perusahaan verified → unverified via PUT diterima (koreksi, AC-5)", async () => {
    const { base, baris, audit } = await boot({
      baris: [barisBaru({ inclusivityStatus: "verified", verifiedBy: ADMIN })],
    });

    const res = await panggil(
      base,
      "PUT",
      `/admin/companies/${baris[0]!.id}`,
      await tokenUntuk(ADMIN),
      { inclusivityStatus: "unverified" },
    );

    expect(res.status).toBe(200);
    expect((await badan(res)).data).toMatchObject({ inclusivityStatus: "unverified" });
    expect(audit).toHaveLength(1); // ADMIN_RESOURCE_CHANGED, bukan COMPANY_VERIFIED
    expect(audit[0]?.action).toBe(AUDIT_ACTION.ADMIN_RESOURCE_CHANGED);
  });
});

describe("POST /api/v1/admin/companies/:id/verify — verifikasi (AC-2)", () => {
  it("admin memverifikasi → 200, status verified, audit COMPANY_VERIFIED, event terbit", async () => {
    const { base, baris, audit, eventsDiterima } = await boot({ baris: [barisBaru()] });

    const res = await panggil(
      base,
      "POST",
      `/admin/companies/${baris[0]!.id}/verify`,
      await tokenUntuk(ADMIN),
    );

    expect(res.status).toBe(200);
    const body = await badan(res);
    expect(body.data).toMatchObject({ inclusivityStatus: "verified" });

    expect(audit).toEqual([
      expect.objectContaining({
        action: AUDIT_ACTION.COMPANY_VERIFIED,
        entityId: baris[0]!.id,
        meta: { from: "unverified", to: "verified" },
      }),
    ]);
    expect(eventsDiterima).toEqual([
      { companyId: baris[0]!.id, verifiedBy: ADMIN, verifiedAt: expect.any(String) },
    ]);
    expect(baris[0]?.verifiedBy).toBe(ADMIN);
  });

  it("id tidak ada → 404, tanpa audit/event", async () => {
    const { base, audit, eventsDiterima } = await boot();
    const res = await panggil(base, "POST", `/admin/companies/${TAK_ADA}/verify`, await tokenUntuk(ADMIN));

    expect(res.status).toBe(404);
    expect(audit).toHaveLength(0);
    expect(eventsDiterima).toHaveLength(0);
  });

  it("seeker tidak dapat memanggil verify → 403, status tak berubah", async () => {
    const { base, baris } = await boot({ baris: [barisBaru()] });
    const res = await panggil(
      base,
      "POST",
      `/admin/companies/${baris[0]!.id}/verify`,
      await tokenUntuk(SEEKER),
    );

    expect(res.status).toBe(403);
    expect(baris[0]?.inclusivityStatus).toBe("unverified");
  });
});

describe("GET /api/v1/admin/companies — daftar admin", () => {
  it("mengembalikan seluruh perusahaan terurut nama, termasuk field admin", async () => {
    const { base } = await boot({
      baris: [
        barisBaru({ id: "018f4c1e-1111-7000-8000-000000000002", name: "Zebra Corp" }),
        barisBaru({ id: "018f4c1e-1111-7000-8000-000000000003", name: "Awal Corp" }),
      ],
    });
    const res = await panggil(base, "GET", "/admin/companies", await tokenUntuk(ADMIN));
    const body = await badan(res);

    expect((body.data as { name: string }[]).map((c) => c.name)).toEqual(["Awal Corp", "Zebra Corp"]);
    expect((body.data as Record<string, unknown>[])[0]).toHaveProperty("verifiedBy");
  });
});

describe("deklarasi akses route (PR-019)", () => {
  it("companies: dua route publik, empat route admin", async () => {
    const { registry } = await boot();
    const daftar = registry.list();

    expect(daftar.map((e) => `${e.method} ${e.path}`).sort()).toEqual([
      "GET /api/v1/admin/companies",
      "GET /api/v1/companies/:id",
      "GET /api/v1/companies/:id/jobs",
      "POST /api/v1/admin/companies",
      "POST /api/v1/admin/companies/:id/verify",
      "PUT /api/v1/admin/companies/:id",
    ]);

    const publikPaths = ["/api/v1/companies/:id", "/api/v1/companies/:id/jobs"];
    for (const path of publikPaths) {
      expect(daftar.find((e) => e.path === path)?.access.kind).toBe("public");
    }
    for (const entri of daftar.filter((e) => !publikPaths.includes(e.path))) {
      expect(entri.access).toMatchObject({ kind: "role", roles: ["admin"] });
    }
  });
});
