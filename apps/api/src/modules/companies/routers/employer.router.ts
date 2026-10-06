import {
  employerCompanyParamsSchema,
  registerEmployerSchema,
  updateEmployerCompanySchema,
  employerApprovalSchema,
  createJobSchema,
  updateJobSchema,
  adminApplicationListQuerySchema,
  updateApplicationStatusSchema,
} from "@nawasena/schemas";
import { access, type RouteRegistrar } from "../../../core/auth/index.js";
import { asyncHandler, validate } from "../../../core/http/index.js";
import type { EmployerController } from "../controllers/employer.controller.js";
export function createEmployerRouter(c: EmployerController, routes: RouteRegistrar) {
  const params = employerCompanyParamsSchema;
  routes.get("/employer/companies", access.role("employer"), asyncHandler(c.list));
  routes.post(
    "/employer/register",
    access.role("seeker", "employer"),
    validate({ body: registerEmployerSchema }),
    asyncHandler(c.register),
  );
  routes.put(
    "/employer/companies/:id",
    access.role("employer"),
    validate({ params, body: updateEmployerCompanySchema }),
    asyncHandler(c.updateCompany),
  );
  routes.get(
    "/employer/companies/:id/jobs",
    access.role("employer"),
    validate({ params }),
    asyncHandler(c.jobs),
  );
  routes.post(
    "/employer/jobs",
    access.role("employer"),
    validate({ body: createJobSchema }),
    asyncHandler(c.createJob),
  );
  routes.put(
    "/employer/jobs/:id",
    access.role("employer"),
    validate({ params, body: updateJobSchema }),
    asyncHandler(c.updateJob),
  );
  routes.post(
    "/employer/jobs/:id/publish",
    access.role("employer"),
    validate({ params }),
    asyncHandler(c.publish),
  );
  routes.post(
    "/employer/jobs/:id/close",
    access.role("employer"),
    validate({ params }),
    asyncHandler(c.close),
  );
  routes.get(
    "/employer/jobs/:id/applications",
    access.role("employer"),
    validate({ params, query: adminApplicationListQuerySchema }),
    asyncHandler(c.applications),
  );
  routes.get(
    "/employer/applications/:id",
    access.role("employer"),
    validate({ params }),
    asyncHandler(c.detail),
  );
  routes.put(
    "/employer/applications/:id/status",
    access.role("employer"),
    validate({ params, body: updateApplicationStatusSchema }),
    asyncHandler(c.status),
  );
  routes.get("/admin/employers", access.role("admin"), asyncHandler(c.reviews));
  routes.post(
    "/admin/employers/:id/approval",
    access.role("admin"),
    validate({ params, body: employerApprovalSchema }),
    asyncHandler(c.approve),
  );
  return routes.router;
}
