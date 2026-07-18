// Controller jobs — boleh ke service-nya sendiri. TIDAK ke repository.
import { jobsService } from "../services/jobs.service";

export const jobsController = {
  list: () => jobsService.list(),
};
