// modules/health — controller: request ↔ service.
import type { Request, Response } from "express";
import { appError } from "../../../core/http/index.js";
import type { HealthService } from "../services/health.service.js";

export function createHealthController(service: HealthService) {
  return {
    /** GET /healthz — liveness (dipakai compose healthcheck & Uptime Kuma). */
    healthz(_req: Request, res: Response): void {
      res.json({ data: service.liveness() });
    },

    /** GET /readyz — readiness; dependensi mati → 503 envelope BELUM_SIAP. */
    async readyz(req: Request, res: Response): Promise<void> {
      const { siap, detail } = await service.readiness();
      if (!siap) {
        // Detail per-dependensi untuk operator hanya ke log (ber-requestId),
        // klien menerima envelope standar.
        req.log?.warn({ detail }, "Readiness gagal");
        throw appError("BELUM_SIAP");
      }
      res.json({ data: { status: "siap", ...detail } });
    },
  };
}

export type HealthController = ReturnType<typeof createHealthController>;
