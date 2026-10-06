import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type {
  CreateCompany,
  CreateJob,
  UpdateJob,
  UpdateCompany,
  UpdateApplicationStatus,
  AdminApplicationListQuery,
} from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import type { EmployerService, EmployerActor } from "../services/employer.service.js";
function actor(req: Request): EmployerActor {
  return {
    userId: authOf(req).userId,
    requestId: typeof req.id === "string" ? req.id : randomUUID(),
    role: "employer",
  };
}
function id(req: Request) {
  return req.params["id"] as string;
}
export function createEmployerController(service: EmployerService) {
  return {
    async list(req: Request, res: Response) {
      res.json({ data: await service.list(authOf(req).userId) });
    },
    async register(req: Request, res: Response) {
      res.status(201).json({ data: await service.register(actor(req), req.body as CreateCompany) });
    },
    async updateCompany(req: Request, res: Response) {
      res.json({
        data: await service.updateCompany(actor(req), id(req), req.body as UpdateCompany),
      });
    },
    async jobs(req: Request, res: Response) {
      res.json({ data: await service.listJobs(actor(req), id(req)) });
    },
    async createJob(req: Request, res: Response) {
      res.status(201).json({ data: await service.createJob(actor(req), req.body as CreateJob) });
    },
    async updateJob(req: Request, res: Response) {
      res.json({ data: await service.updateJob(actor(req), id(req), req.body as UpdateJob) });
    },
    async publish(req: Request, res: Response) {
      res.json({ data: await service.publishJob(actor(req), id(req)) });
    },
    async close(req: Request, res: Response) {
      res.json({ data: await service.closeJob(actor(req), id(req)) });
    },
    async applications(req: Request, res: Response) {
      res.json(
        await service.listApplications(
          actor(req),
          id(req),
          req.query as unknown as AdminApplicationListQuery,
        ),
      );
    },
    async detail(req: Request, res: Response) {
      res.json({ data: await service.detailApplication(actor(req), id(req)) });
    },
    async status(req: Request, res: Response) {
      res.json({
        data: await service.updateStatus(actor(req), id(req), req.body as UpdateApplicationStatus),
      });
    },
    async reviews(_req: Request, res: Response) {
      res.json({ data: await service.reviewList() });
    },
    async approve(req: Request, res: Response) {
      await service.approve(
        actor(req),
        id(req),
        (req.body as { status: "approved" | "rejected" }).status,
      );
      res.status(204).end();
    },
  };
}
export type EmployerController = ReturnType<typeof createEmployerController>;
