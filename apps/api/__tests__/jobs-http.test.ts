// Integration HTTP modul `jobs` (PR-055) — server Express nyata, token RS256
// nyata, guard sesi/role dari registrar PR-019, Prisma palsu in-memory.
//
// Acceptance Criteria yang dijaga file ini:
//   AC-1 publish tanpa field akomodasi → 422
//   AC-2 publish → event `job.published` (assert)
//   AC-3 delete lowongan berlamaran → ditolak; close = jalur resmi
//   AC-4 transisi status ilegal ditolak
//   AC-5 GET publik hanya lowongan published & belum expired
import { describe, it, expect, afterEach } from "vitest";
import { Writable } from "node:stream";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AUDIT_ACTION, type UserRole } from "@nawasena/schemas";
import { loadEnv, type Env } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { createServer, type ApiServer } from "../src/server.js";
import { createJobsModule } from "../src/modules/jobs/index.js";
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
const PERUSAHAAN_ID = "018f4c1e-1111-7000-8000-000000000001";

const tokens = createTokenService(SESSION_KEYS);

interface BarisJob {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requirements: string | null;
  employmentType: string;
  workMode: string;
  city: string | null;
  province: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryVisible: boolean;
  accommodations: string[];
  welcomedDisabilityTypes: string[];
  source: string;
  status: "draft" | "published" | "closed";
  createdBy: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function jobBaru(overrides: Partial<BarisJob> = {}): BarisJob {
  return {
    id: "018f4c1e-2222-7000-8000-000000000001",
    companyId: PERUSAHAAN_ID,
    title: "Staf Admin",
    description: "Melayani pelanggan dengan ramah.",
    requirements: null,
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    salaryMin: null,
    salaryMax: null,
    salaryVisible: true,
    accommodations: [],
    welcomedDisabilityTypes: [],
    source: "admin_curated",
    status: "draft",
    createdBy: null,
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

function prismaError(code: string, message: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "5.22.0" });
}

/** Prisma palsu: tabel `jobs` in-memory — pola sama dengan `ai-usage-recorder.test.ts`. */
function fakePrisma(
  jobs: BarisJob[],
  opsi: { perusahaanValid?: Set<string>; berlamaran?: Set<string> } = {},
) {
  const perusahaanValid = opsi.perusahaanValid ?? new Set([PERUSAHAAN_ID]);
  const berlamaran = opsi.berlamaran ?? new Set<string>();
  const ambil = (id: string) => jobs.find((j) => j.id === id);

  const job = {
    findMany: ({ orderBy }: { orderBy?: { createdAt?: "asc" | "desc" } } = {}) => {
      const salinan = jobs.map((j) => ({ ...j }));
      if (orderBy?.createdAt === "desc") {
        salinan.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return Promise.resolve(salinan);
    },
    findUnique: ({ where }: { where: { id: string } }) => {
      const found = ambil(where.id);
      return Promise.resolve(found === undefined ? null : { ...found });
    },
    create: ({ data }: { data: Partial<BarisJob> & { id: string; companyId: string } }) => {
      if (!perusahaanValid.has(data.companyId)) {
        return Promise.reject(prismaError("P2003", "Foreign key constraint violated"));
      }
      const baris = jobBaru({ ...data });
      jobs.push(baris);
      return Promise.resolve({ ...baris });
    },
    updateMany: ({ where, data }: { where: { id: string }; data: Partial<BarisJob> }) => {
      const baris = ambil(where.id);
      if (baris === undefined) return Promise.resolve({ count: 0 });
      Object.assign(baris, data, { updatedAt: new Date() });
      return Promise.resolve({ count: 1 });
    },
    delete: ({ where }: { where: { id: string } }) => {
      const idx = jobs.findIndex((j) => j.id === where.id);
      if (idx === -1) return Promise.reject(prismaError("P2025", "Record to delete not found"));
      if (berlamaran.has(where.id)) {
        return Promise.reject(prismaError("P2003", "Foreign key constraint violated"));
      }
      const [dihapus] = jobs.splice(idx, 1);
      return Promise.resolve(dihapus);
    },
  };

  return { job } as unknown as PrismaClient;
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

async function boot(
  options: {
    jobs?: BarisJob[];
    perusahaanValid?: Set<string>;
    berlamaran?: Set<string>;
  } = {},
) {
  const env = testEnv();
  const jobs = options.jobs ?? [];
  const audit: Jejak[] = [];
  const events = busUji();
  const dipublikasikan: unknown[] = [];
  const ditutup: unknown[] = [];
  events.on("job.published", (payload) => {
    dipublikasikan.push(payload);
  });
  events.on("job.closed", (payload) => {
    ditutup.push(payload);
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
        createJobsModule({
          prisma: fakePrisma(jobs, {
            perusahaanValid: options.perusahaanValid,
            berlamaran: options.berlamaran,
          }),
          routes: registry.forModule("/api/v1"),
          auditLog: (_actor, action, entity, entityId, meta) => {
            audit.push({ action, entity, entityId, meta });
          },
          events,
          clock: () => new Date("2026-08-21T10:00:00.000Z"),
        }).router,
      );
    },
  });
  assertRoutesDeclared(api.app, registry);
  const { port } = await api.start();
  active = api;
  return {
    base: `http://127.0.0.1:${port}/api/v1`,
    jobs,
    audit,
    dipublikasikan,
    ditutup,
    registry,
  };
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

describe("GET /api/v1/jobs/:id — publik (AC-5)", () => {
  it("published tanpa tenggat → 200", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru({ status: "published" })] });
    const res = await panggil(base, "GET", `/jobs/${jobs[0]!.id}`);
    expect(res.status).toBe(200);
  });

  it("published dengan tenggat MASA DEPAN → 200", async () => {
    const { base, jobs } = await boot({
      jobs: [jobBaru({ status: "published", expiresAt: new Date("2099-01-01T00:00:00Z") })],
    });
    const res = await panggil(base, "GET", `/jobs/${jobs[0]!.id}`);
    expect(res.status).toBe(200);
  });

  it("published tetapi LEWAT tenggat → 404", async () => {
    const { base, jobs } = await boot({
      jobs: [jobBaru({ status: "published", expiresAt: new Date("2020-01-01T00:00:00Z") })],
    });
    const res = await panggil(base, "GET", `/jobs/${jobs[0]!.id}`);
    expect(res.status).toBe(404);
    expect(await badan(res)).toMatchObject({ code: "LOWONGAN_TIDAK_DITEMUKAN" });
  });

  it("draft → 404 (tidak bocor sebelum diterbitkan)", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru({ status: "draft" })] });
    const res = await panggil(base, "GET", `/jobs/${jobs[0]!.id}`);
    expect(res.status).toBe(404);
  });

  it("closed → 404", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru({ status: "closed" })] });
    const res = await panggil(base, "GET", `/jobs/${jobs[0]!.id}`);
    expect(res.status).toBe(404);
  });

  it("tanpa token → 200 saat published (publik dengan sengaja)", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru({ status: "published" })] });
    const res = await panggil(base, "GET", `/jobs/${jobs[0]!.id}`);
    expect(res.status).toBe(200);
  });

  it("id tidak ada → 404", async () => {
    const { base } = await boot();
    const res = await panggil(base, "GET", `/jobs/${TAK_ADA}`);
    expect(res.status).toBe(404);
  });

  it("id bukan UUID → 400 VALIDATION_ERROR", async () => {
    const { base } = await boot();
    const res = await panggil(base, "GET", "/jobs/bukan-uuid");
    expect(res.status).toBe(400);
  });

  it("hanya field publik — TIDAK ada status/source/createdBy/salaryVisible", async () => {
    const { base, jobs } = await boot({
      jobs: [jobBaru({ status: "published", createdBy: ADMIN })],
    });
    const res = await panggil(base, "GET", `/jobs/${jobs[0]!.id}`);
    const body = await badan(res);
    expect(body.data).not.toHaveProperty("status");
    expect(body.data).not.toHaveProperty("source");
    expect(body.data).not.toHaveProperty("createdBy");
    expect(body.data).not.toHaveProperty("salaryVisible");
  });
});

describe("rute /admin/jobs* — matriks akses (pola AC-1 companies)", () => {
  const RUTE_ADMIN = [
    ["GET", "/admin/jobs"],
    ["POST", "/admin/jobs"],
    ["PUT", `/admin/jobs/${TAK_ADA}`],
    ["DELETE", `/admin/jobs/${TAK_ADA}`],
    ["POST", `/admin/jobs/${TAK_ADA}/publish`],
    ["POST", `/admin/jobs/${TAK_ADA}/close`],
  ] as const;

  it("tanpa token → 401 di seluruh route admin", async () => {
    const { base } = await boot();
    for (const [method, path] of RUTE_ADMIN) {
      const res = await panggil(base, method, path);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("seeker (bukan admin) → 403 TIDAK_BERHAK di seluruh route admin", async () => {
    const { base } = await boot();
    const token = await tokenUntuk(SEEKER);
    for (const [method, path] of RUTE_ADMIN) {
      const res = await panggil(base, method, path, token, method === "GET" ? undefined : {});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await badan(res)).toMatchObject({ code: "TIDAK_BERHAK" });
    }
  });
});

describe("POST /api/v1/admin/jobs — create", () => {
  function badanValid(overrides: Record<string, unknown> = {}) {
    return {
      companyId: PERUSAHAAN_ID,
      title: "Kasir",
      description: "Melayani transaksi pelanggan.",
      employmentType: "part_time",
      workMode: "onsite",
      ...overrides,
    };
  }

  it("admin membuat lowongan → 201, lahir draft, audit create", async () => {
    const { base, audit } = await boot();
    const res = await panggil(base, "POST", "/admin/jobs", await tokenUntuk(ADMIN), badanValid());

    expect(res.status).toBe(201);
    const body = await badan(res);
    expect(body.data).toMatchObject({ title: "Kasir", status: "draft" });
    expect(audit).toEqual([
      expect.objectContaining({
        action: AUDIT_ACTION.ADMIN_RESOURCE_CHANGED,
        meta: { operation: "create" },
      }),
    ]);
  });

  it("companyId tidak menunjuk perusahaan yang ada → 404 PERUSAHAAN_TIDAK_DITEMUKAN", async () => {
    const { base } = await boot({ perusahaanValid: new Set() });
    const res = await panggil(base, "POST", "/admin/jobs", await tokenUntuk(ADMIN), badanValid());

    expect(res.status).toBe(404);
    expect(await badan(res)).toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" });
  });

  it("judul kosong → 400 VALIDATION_ERROR", async () => {
    const { base } = await boot();
    const res = await panggil(
      base,
      "POST",
      "/admin/jobs",
      await tokenUntuk(ADMIN),
      badanValid({ title: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("taksonomi akomodasi liar → 400 VALIDATION_ERROR (AC pola PR-051)", async () => {
    const { base } = await boot();
    const res = await panggil(
      base,
      "POST",
      "/admin/jobs",
      await tokenUntuk(ADMIN),
      badanValid({ accommodations: ["kursi_pijat"] }),
    );
    expect(res.status).toBe(400);
    expect(await badan(res)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("salaryMin > salaryMax → 400 VALIDATION_ERROR", async () => {
    const { base } = await boot();
    const res = await panggil(
      base,
      "POST",
      "/admin/jobs",
      await tokenUntuk(ADMIN),
      badanValid({ salaryMin: 9_000_000, salaryMax: 5_000_000 }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/v1/admin/jobs/:id — update", () => {
  it("admin mengubah judul → 200, audit update", async () => {
    const { base, jobs, audit } = await boot({ jobs: [jobBaru()] });
    const res = await panggil(
      base,
      "PUT",
      `/admin/jobs/${jobs[0]!.id}`,
      await tokenUntuk(ADMIN),
      { title: "Kasir Senior" },
    );

    expect(res.status).toBe(200);
    expect((await badan(res)).data).toMatchObject({ title: "Kasir Senior" });
    expect(audit).toEqual([expect.objectContaining({ meta: { operation: "update" } })]);
  });

  it("id tidak ada → 404 LOWONGAN_TIDAK_DITEMUKAN", async () => {
    const { base } = await boot();
    const res = await panggil(base, "PUT", `/admin/jobs/${TAK_ADA}`, await tokenUntuk(ADMIN), {
      title: "Apapun",
    });
    expect(res.status).toBe(404);
  });

  it("mengirim `status` di body → 400 (transisi hanya lewat publish/close)", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru()] });
    const res = await panggil(
      base,
      "PUT",
      `/admin/jobs/${jobs[0]!.id}`,
      await tokenUntuk(ADMIN),
      { status: "published" },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/admin/jobs/:id/publish — AC-1, AC-2, AC-4", () => {
  it("draft + akomodasi terisi → 200 published, audit, event job.published", async () => {
    const { base, jobs, audit, dipublikasikan } = await boot({
      jobs: [jobBaru({ status: "draft", accommodations: ["akses_kursi_roda"] })],
    });
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${jobs[0]!.id}/publish`,
      await tokenUntuk(ADMIN),
    );

    expect(res.status).toBe(200);
    expect((await badan(res)).data).toMatchObject({ status: "published" });
    expect(audit).toEqual([expect.objectContaining({ meta: { operation: "publish" } })]);
    expect(dipublikasikan).toEqual([
      {
        jobId: jobs[0]!.id,
        companyId: PERUSAHAAN_ID,
        publishedAt: expect.any(String),
      },
    ]);
  });

  it("draft TANPA akomodasi → 422 AKOMODASI_LOWONGAN_KOSONG (AC-1)", async () => {
    const { base, jobs, dipublikasikan } = await boot({
      jobs: [jobBaru({ status: "draft", accommodations: [] })],
    });
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${jobs[0]!.id}/publish`,
      await tokenUntuk(ADMIN),
    );

    expect(res.status).toBe(422);
    expect(await badan(res)).toMatchObject({ code: "AKOMODASI_LOWONGAN_KOSONG" });
    expect(dipublikasikan).toHaveLength(0);
  });

  it("sudah published → 409 TRANSISI_STATUS_TIDAK_VALID (AC-4, tidak idempoten)", async () => {
    const { base, jobs } = await boot({
      jobs: [jobBaru({ status: "published", accommodations: ["akses_kursi_roda"] })],
    });
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${jobs[0]!.id}/publish`,
      await tokenUntuk(ADMIN),
    );
    expect(res.status).toBe(409);
    expect(await badan(res)).toMatchObject({ code: "TRANSISI_STATUS_TIDAK_VALID" });
  });

  it("closed → 409 TRANSISI_STATUS_TIDAK_VALID (AC-4)", async () => {
    const { base, jobs } = await boot({
      jobs: [jobBaru({ status: "closed", accommodations: ["akses_kursi_roda"] })],
    });
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${jobs[0]!.id}/publish`,
      await tokenUntuk(ADMIN),
    );
    expect(res.status).toBe(409);
  });

  it("id tidak ada → 404", async () => {
    const { base } = await boot();
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${TAK_ADA}/publish`,
      await tokenUntuk(ADMIN),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/admin/jobs/:id/close — AC-4", () => {
  it("published → 200 closed, audit, event job.closed reason=closed_by_admin", async () => {
    const { base, jobs, audit, ditutup } = await boot({
      jobs: [jobBaru({ status: "published" })],
    });
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${jobs[0]!.id}/close`,
      await tokenUntuk(ADMIN),
    );

    expect(res.status).toBe(200);
    expect((await badan(res)).data).toMatchObject({ status: "closed" });
    expect(audit).toEqual([expect.objectContaining({ meta: { operation: "close" } })]);
    expect(ditutup).toEqual([
      { jobId: jobs[0]!.id, closedAt: expect.any(String), reason: "closed_by_admin" },
    ]);
  });

  it("draft → 409 TRANSISI_STATUS_TIDAK_VALID", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru({ status: "draft" })] });
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${jobs[0]!.id}/close`,
      await tokenUntuk(ADMIN),
    );
    expect(res.status).toBe(409);
  });

  it("sudah closed → 409 TRANSISI_STATUS_TIDAK_VALID (tidak idempoten)", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru({ status: "closed" })] });
    const res = await panggil(
      base,
      "POST",
      `/admin/jobs/${jobs[0]!.id}/close`,
      await tokenUntuk(ADMIN),
    );
    expect(res.status).toBe(409);
  });

  it("id tidak ada → 404", async () => {
    const { base } = await boot();
    const res = await panggil(base, "POST", `/admin/jobs/${TAK_ADA}/close`, await tokenUntuk(ADMIN));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/admin/jobs/:id — AC-3", () => {
  it("lowongan tanpa lamaran → 204, audit delete", async () => {
    const { base, jobs, audit } = await boot({ jobs: [jobBaru()] });
    const res = await panggil(base, "DELETE", `/admin/jobs/${jobs[0]!.id}`, await tokenUntuk(ADMIN));

    expect(res.status).toBe(204);
    expect(audit).toEqual([expect.objectContaining({ meta: { operation: "delete" } })]);
  });

  it("lowongan berlamaran → 409 LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS (AC-3)", async () => {
    const baris = jobBaru();
    const { base, audit } = await boot({ jobs: [baris], berlamaran: new Set([baris.id]) });
    const res = await panggil(base, "DELETE", `/admin/jobs/${baris.id}`, await tokenUntuk(ADMIN));

    expect(res.status).toBe(409);
    expect(await badan(res)).toMatchObject({ code: "LOWONGAN_BERLAMARAN_TIDAK_BISA_DIHAPUS" });
    expect(audit).toHaveLength(0);
  });

  it("id tidak ada → 404", async () => {
    const { base } = await boot();
    const res = await panggil(base, "DELETE", `/admin/jobs/${TAK_ADA}`, await tokenUntuk(ADMIN));
    expect(res.status).toBe(404);
  });

  it("seeker tidak dapat menghapus → 403, baris tetap ada", async () => {
    const { base, jobs } = await boot({ jobs: [jobBaru()] });
    const res = await panggil(base, "DELETE", `/admin/jobs/${jobs[0]!.id}`, await tokenUntuk(SEEKER));

    expect(res.status).toBe(403);
    expect(jobs).toHaveLength(1);
  });
});

describe("GET /api/v1/admin/jobs — daftar admin", () => {
  it("mengembalikan seluruh lowongan, termasuk field admin", async () => {
    const { base } = await boot({
      jobs: [jobBaru({ id: "018f4c1e-2222-7000-8000-000000000002", title: "A" })],
    });
    const res = await panggil(base, "GET", "/admin/jobs", await tokenUntuk(ADMIN));
    const body = await badan(res);

    expect((body.data as Record<string, unknown>[])[0]).toHaveProperty("status");
    expect((body.data as Record<string, unknown>[])[0]).toHaveProperty("source");
  });
});

describe("deklarasi akses route (PR-019)", () => {
  it("jobs: dua route publik, lima route admin", async () => {
    const { registry } = await boot();
    const daftar = registry.list();

    expect(daftar.map((e) => `${e.method} ${e.path}`).sort()).toEqual([
      "DELETE /api/v1/admin/jobs/:id",
      "GET /api/v1/admin/jobs",
      "GET /api/v1/jobs",
      "GET /api/v1/jobs/:id",
      "POST /api/v1/admin/jobs",
      "POST /api/v1/admin/jobs/:id/close",
      "POST /api/v1/admin/jobs/:id/publish",
      "PUT /api/v1/admin/jobs/:id",
    ]);

    const publik = ["/api/v1/jobs", "/api/v1/jobs/:id"];
    for (const path of publik) {
      expect(daftar.find((e) => e.path === path)?.access.kind).toBe("public");
    }
    for (const entri of daftar.filter((e) => !publik.includes(e.path))) {
      expect(entri.access).toMatchObject({ kind: "role", roles: ["admin"] });
    }
  });
});
