// Router jobs — VALID: hanya ke controller-nya sendiri.
import { jobsController } from "../controllers/jobs.controller";

export const jobsRouter = {
  get: () => jobsController.list(),
};
