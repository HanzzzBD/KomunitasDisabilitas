import type { AppPrisma } from "../../../core/db/index.js";
export function createEmployerEnrollmentRepository(prisma: AppPrisma) {
  return {
    async promote(userId: string) {
      const result = await prisma.user.updateMany({
        where: {
          id: userId,
          role: { in: ["seeker", "employer"] },
          deletedAt: null,
          suspendedAt: null,
        },
        data: { role: "employer" },
      });
      return result.count === 1;
    },
  };
}
