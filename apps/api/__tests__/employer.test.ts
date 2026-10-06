import { describe, it, expect, vi } from "vitest";
import {
  registerEmployerSchema,
  createJobSchema,
  updateEmployerCompanySchema,
  type UserRole,
} from "@nawasena/schemas";
import {
  createEmployerService,
  type EmployerDeps,
} from "../src/modules/companies/services/employer.service.js";
import { createEmployerController } from "../src/modules/companies/controllers/employer.controller.js";
import { createEmployerRouter } from "../src/modules/companies/routers/employer.router.js";
import {
  createAccessGuards,
  createRouteRegistry,
  createTokenService,
  assertRoutesDeclared,
} from "../src/core/auth/index.js";
import { createServer } from "../src/server.js";
import { loadEnv } from "../src/core/config/env.js";
import { createLogger } from "../src/core/logger/index.js";
import { SESSION_KEYS } from "./helpers/session.js";
import { Writable } from "node:stream";

const OWNER = "01912345-1111-7000-8000-000000000001";
const COMPANY = "01912345-2222-7000-8000-000000000001";
const OTHER = "01912345-2222-7000-8000-000000000002";
const JOB = "01912345-3333-7000-8000-000000000001";
const APPLICATION = "01912345-4444-7000-8000-000000000001";
const actor = { userId: OWNER, requestId: "test-employer", role: "employer" as const };
const input = createJobSchema.parse({
  companyId: COMPANY,
  title: "Analis",
  description: "Uji lowongan",
  employmentType: "full_time",
  workMode: "remote",
});
function setup({ approved = true, foreign = false, recruiter = false } = {}) {
  const repo = {
    list: vi.fn(async () => [{ companyId: COMPANY }]),
    member: vi.fn(async (userId: string, id: string) =>
      userId === OWNER && id === COMPANY
        ? {
            role: recruiter ? "recruiter" : "owner",
            company: { recruitmentStatus: approved ? "approved" : "pending" },
          }
        : null,
    ),
    create: vi.fn(async (id: string) => ({ id })),
    reviewList: vi.fn(async () => []),
    approve: vi.fn(async () => true),
  };
  const companies = {
    getPublic: vi.fn(async (id: string) => ({
      id,
      name: "Demo",
      description: null,
      website: null,
      city: "Jakarta",
      inclusivityStatus: "unverified",
      accommodationsAvailable: [],
      verifiedAt: null,
    })),
    update: vi.fn(),
  };
  const jobs = {
    getForManagement: vi.fn(async () => ({
      id: JOB,
      companyId: foreign ? OTHER : COMPANY,
      status: "draft",
    })),
    listForCompany: vi.fn(async () => [] as Array<{ id: string; status: string }>),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    close: vi.fn(),
  };
  const applications = {
    jobId: vi.fn(async () => JOB),
    list: vi.fn(async () => ({ data: [], meta: { nextCursor: null } })),
    detail: vi.fn(),
    ubahStatus: vi.fn(),
  };
  const deps = {
    repo,
    companies,
    jobs,
    applications,
    auditLog: vi.fn(),
    enroll: vi.fn(),
  } as unknown as EmployerDeps;
  return { service: createEmployerService(deps), deps, repo, companies, jobs, applications };
}
describe("Employer tenant boundary", () => {
  it("returns only server membership companies", async () => {
    const s = setup();
    const rows = await s.service.list(OWNER);
    expect(rows.map((c) => c.id)).toEqual([COMPANY]);
    expect(s.repo.list).toHaveBeenCalledWith(OWNER);
  });
  it("rejects forging approval, inclusion badge and membership in company input", () => {
    expect(
      registerEmployerSchema.safeParse({ name: "Demo", recruitmentStatus: "approved" }).success,
    ).toBe(false);
    expect(
      registerEmployerSchema.safeParse({ name: "Demo", employerMembers: [{ userId: OWNER }] })
        .success,
    ).toBe(false);
    expect(updateEmployerCompanySchema.safeParse({ inclusivityStatus: "verified" }).success).toBe(
      false,
    );
  });
  it("drafts are allowed while approval is pending", async () => {
    const s = setup({ approved: false });
    await s.service.createJob(actor, input);
    expect(s.jobs.create).toHaveBeenCalledWith(actor, input);
  });
  it("pending company cannot publish or read applicant data", async () => {
    const s = setup({ approved: false });
    await expect(s.service.publishJob(actor, JOB)).rejects.toMatchObject({
      code: "EMPLOYER_BELUM_DISETUJUI",
    });
    await expect(s.service.detailApplication(actor, APPLICATION)).rejects.toMatchObject({
      code: "EMPLOYER_BELUM_DISETUJUI",
    });
    expect(s.jobs.publish).not.toHaveBeenCalled();
    expect(s.applications.detail).not.toHaveBeenCalled();
  });
  it("create/list/update company never crosses membership", async () => {
    const s = setup();
    await expect(s.service.createJob(actor, { ...input, companyId: OTHER })).rejects.toMatchObject({
      code: "PERUSAHAAN_TIDAK_DITEMUKAN",
    });
    await expect(s.service.listJobs(actor, OTHER)).rejects.toMatchObject({
      code: "PERUSAHAAN_TIDAK_DITEMUKAN",
    });
    await expect(s.service.updateCompany(actor, OTHER, { name: "Hijack" })).rejects.toMatchObject({
      code: "PERUSAHAAN_TIDAK_DITEMUKAN",
    });
    expect(s.jobs.create).not.toHaveBeenCalled();
    expect(s.jobs.listForCompany).not.toHaveBeenCalled();
    expect(s.companies.update).not.toHaveBeenCalled();
  });
  it.each(["updateJob", "publishJob", "closeJob"] as const)(
    "%s rejects foreign jobs before mutations",
    async (method) => {
      const s = setup({ foreign: true });
      await expect(
        method === "updateJob"
          ? s.service.updateJob(actor, JOB, { title: "Hijack" })
          : s.service[method](actor, JOB),
      ).rejects.toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" });
      expect(s.jobs.update).not.toHaveBeenCalled();
      expect(s.jobs.publish).not.toHaveBeenCalled();
      expect(s.jobs.close).not.toHaveBeenCalled();
    },
  );
  it.each(["detail", "status", "list"])(
    "%s rejects foreign applicants before names, contacts or CV are read",
    async (method) => {
      const s = setup({ foreign: true });
      const call =
        method === "detail"
          ? s.service.detailApplication(actor, APPLICATION)
          : method === "status"
            ? s.service.updateStatus(actor, APPLICATION, { status: "viewed", reason: "Reviewed" })
            : s.service.listApplications(actor, JOB, { limit: 50 });
      await expect(call).rejects.toMatchObject({ code: "PERUSAHAAN_TIDAK_DITEMUKAN" });
      expect(s.applications.detail).not.toHaveBeenCalled();
      expect(s.applications.ubahStatus).not.toHaveBeenCalled();
      expect(s.applications.list).not.toHaveBeenCalled();
    },
  );
  it("ignores user supplied foreign job and suspended filters", async () => {
    const s = setup();
    await s.service.listApplications(actor, JOB, {
      limit: 50,
      job_id: "foreign-job",
      termasuk_ditangguhkan: "true",
    });
    expect(s.applications.list).toHaveBeenCalledWith({
      limit: 50,
      job_id: JOB,
      termasuk_ditangguhkan: "false",
    });
  });
  it("records the employer actor for hiring status", async () => {
    const s = setup();
    const body = { status: "viewed" as const, reason: "Reviewed" };
    await s.service.updateStatus(actor, APPLICATION, body);
    expect(s.applications.ubahStatus).toHaveBeenCalledWith(actor, APPLICATION, body);
  });
  it("a recruiter cannot edit corporate identity", async () => {
    const s = setup({ recruiter: true });
    await expect(
      s.service.updateCompany(actor, COMPANY, { name: "Changed" }),
    ).rejects.toMatchObject({ code: "TIDAK_BERHAK" });
  });
  it("rejected recruitment closes published postings through the admin domain service", async () => {
    const s = setup();
    s.jobs.listForCompany.mockImplementationOnce(async () => [
      { id: JOB, status: "published" },
      { id: "draft", status: "draft" },
    ]);
    await s.service.approve(actor, COMPANY, "rejected");
    expect(s.repo.approve).toHaveBeenCalledWith(COMPANY, "rejected");
    expect(s.jobs.close).toHaveBeenCalledOnce();
    expect(s.jobs.close).toHaveBeenCalledWith({ ...actor, role: "admin" }, JOB);
  });
});
describe("Employer HTTP guards", () => {
  it("anonymous/seeker are denied management; employer cannot approve; register validates input", async () => {
    const s = setup();
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:9",
      REDIS_URL: "redis://127.0.0.1:9",
      REDIS_QUEUE_URL: "redis://127.0.0.1:9",
      HOST: "127.0.0.1",
      PORT: "0",
    });
    const tokenService = createTokenService(SESSION_KEYS);
    let role: UserRole = "seeker";
    const guards = createAccessGuards({
      tokenService,
      findSessionUser: async (id) => ({ id, role, tokenVersion: 0 }),
    });
    const registry = createRouteRegistry({ guardsFor: guards.guardsFor });
    const api = createServer(
      env,
      createLogger(env, {
        destination: new Writable({
          write(_c, _e, cb) {
            cb();
          },
        }),
      }),
      {
        routes(app) {
          app.use(
            createEmployerRouter(
              createEmployerController(s.service),
              registry.forModule("/api/v1"),
            ),
          );
        },
      },
    );
    assertRoutesDeclared(api.app, registry);
    const { port } = await api.start();
    try {
      const url = `http://127.0.0.1:${port}/api/v1`;
      const token = await tokenService.signAccessToken({ sub: OWNER, role: "seeker", ver: 0 });
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      expect((await fetch(`${url}/employer/companies`)).status).toBe(401);
      expect((await fetch(`${url}/employer/companies`, { headers })).status).toBe(403);
      role = "employer"; // Authorization follows DB, not stale JWT role.
      expect((await fetch(`${url}/employer/companies`, { headers })).status).toBe(200);
      expect(
        (
          await fetch(`${url}/admin/employers/${COMPANY}/approval`, {
            method: "POST",
            headers,
            body: JSON.stringify({ status: "approved" }),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${url}/employer/register`, {
            method: "POST",
            headers,
            body: JSON.stringify({ name: "Demo", recruitmentStatus: "approved" }),
          })
        ).status,
      ).toBe(400);
    } finally {
      await api.stop();
    }
  });
});
