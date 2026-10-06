import {
  AUDIT_ACTION,
  employerCompanySchema,
  type CreateCompany,
  type CreateJob,
  type UpdateJob,
  type UpdateCompany,
  type AdminApplicationListQuery,
  type UpdateApplicationStatus,
} from "@nawasena/schemas";
import type { JobsService } from "../../jobs/services/jobs.service.js";
import type { AdminApplicationsService } from "../../applications/services/admin-applications.service.js";
import type { AuditLog } from "../../../core/audit/index.js";
import { appError } from "../../../core/http/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import type { CompaniesService } from "./companies.service.js";
import type { EmployerRepository } from "../repositories/employer.repository.js";
export type { AdminApplicationsService } from "../../applications/services/admin-applications.service.js";

export interface EmployerActor {
  userId: string;
  requestId: string;
  role: "employer";
}
export interface EmployerDeps {
  repo: EmployerRepository;
  companies: CompaniesService;
  jobs: JobsService;
  applications: AdminApplicationsService;
  auditLog: AuditLog;
  enroll(userId: string): Promise<void>;
}
export function createEmployerService(deps: EmployerDeps) {
  const { repo, companies, jobs, applications } = deps;
  async function access(userId: string, companyId: string, publish = false) {
    const member = await repo.member(userId, companyId);
    if (!member) throw appError("PERUSAHAAN_TIDAK_DITEMUKAN");
    if (publish && member.company.recruitmentStatus !== "approved") {
      throw appError("EMPLOYER_BELUM_DISETUJUI");
    }
    return member;
  }
  async function job(actor: EmployerActor, id: string, publish = false) {
    const row = await jobs.getForManagement(id);
    await access(actor.userId, row.companyId, publish);
    return row;
  }
  async function application(actor: EmployerActor, id: string) {
    const jobId = await applications.jobId(id);
    await job(actor, jobId, true);
  }
  async function company(userId: string, id: string) {
    const member = await access(userId, id);
    return employerCompanySchema.parse({
      ...(await companies.getPublic(id)),
      memberRole: member.role,
      recruitmentStatus: member.company.recruitmentStatus,
    });
  }
  function audit(actor: { userId: string; requestId: string }, id: string, operation: string) {
    deps.auditLog(
      { actorId: actor.userId, requestId: actor.requestId },
      AUDIT_ACTION.EMPLOYER_RESOURCE_CHANGED,
      "companies.employer",
      id,
      { operation },
    );
  }
  return {
    async list(userId: string) {
      const members = await repo.list(userId);
      return Promise.all(members.map((m) => company(userId, m.companyId)));
    },
    async register(actor: { userId: string; requestId: string }, input: CreateCompany) {
      if ((await repo.list(actor.userId)).length >= 5) throw appError("TIDAK_BERHAK");
      await deps.enroll(actor.userId);
      const id = uuidV7();
      await repo.create(id, actor.userId, input);
      audit(actor, id, "create");
      return company(actor.userId, id);
    },
    async updateCompany(actor: EmployerActor, id: string, input: UpdateCompany) {
      const member = await access(actor.userId, id);
      if (member.role !== "owner") throw appError("TIDAK_BERHAK");
      await companies.update(actor, id, input);
      return company(actor.userId, id);
    },
    async listJobs(actor: EmployerActor, companyId: string) {
      await access(actor.userId, companyId);
      return jobs.listForCompany(companyId);
    },
    async createJob(actor: EmployerActor, input: CreateJob) {
      await access(actor.userId, input.companyId);
      return jobs.create(actor, input);
    },
    async updateJob(actor: EmployerActor, id: string, input: UpdateJob) {
      const row = await job(actor, id);
      await access(actor.userId, row.companyId, row.status === "published");
      return jobs.update(actor, id, input);
    },
    async publishJob(actor: EmployerActor, id: string) {
      await job(actor, id, true);
      return jobs.publish(actor, id);
    },
    async closeJob(actor: EmployerActor, id: string) {
      await job(actor, id);
      return jobs.close(actor, id);
    },
    async listApplications(actor: EmployerActor, jobId: string, query: AdminApplicationListQuery) {
      await job(actor, jobId, true);
      return applications.list({ ...query, job_id: jobId, termasuk_ditangguhkan: "false" });
    },
    async detailApplication(actor: EmployerActor, id: string) {
      await application(actor, id);
      return applications.detail(id);
    },
    async updateStatus(actor: EmployerActor, id: string, input: UpdateApplicationStatus) {
      await application(actor, id);
      return applications.ubahStatus(actor, id, input);
    },
    async reviewList() {
      return Promise.all(
        (await repo.reviewList()).map(async (r) =>
          employerCompanySchema.parse({
            ...(await companies.getPublic(r.id)),
            recruitmentStatus: r.recruitmentStatus,
            memberRole: "owner",
          }),
        ),
      );
    },
    async approve(
      actor: { userId: string; requestId: string },
      id: string,
      status: "approved" | "rejected",
    ) {
      if (!(await repo.approve(id, status))) throw appError("PERUSAHAAN_TIDAK_DITEMUKAN");
      audit(actor, id, status === "approved" ? "approve" : "reject");
      if (status === "rejected") {
        for (const posting of await jobs.listForCompany(id)) {
          if (posting.status === "published")
            await jobs.close({ ...actor, role: "admin" }, posting.id);
        }
      }
    },
  };
}
export type EmployerService = ReturnType<typeof createEmployerService>;
