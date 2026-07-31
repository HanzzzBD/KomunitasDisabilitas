// modules/internal — controller: request ↔ service.
import type { Request, Response } from "express";
import type { QueuesService } from "../services/queues.service.js";

export function createQueuesController(service: QueuesService) {
  return {
    /** GET /internal/queues — kedalaman antrean + DLQ (SDD §17, alert DLQ > 0). */
    async list(_req: Request, res: Response): Promise<void> {
      res.json({ data: await service.status() });
    },
  };
}

export type QueuesController = ReturnType<typeof createQueuesController>;
