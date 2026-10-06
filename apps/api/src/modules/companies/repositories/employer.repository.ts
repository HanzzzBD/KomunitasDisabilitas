import type { CreateCompany } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";

export function createEmployerRepository(prisma: AppPrisma) {
  return {
    async recipientsForJob(jobId: string) {
      const rows = await prisma.employerMember.findMany({
        where: {
          company: { recruitmentStatus: "approved", jobs: { some: { id: jobId } } },
          user: { deletedAt: null, suspendedAt: null, role: "employer" },
        },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    },
    exportMemberships(userId: string) {
      return prisma.employerMember.findMany({
        where: { userId },
        select: { companyId: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
    },
    list(userId: string) {
      return prisma.employerMember.findMany({
        where: { userId },
        select: { companyId: true, role: true, company: { select: { recruitmentStatus: true } } },
        orderBy: { createdAt: "asc" },
      });
    },
    member(userId: string, companyId: string) {
      return prisma.employerMember.findUnique({
        where: { companyId_userId: { companyId, userId } },
        select: { role: true, company: { select: { recruitmentStatus: true } } },
      });
    },
    create(id: string, userId: string, input: CreateCompany) {
      return prisma.company.create({
        data: {
          id,
          ...input,
          employerMembers: { create: { userId, role: "owner" } },
        },
        select: { id: true },
      });
    },
    reviewList() {
      return prisma.company.findMany({
        where: { employerMembers: { some: {} } },
        select: { id: true, recruitmentStatus: true },
        orderBy: { createdAt: "desc" },
      });
    },
    async approve(id: string, status: "approved" | "rejected") {
      const result = await prisma.company.updateMany({
        where: { id, employerMembers: { some: {} } },
        data: { recruitmentStatus: status },
      });
      return result.count === 1;
    },
  };
}
export type EmployerRepository = ReturnType<typeof createEmployerRepository>;
