import type { AppPrisma } from "../../../core/db/index.js";
import { appError } from "../../../core/http/index.js";
import { createEmployerEnrollmentRepository } from "../repositories/employer-enrollment.repository.js";

/** Explicit self enrollment may promote seeker to employer; never grants admin. */
export function createEmployerEnrollment(prisma: AppPrisma) {
  const repo = createEmployerEnrollmentRepository(prisma);
  return async (userId: string) => {
    if (!(await repo.promote(userId))) throw appError("TIDAK_BERHAK");
  };
}
