// Integration audit (PR-014) — mengikuti pola skip-anggun test DB lain.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AUDIT_ACTION } from "@nawasena/schemas";
import { createAuditLog, createPrismaAuditWriter, type AuditLoggerOptions } from "../src/core/audit/index.js";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test audit dilewati.");
  }
});

afterAll(async () => {
  // TIDAK ADA PEMBERSIHAN, dan itu bukan kelalaian: sejak migrasi 13 baris
  // `audit_logs` memang tidak bisa dihapus lagi — trigger database menolak
  // UPDATE/DELETE/TRUNCATE dari siapa pun, termasuk test. `deleteMany` yang
  // dulu ada di sini kini melempar, jadi membiarkannya akan membuat berkas ini
  // merah karena penjaganya bekerja.
  //
  // Aman ditinggalkan: setiap baris memakai id v7 sendiri dan seluruh assertion
  // mencarinya lewat `id`, jadi penumpukan antar-jalankan tidak menyentuh apa
  // pun. CI memulai dari DB kosong setiap kali; DB dev lokal dibersihkan lewat
  // `prisma migrate reset`.
  await prisma.$disconnect();
});

async function waitForAudit(id: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const row = await prisma.auditLog.findUnique({ where: { id } });
    if (row !== null) return row;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return null;
}

describe("auditLog — penulisan Prisma", () => {
  it("menulis satu baris append-only dengan requestId tanpa PII", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const created: string[] = [];
    const writer = createPrismaAuditWriter(prisma);
    const auditLog = createAuditLog({
      writer: {
        async append(entry) {
          created.push(entry.id);
          await writer.append(entry);
        },
      },
      logger: { error: () => {}, warn: () => {} } as unknown as AuditLoggerOptions["logger"],
      metrics: { increment: () => {} },
    });
    const actorId = uuidV7();
    const requestId = uuidV7();
    const entityId = uuidV7();

    auditLog(
      { actorId, requestId },
      AUDIT_ACTION.PROFILE_SENSITIVE_READ,
      "audit-test",
      entityId,
      {
        purpose: "support",
        fields: ["disabilityTypes"],
        reason: "tiket #4821",
        phone: "nomor-dummy",
      },
    );

    const id = created[0];
    expect(id).toBeDefined();
    const row = await waitForAudit(id ?? "");
    expect(row).toMatchObject({
      actorId,
      action: AUDIT_ACTION.PROFILE_SENSITIVE_READ,
      entity: "audit-test",
      entityId,
    });
    expect(row?.meta).toEqual({
      requestId,
      purpose: "support",
      fields: ["disabilityTypes"],
      reason: "tiket #4821",
    });
    expect(JSON.stringify(row?.meta)).not.toContain("nomor-dummy");
  });
});
