// Repository jobs — lapisan paling bawah. Hanya core (Prisma via core).
import { asyncHandler } from "../../../core/http/async-handler";

export const jobsRepository = {
  findAll: () => [asyncHandler],
};
