// Integration test migrasi 03 marketplace (PR-011) — pola skip-anggun.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { uuidV7 } from "../src/core/ids/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;

// Artefak test: nama company berprefix — dibersihkan afterAll.
const PREFIX = "UJI-MKT-";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test marketplace dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    await prisma.application.deleteMany({
      where: { job: { company: { name: { startsWith: PREFIX } } } },
    });
    await prisma.job.deleteMany({ where: { company: { name: { startsWith: PREFIX } } } });
    await prisma.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
    const users = await prisma.user.findMany({ where: { phone: { startsWith: "+62777" } } });
    for (const u of users) await prisma.user.delete({ where: { id: u.id } });
  }
  await prisma.$disconnect();
});

async function buatFixture(suffix: string) {
  const user = await prisma.user.create({
    data: { id: uuidV7(), phone: `+62777${suffix}`, fullName: "Uji Marketplace" },
  });
  const company = await prisma.company.create({
    data: { id: uuidV7(), name: `${PREFIX}${suffix}` },
  });
  const job = await prisma.job.create({
    data: {
      id: uuidV7(),
      companyId: company.id,
      title: `Kasir Toko ${suffix}`,
      description: "Melayani pembayaran pelanggan dengan ramah",
      employmentType: "full_time",
      workMode: "onsite",
      status: "published",
    },
  });
  return { user, company, job };
}

describe("migrasi 03 — EXPLAIN memakai indeks (AC)", () => {
  it("FTS indonesian → jobs_fts_gin", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
        EXPLAIN SELECT id FROM jobs
        WHERE to_tsvector('indonesian', coalesce(title,'') || ' ' || coalesce(description,''))
              @@ plainto_tsquery('indonesian', 'kasir')
      `;
    });
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("jobs_fts_gin");
  });

  it("trigram title → jobs_title_trgm", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
        EXPLAIN SELECT id FROM jobs WHERE title % 'kasirr'
      `;
    });
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("jobs_title_trgm");
  });

  it("vector cosine → jobs_embedding_hnsw", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const probe = `[${Array.from({ length: 768 }, () => 0.5).join(",")}]`;
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
        EXPLAIN SELECT id FROM jobs
        ORDER BY job_embedding <=> ${probe}::vector LIMIT 5
      `;
    });
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("jobs_embedding_hnsw");
  });
});

describe("migrasi 03 — idempotensi apply (AC race)", () => {
  it("2 insert paralel (user,job) sama → tepat satu sukses, satu P2002", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { user, job } = await buatFixture("000001");

    const buatLamaran = () =>
      prisma.application.create({
        data: { id: uuidV7(), userId: user.id, jobId: job.id },
      });
    const hasil = await Promise.allSettled([buatLamaran(), buatLamaran()]);

    const sukses = hasil.filter((h) => h.status === "fulfilled");
    const gagal = hasil.filter((h): h is PromiseRejectedResult => h.status === "rejected");
    expect(sukses).toHaveLength(1);
    expect(gagal).toHaveLength(1);
    expect((gagal[0]?.reason as { code?: string }).code).toBe("P2002");
  });
});

describe("migrasi 03 — FK Restrict (AC riwayat tak hilang)", () => {
  it("delete job yang punya lamaran → ditolak; delete company yang punya job → ditolak", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { user, company, job } = await buatFixture("000002");
    await prisma.application.create({ data: { id: uuidV7(), userId: user.id, jobId: job.id } });

    // Catatan: pelanggaran ON DELETE RESTRICT = SQLSTATE 23001, TIDAK dipetakan
    // Prisma ke P2003 (hanya 23503) — assert perilaku: ditolak & baris utuh.
    await expect(prisma.job.delete({ where: { id: job.id } })).rejects.toThrow(/restrict|violat/i);
    await expect(prisma.company.delete({ where: { id: company.id } })).rejects.toThrow(
      /restrict|violat/i,
    );
    expect(await prisma.job.count({ where: { id: job.id } })).toBe(1);
    expect(await prisma.company.count({ where: { id: company.id } })).toBe(1);
  });

  it("kontras: delete USER → application ikut terhapus (Cascade, hak hapus PDP)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const { user, job } = await buatFixture("000003");
    await prisma.application.create({ data: { id: uuidV7(), userId: user.id, jobId: job.id } });

    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.application.count({ where: { jobId: job.id } })).toBe(0);
  });
});

describe("migrasi 03 — enum sesuai SDD (AC snapshot)", () => {
  it("seluruh enum marketplace ter-snapshot", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const rows = await prisma.$queryRaw<Array<{ enum_name: string; nilai: string[] }>>(
      Prisma.sql`SELECT t.typname AS enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS nilai
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('InclusivityStatus','EmploymentType','WorkMode','JobSource','JobStatus','ApplicationStatus','AiFeature','SignVideoStatus')
        GROUP BY t.typname ORDER BY t.typname`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.enum_name, r.nilai]))).toMatchInlineSnapshot(`
      {
        "AiFeature": [
          "cv_chat",
          "cv_finalize",
          "cv_check",
          "simplify_text",
          "interview_sim",
          "rerank",
          "embed",
        ],
        "ApplicationStatus": [
          "submitted",
          "viewed",
          "in_review",
          "interview",
          "offered",
          "hired",
          "rejected",
          "withdrawn",
        ],
        "EmploymentType": [
          "full_time",
          "part_time",
          "contract",
          "internship",
          "freelance",
        ],
        "InclusivityStatus": [
          "unverified",
          "self_claimed",
          "verified",
        ],
        "JobSource": [
          "admin_curated",
          "employer",
          "aggregated",
        ],
        "JobStatus": [
          "draft",
          "published",
          "closed",
        ],
        "SignVideoStatus": [
          "draft",
          "published",
        ],
        "WorkMode": [
          "onsite",
          "hybrid",
          "remote",
        ],
      }
    `);
  });

  it("partial index notifications unread ada", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const idx = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'notifications_unread'
    `;
    expect(idx[0]?.indexdef).toContain("WHERE (read_at IS NULL)");
  });
});
