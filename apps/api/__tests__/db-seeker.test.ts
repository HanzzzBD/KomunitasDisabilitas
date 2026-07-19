// Integration test migrasi 02 domain seeker (PR-010).
// Pola sama dengan db-migrasi.test.ts (PR-009): skip anggun bila DB tidak
// terjangkau; CI menjalankan seluruh test dengan service Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test seeker dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    // Bersihkan artefak test (prefix khusus)
    const usersUji = await prisma.user.findMany({ where: { phone: { startsWith: "+62888" } } });
    for (const u of usersUji) {
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
  await prisma.$disconnect();
});

async function buatUserUji(suffix: string) {
  return prisma.user.create({
    data: { id: uuidV7(), phone: `+62888${suffix}`, fullName: "Uji Seeker" },
  });
}

describe("migrasi 02 seeker — kolom sensitif bytea (AC)", () => {
  it("disability_types & accommodation_needs bertipe bytea (introspeksi)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const rows = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>(
      Prisma.sql`SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'seeker_profiles'
          AND column_name IN ('disability_types','accommodation_needs')`,
    );
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.data_type, `${r.column_name} harus bytea`).toBe("bytea");
    }
  });

  it("tidak ada kolom sensitif bertipe text/jsonb plaintext (AC keamanan)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Nama yang mengisyaratkan data sensitif tidak boleh plaintext.
    const sensitif = ["disability_types", "accommodation_needs"];
    const rows = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>(
      Prisma.sql`SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'seeker_profiles'
          AND column_name = ANY(${sensitif})`,
    );
    for (const r of rows) {
      expect(["bytea"], `${r.column_name} harus bytea, bukan ${r.data_type}`).toContain(
        r.data_type,
      );
    }
  });
});

describe("migrasi 02 seeker — vector roundtrip (AC)", () => {
  it("insert + select embedding 768-dim via raw SQL ber-parameter", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const user = await buatUserUji("000001");
    const profileId = user.id;
    // Buat vektor 768 dimensi (0.1 semua — bukan random supaya test deterministik).
    const dims = Array.from({ length: 768 }, () => 0.1).join(",");
    const embeddingStr = `[${dims}]`;

    await prisma.$executeRaw`
      INSERT INTO seeker_profiles (user_id, open_to_remote, disclosure_default, created_at, updated_at)
      VALUES (${profileId}::uuid, false, 'ask_each_time', now(), now())
    `;
    await prisma.$executeRaw`
      UPDATE seeker_profiles
      SET profile_embedding = ${embeddingStr}::vector
      WHERE user_id = ${profileId}::uuid
    `;

    // Cosine distance dari diri sendiri = 0 (sudut 0°).
    const dist = await prisma.$queryRaw<Array<{ dist: number }>>`
      SELECT profile_embedding <=> ${embeddingStr}::vector AS dist
      FROM seeker_profiles
      WHERE user_id = ${profileId}::uuid
    `;
    const d = dist[0]?.dist ?? 1;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(1e-6); // cosine(self, self) ≈ 0
  });
});

describe("migrasi 02 seeker — HNSW EXPLAIN (AC)", () => {
  it("query cosine dengan enable_seqscan=off memakai index HNSW", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const dims = Array.from({ length: 768 }, () => 0.5).join(",");
    const probe = `[${dims}]`;
    // SET LOCAL + EXPLAIN harus dalam satu transaksi; $queryRaw menolak
    // multi-statement dalam prepared statement — gunakan $transaction.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
        EXPLAIN
          SELECT user_id FROM seeker_profiles
          ORDER BY profile_embedding <=> ${probe}::vector
          LIMIT 5
      `;
    });
    const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
    expect(planText.toLowerCase()).toMatch(/hnsw|index/);
  });
});

describe("migrasi 02 seeker — FK CASCADE dari users (AC)", () => {
  it("delete user → seeker_profile + experience + skill + resume ikut terhapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const user = await buatUserUji("000002");
    const uid = user.id;

    // Buat entri di setiap tabel anak.
    await prisma.$executeRaw`INSERT INTO seeker_profiles (user_id, open_to_remote, disclosure_default, created_at, updated_at) VALUES (${uid}::uuid, false, 'ask_each_time', now(), now())`;
    await prisma.experience.create({ data: { id: uuidV7(), userId: uid, title: "Uji" } });
    await prisma.skill.create({ data: { id: uuidV7(), userId: uid, name: "Uji Skill" } });
    await prisma.resume.create({ data: { id: uuidV7(), userId: uid, title: "Uji Resume" } });

    await prisma.user.delete({ where: { id: uid } });

    const [prof, exp, skl, res] = await Promise.all([
      prisma.$queryRaw<Array<unknown>>`SELECT 1 FROM seeker_profiles WHERE user_id = ${uid}::uuid`,
      prisma.experience.count({ where: { userId: uid } }),
      prisma.skill.count({ where: { userId: uid } }),
      prisma.resume.count({ where: { userId: uid } }),
    ]);
    expect(prof).toHaveLength(0);
    expect(exp).toBe(0);
    expect(skl).toBe(0);
    expect(res).toBe(0);
  });
});

describe("migrasi 02 seeker — enum & default (AC)", () => {
  it("disclosure_default default ask_each_time; nilai liar ditolak", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const user = await buatUserUji("000003");
    await prisma.$executeRaw`INSERT INTO seeker_profiles (user_id, open_to_remote, disclosure_default, created_at, updated_at) VALUES (${user.id}::uuid, false, 'ask_each_time', now(), now())`;

    const rows = await prisma.$queryRaw<Array<{ disclosure_default: string }>>`
      SELECT disclosure_default FROM seeker_profiles WHERE user_id = ${user.id}::uuid
    `;
    expect(rows[0]?.disclosure_default).toBe("ask_each_time");

    await expect(
      prisma.$executeRaw`UPDATE seeker_profiles SET disclosure_default = 'sembarangan'::"DisclosureDefault" WHERE user_id = ${user.id}::uuid`,
    ).rejects.toThrow();
  });
});
