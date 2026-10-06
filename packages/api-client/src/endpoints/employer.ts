import { z } from "zod";
import {
  employerCompaniesResponseSchema,
  employerCompanyResponseSchema,
  registerEmployerSchema,
  updateEmployerCompanySchema,
  jobAdminResponseSchema,
  jobAdminListResponseSchema,
  createJobSchema,
  updateJobSchema,
  adminApplicationListResponseSchema,
  adminApplicationDetailResponseSchema,
  updateApplicationStatusSchema,
} from "@nawasena/schemas";
import type { ApiClient } from "../client.js";
const part = encodeURIComponent;
export const employerApi = {
  async companies(c: ApiClient) {
    return (
      await c.request("/employer/companies", { responseSchema: employerCompaniesResponseSchema })
    ).data;
  },
  async register(c: ApiClient, body: z.input<typeof registerEmployerSchema>) {
    return (
      await c.request("/employer/register", {
        method: "POST",
        body: registerEmployerSchema.parse(body),
        responseSchema: employerCompanyResponseSchema,
      })
    ).data;
  },
  async updateCompany(c: ApiClient, id: string, body: z.input<typeof updateEmployerCompanySchema>) {
    return (
      await c.request(`/employer/companies/${part(id)}`, {
        method: "PUT",
        body: updateEmployerCompanySchema.parse(body),
        responseSchema: employerCompanyResponseSchema,
      })
    ).data;
  },
  async jobs(c: ApiClient, companyId: string) {
    return (
      await c.request(`/employer/companies/${part(companyId)}/jobs`, {
        responseSchema: jobAdminListResponseSchema,
      })
    ).data;
  },
  async createJob(c: ApiClient, body: z.input<typeof createJobSchema>) {
    return (
      await c.request("/employer/jobs", {
        method: "POST",
        body: createJobSchema.parse(body),
        responseSchema: jobAdminResponseSchema,
      })
    ).data;
  },
  async updateJob(c: ApiClient, id: string, body: z.input<typeof updateJobSchema>) {
    return (
      await c.request(`/employer/jobs/${part(id)}`, {
        method: "PUT",
        body: updateJobSchema.parse(body),
        responseSchema: jobAdminResponseSchema,
      })
    ).data;
  },
  async jobAction(c: ApiClient, id: string, action: "publish" | "close") {
    return (
      await c.request(`/employer/jobs/${part(id)}/${action}`, {
        method: "POST",
        responseSchema: jobAdminResponseSchema,
      })
    ).data;
  },
  applications(c: ApiClient, jobId: string, cursor?: string) {
    return c.request(
      `/employer/jobs/${part(jobId)}/applications${cursor ? `?cursor=${part(cursor)}` : ""}`,
      { responseSchema: adminApplicationListResponseSchema },
    );
  },
  async application(c: ApiClient, id: string) {
    return (
      await c.request(`/employer/applications/${part(id)}`, {
        responseSchema: adminApplicationDetailResponseSchema,
      })
    ).data;
  },
  async status(c: ApiClient, id: string, body: z.input<typeof updateApplicationStatusSchema>) {
    return (
      await c.request(`/employer/applications/${part(id)}/status`, {
        method: "PUT",
        body: updateApplicationStatusSchema.parse(body),
        responseSchema: adminApplicationDetailResponseSchema,
      })
    ).data;
  },
  async reviews(c: ApiClient) {
    return (
      await c.request("/admin/employers", { responseSchema: employerCompaniesResponseSchema })
    ).data;
  },
  approval(c: ApiClient, id: string, status: "approved" | "rejected") {
    return c.request(`/admin/employers/${part(id)}/approval`, {
      method: "POST",
      body: { status },
      responseSchema: z.undefined(),
    });
  },
};
