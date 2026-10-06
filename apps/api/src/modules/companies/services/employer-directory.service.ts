import type { EmployerRepository } from "../repositories/employer.repository.js";
export function createEmployerDirectoryService(repo: Pick<EmployerRepository, "recipientsForJob">) {
  return { idEmployerLowongan: (jobId: string) => repo.recipientsForJob(jobId) };
}
