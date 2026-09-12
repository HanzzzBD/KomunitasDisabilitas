// modules/companies — router. Path relatif; prefix `/api/v1` dipegang registrar.
//
// `/companies/:id` PUBLIK dengan sengaja (US-09, PRD FR-6.1): kandidat menilai
// perusahaan SEBELUM melamar, dan seringkali sebelum masuk sama sekali. Empat
// route `/admin/companies*` berperan admin — endpoint /admin/* PERTAMA di
// seluruh repo (PR-052 membangun shell FE-nya).
import type { Router } from "express";
import { companyIdParamsSchema, createCompanySchema, updateCompanySchema } from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { CompaniesController } from "../controllers/companies.controller.js";

export function createCompaniesRouter(controller: CompaniesController, routes: RouteRegistrar): Router {
  routes.get(
    "/companies/:id",
    access.public("Profil inklusivitas perusahaan dilihat kandidat sebelum melamar, sering tanpa sesi"),
    validate({ params: companyIdParamsSchema }),
    asyncHandler(controller.getPublic),
  );

  routes.get("/admin/companies", access.role("admin"), asyncHandler(controller.listAdmin));
  routes.post(
    "/admin/companies",
    access.role("admin"),
    validate({ body: createCompanySchema }),
    asyncHandler(controller.createAdmin),
  );
  routes.put(
    "/admin/companies/:id",
    access.role("admin"),
    validate({ params: companyIdParamsSchema, body: updateCompanySchema }),
    asyncHandler(controller.updateAdmin),
  );
  routes.post(
    "/admin/companies/:id/verify",
    access.role("admin"),
    validate({ params: companyIdParamsSchema }),
    asyncHandler(controller.verifyAdmin),
  );

  return routes.router;
}
