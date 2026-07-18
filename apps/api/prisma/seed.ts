// Seed admin pertama (PR-009) — idempotent: aman dijalankan berulang.
// Identitas dari env (SEED_ADMIN_PHONE/SEED_ADMIN_NAME); default dev di bawah
// BUKAN rahasia (login = OTP/Google, PR-016 — tidak ada password di sistem).
// Seed persona/fixture lengkap = PR-012.
/* eslint-disable no-console -- script CLI: output ke console adalah antarmukanya */
import { PrismaClient } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();

const phone = process.env.SEED_ADMIN_PHONE ?? "+620000000001";
const fullName = process.env.SEED_ADMIN_NAME ?? "Admin Dev";

try {
  // Upsert manual dengan unique PARSIAL (phone aktif) — prisma.upsert butuh
  // unique penuh, jadi cari dulu baris aktif.
  const existing = await prisma.user.findFirst({
    where: { phone, deletedAt: null },
    select: { id: true, role: true },
  });

  if (existing === null) {
    const admin = await prisma.user.create({
      data: { id: uuidV7(), phone, fullName, role: "admin" },
      select: { id: true },
    });
    await prisma.auditLog.create({
      data: {
        id: uuidV7(),
        actorId: null, // aksi sistem
        action: "seed.admin_dibuat",
        entity: "users",
        entityId: admin.id,
      },
    });
    console.log(`Seed: admin dibuat (${fullName}).`);
  } else if (existing.role !== "admin") {
    await prisma.user.update({ where: { id: existing.id }, data: { role: "admin" } });
    console.log("Seed: user ada, role dinaikkan ke admin.");
  } else {
    console.log("Seed: admin sudah ada — tidak ada perubahan.");
  }
} finally {
  await prisma.$disconnect();
}
