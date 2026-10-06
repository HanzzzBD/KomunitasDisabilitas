import type { EmployerRepository } from "../repositories/employer.repository.js";
export function createEmployerExportContributor(
  repo: Pick<EmployerRepository, "exportMemberships">,
) {
  return {
    bagian: "employerMemberships",
    async kumpulkan(userId: string) {
      return (await repo.exportMemberships(userId)).map((m) => ({
        companyId: m.companyId,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      }));
    },
  };
}
