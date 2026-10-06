import type { Request, Response } from "express";
import type { CommunityReportListQuery } from "@nawasena/schemas";
import type { CommunityAdminService } from "../services/admin.service.js";
import { randomUUID } from "node:crypto";
import { authOf } from "../../../core/auth/index.js";
export function createCommunityAdminController(service: CommunityAdminService) {
  return {
    async queue(req: Request, res: Response) {
      res.json(await service.queue(req.query as unknown as CommunityReportListQuery));
    },
    async report(req: Request, res: Response) {
      res.json({ data: await service.report(req.params.id!) });
    },
    async metrics(_req: Request, res: Response) {
      res.json({ data: await service.metrics() });
    },
    async reject(req: Request, res: Response) {
      res.json({
        data: await service.reject(
          {
            userId: authOf(req).userId,
            requestId: typeof req.id === "string" ? req.id : randomUUID(),
          },
          req.params.id!,
          req.body.reason as string,
        ),
      });
    },
  };
}
