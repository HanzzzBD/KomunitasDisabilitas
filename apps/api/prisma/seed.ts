// Entry seed — dipanggil `prisma migrate reset` / `db:seed` (PR-009/012).
// Logika di seed-data.ts (importable oleh test); file ini hanya wiring CLI.
/* eslint-disable no-console -- script CLI: output ke console adalah antarmukanya */
import { PrismaClient } from "@prisma/client";
import { runSeed, seedSummary, SeedProductionError } from "./seed-data.js";

const prisma = new PrismaClient();

try {
  await runSeed(prisma);
  console.log("Seed selesai:", await seedSummary(prisma));
} catch (err) {
  if (err instanceof SeedProductionError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
} finally {
  await prisma.$disconnect();
}
