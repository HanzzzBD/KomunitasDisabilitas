// modules/admin — controller metrik (PR-080). Route dijaga `access.role("admin")`.
import type { Request, Response } from "express";
import type { AdminMetricsQuery } from "@nawasena/schemas";
import type { MetricsService } from "../services/metrics.service.js";

export function createMetricsController(service: MetricsService) {
  return {
    /** GET /api/v1/admin/metrics?periode= → 200 metrik agregat. */
    async get(req: Request, res: Response): Promise<void> {
      const { periode } = req.query as unknown as AdminMetricsQuery;
      res.status(200).json({ data: await service.get(periode) });
    },
  };
}

export type MetricsController = ReturnType<typeof createMetricsController>;
