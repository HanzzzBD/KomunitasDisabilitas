import type { ZodOpenApiPathItemObject } from "zod-openapi";
import type { z } from "zod";
import {
  employerCompaniesResponseSchema,
  employerCompanyResponseSchema,
  employerApprovalSchema,
  registerEmployerSchema,
  updateEmployerCompanySchema,
  employerCompanyParamsSchema,
} from "./employer.js";
import {
  jobAdminListResponseSchema,
  jobAdminResponseSchema,
  createJobSchema,
  updateJobSchema,
} from "./jobs.js";
import {
  adminApplicationListQuerySchema,
  adminApplicationListResponseSchema,
  adminApplicationDetailResponseSchema,
  updateApplicationStatusSchema,
} from "./applications-api.js";
import { errorEnvelopeSchema } from "./common.js";
const response = (schema: z.ZodTypeAny, description = "Berhasil") => ({
  description,
  content: { "application/json": { schema } },
});
const errors = {
  "400": response(errorEnvelopeSchema, "Input tidak valid"),
  "401": response(errorEnvelopeSchema, "Sesi tidak valid"),
  "403": response(errorEnvelopeSchema, "Role tidak berhak atau perusahaan belum disetujui"),
  "404": response(errorEnvelopeSchema, "Resource tidak ada dalam perusahaan pemilik sesi"),
};
function operation(
  operationId: string,
  summary: string,
  schema: z.ZodTypeAny | null,
  body?: z.ZodTypeAny,
  path = false,
  query?: z.ZodTypeAny,
) {
  return {
    operationId,
    summary,
    tags: ["employer"],
    ...(path || query
      ? {
          requestParams: {
            ...(path ? { path: employerCompanyParamsSchema } : {}),
            ...(query ? { query } : {}),
          },
        }
      : {}),
    ...(body
      ? { requestBody: { required: true, content: { "application/json": { schema: body } } } }
      : {}),
    responses: {
      ...errors,
      ...(schema ? { "200": response(schema) } : { "204": { description: "Berhasil" } }),
    },
  };
}
export const employerPaths: Record<string, ZodOpenApiPathItemObject> = {
  "/employer/companies": {
    get: operation(
      "listEmployerCompanies",
      "Perusahaan anggota akun employer",
      employerCompaniesResponseSchema,
    ),
  },
  "/employer/register": {
    post: {
      ...operation(
        "registerEmployer",
        "Pendaftaran perusahaan oleh seeker/employer; role menjadi employer, persetujuan pending",
        employerCompanyResponseSchema,
        registerEmployerSchema,
      ),
      responses: { ...errors, "201": response(employerCompanyResponseSchema) },
    },
  },
  "/employer/companies/{id}": {
    put: operation(
      "updateEmployerCompany",
      "Pemilik memperbarui perusahaan; persetujuan dan badge tidak dapat ditulis",
      employerCompanyResponseSchema,
      updateEmployerCompanySchema,
      true,
    ),
  },
  "/employer/companies/{id}/jobs": {
    get: operation(
      "listEmployerJobs",
      "Lowongan perusahaan anggota, termasuk draft",
      jobAdminListResponseSchema,
      undefined,
      true,
    ),
  },
  "/employer/jobs": {
    post: {
      ...operation(
        "createEmployerJob",
        "Draft source employer, termasuk sebelum persetujuan",
        jobAdminResponseSchema,
        createJobSchema,
      ),
      responses: { ...errors, "201": response(jobAdminResponseSchema) },
    },
  },
  "/employer/jobs/{id}": {
    put: operation(
      "updateEmployerJob",
      "Edit lowongan perusahaan anggota",
      jobAdminResponseSchema,
      updateJobSchema,
      true,
    ),
  },
  "/employer/jobs/{id}/publish": {
    post: operation(
      "publishEmployerJob",
      "Tayangkan draft setelah persetujuan dan akomodasi terisi; memicu matching",
      jobAdminResponseSchema,
      undefined,
      true,
    ),
  },
  "/employer/jobs/{id}/close": {
    post: operation(
      "closeEmployerJob",
      "Tutup lowongan tayang perusahaan anggota",
      jobAdminResponseSchema,
      undefined,
      true,
    ),
  },
  "/employer/jobs/{id}/applications": {
    get: operation(
      "listEmployerApplications",
      "Pelamar lowongan sendiri; cursor, tanpa data disabilitas",
      adminApplicationListResponseSchema,
      undefined,
      true,
      adminApplicationListQuerySchema,
    ),
  },
  "/employer/applications/{id}": {
    get: operation(
      "getEmployerApplication",
      "Kontak dan CV lampiran lowongan sendiri; tanpa data disabilitas",
      adminApplicationDetailResponseSchema,
      undefined,
      true,
    ),
  },
  "/employer/applications/{id}/status": {
    put: operation(
      "updateEmployerApplicationStatus",
      "Perubahan tahap employer dengan alasan audit dan notifikasi pelamar",
      adminApplicationDetailResponseSchema,
      updateApplicationStatusSchema,
      true,
    ),
  },
  "/admin/employers": {
    get: operation(
      "listEmployerApprovals",
      "Admin meninjau perusahaan employer",
      employerCompaniesResponseSchema,
    ),
  },
  "/admin/employers/{id}/approval": {
    post: operation(
      "approveEmployerCompany",
      "Admin menyetujui/menolak rekrutmen; penolakan menutup lowongan tayang; badge terpisah",
      null,
      employerApprovalSchema,
      true,
    ),
  },
};
