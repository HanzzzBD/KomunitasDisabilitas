// modules/jobs — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// `/jobs/:id` PUBLIK dengan sengaja (US-09/US-0X, PRD FR-4.1): kandidat
// membaca detail lowongan sebelum melamar, sering tanpa sesi — pola sama
// dengan `/companies/:id` (PR-051). Lima route `/admin/jobs*` berperan admin.
import type { Router } from "express";
import {
  createJobSchema,
  jobIdParamsSchema,
  jobSearchQuerySchema,
  updateJobSchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { JobsController } from "../controllers/jobs.controller.js";

export function createJobsRouter(controller: JobsController, routes: RouteRegistrar): Router {
  // Terdaftar SEBELUM `/jobs/:id` (daftar sebelum detail) — segmen path
  // keduanya berbeda jumlah, jadi urutan pendaftaran tidak memengaruhi Express.
  routes.get(
    "/jobs",
    access.public("Pencarian lowongan dilihat kandidat sebelum melamar, sering tanpa sesi"),
    validate({ query: jobSearchQuerySchema }),
    asyncHandler(controller.search),
  );

  routes.get(
    "/jobs/:id",
    access.public("Detail lowongan dilihat kandidat sebelum melamar, sering tanpa sesi"),
    validate({ params: jobIdParamsSchema }),
    asyncHandler(controller.getPublic),
  );

  routes.get("/admin/jobs", access.role("admin"), asyncHandler(controller.listAdmin));
  routes.post(
    "/admin/jobs",
    access.role("admin"),
    validate({ body: createJobSchema }),
    asyncHandler(controller.createAdmin),
  );
  routes.put(
    "/admin/jobs/:id",
    access.role("admin"),
    validate({ params: jobIdParamsSchema, body: updateJobSchema }),
    asyncHandler(controller.updateAdmin),
  );
  routes.post(
    "/admin/jobs/:id/publish",
    access.role("admin"),
    validate({ params: jobIdParamsSchema }),
    asyncHandler(controller.publishAdmin),
  );
  routes.post(
    "/admin/jobs/:id/close",
    access.role("admin"),
    validate({ params: jobIdParamsSchema }),
    asyncHandler(controller.closeAdmin),
  );
  routes.delete(
    "/admin/jobs/:id",
    access.role("admin"),
    validate({ params: jobIdParamsSchema }),
    asyncHandler(controller.deleteAdmin),
  );

  return routes.router;
}
