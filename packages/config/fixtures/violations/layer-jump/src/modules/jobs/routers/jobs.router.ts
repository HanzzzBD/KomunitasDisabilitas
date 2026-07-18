// PELANGGARAN 3: router LONCAT lapisan langsung ke repository.
// Harus lewat controller → boundaries/element-types error.
import { jobsRepository } from "../repositories/jobs.repository";

export const jobsRouter = {
  get: () => jobsRepository.findAll(),
};
