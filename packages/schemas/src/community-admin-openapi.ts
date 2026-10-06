import type { ZodOpenApiPathItemObject } from "zod-openapi";
import { errorEnvelopeSchema } from "./common.js";
import {
  communityIdParamsSchema,
  communityReportListQuerySchema,
  communityReasonInputSchema,
} from "./community.js";
import {
  communityQueueResponseSchema,
  communityQueueDetailResponseSchema,
  communityMetricsResponseSchema,
} from "./community-admin.js";
const response = (
  schema:
    | typeof errorEnvelopeSchema
    | typeof communityQueueResponseSchema
    | typeof communityQueueDetailResponseSchema
    | typeof communityMetricsResponseSchema,
  description: string,
) => ({ description, content: { "application/json": { schema } } });
const errors = Object.fromEntries(
  ["400", "401", "403", "404", "429", "503"].map((code) => [
    code,
    response(errorEnvelopeSchema, "Permintaan tidak valid atau akses ditolak"),
  ]),
);
export const communityAdminPaths: Record<string, ZodOpenApiPathItemObject> = {
  "/admin/community-queue": {
    get: {
      operationId: "listCommunityQueue",
      tags: ["community"],
      summary: "Antrean minimal admin, terlama dahulu",
      description:
        "createdAt ASC/id ASC; tanpa identitas pelapor/resolver atau data profil. Filter status dan cursor.",
      requestParams: { query: communityReportListQuerySchema },
      responses: { "200": response(communityQueueResponseSchema, "Laporan"), ...errors },
    },
  },
  "/admin/community-queue/{id}": {
    get: {
      operationId: "getCommunityQueueReport",
      tags: ["community"],
      summary: "Detail laporan minimal (admin)",
      requestParams: { path: communityIdParamsSchema },
      responses: { "200": response(communityQueueDetailResponseSchema, "Laporan"), ...errors },
    },
  },
  "/admin/community-metrics": {
    get: {
      operationId: "getCommunityMetrics",
      tags: ["community"],
      summary: "Metrik agregat Community 30 hari (admin)",
      description:
        "Jendela 30x24 jam UTC. Keanggotaan aktif yang masih tercatat (pasangan akun/ruang), post semua status dibuat dalam periode, backlog open saat ini, mean durasi resolved/rejected yang ditutup dalam periode. Tanpa PII atau penyimpanan baru.",
      responses: { "200": response(communityMetricsResponseSchema, "Metrik"), ...errors },
    },
  },
  "/admin/community-queue/{id}/reject": {
    post: {
      operationId: "rejectCommunityQueueReport",
      tags: ["community"],
      summary: "Tolak laporan dengan audit atomik",
      description:
        "Admin-only; alasan wajib, respons tanpa identitas pelapor/resolver. Penolakan tidak mengubah konten.",
      requestParams: { path: communityIdParamsSchema },
      requestBody: {
        required: true,
        content: { "application/json": { schema: communityReasonInputSchema } },
      },
      responses: {
        "200": response(communityQueueDetailResponseSchema, "Laporan ditolak"),
        "409": response(errorEnvelopeSchema, "Laporan sudah ditutup"),
        ...errors,
      },
    },
  },
};
