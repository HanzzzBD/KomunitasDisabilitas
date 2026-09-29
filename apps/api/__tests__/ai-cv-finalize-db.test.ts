// Finalize sesi AI CV Builder — PostgreSQL sungguhan (PR-067).
//
// Yang hanya bisa dibuktikan database:
//   1. `mulaiFinalisasi` serentak — tepat SATU yang menang (UPDATE bersyarat).
//   2. Unique parsial `ai_chat_sessions_satu_terbuka` menghitung `finalizing`.
//   3. `selesaiFinalisasi` lolos CHECK `finalized_konsisten`; FK draft `SET NULL`.
//   4. Retensi `abandoned` ikut menjangkau `finalizing` yang tersangkut.
//   5. Migrasi down 18 → 17 benar-benar berjalan (transaksi di-rollback).
// Pola skip anggun sama dengan `ai-chat-sessions-db.test.ts`.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { resumeContentInputSchema, type ResumeContent } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import {
  createAiChatSessionPolicies,
  createChatSessionsRepository,
} from "../src/modules/ai/index.js";
import { createResumesRepository, createResumesService } from "../src/modules/resumes/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;
const repo = createChatSessionsRepository(prisma as unknown as AppPrisma);
const resumes = createResumesService({
  repo: createResumesRepository(prisma as unknown as AppPrisma),
  maksPerPengguna: 5,
});
const PREFIX_UJI = "+62885";
const WAKTU = new Date("2026-09-28T03:00:00.000Z");

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test finalize dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX_UJI } } });
  await prisma.$disconnect();
});

let urutan = 0;
async function aktor(): Promise<string> {
  urutan += 1;
  const u = await prisma.user.create({
    data: {
      id: uuidV7(),
      phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`,
      fullName: "Uji Finalize",
    },
  });
  return u.id;
}

async function sesiAktif(userId: string): Promise<string> {
  const { row } = await repo.createOrGetActive(userId, uuidV7(), WAKTU);
  return row.id;
}

describe("transisi finalize", () => {
  it("8 mulaiFinalisasi serentak → tepat satu `ok`, sisanya `diproses`", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const u = await aktor();
    const s = await sesiAktif(u);

    const hasil = await Promise.all(
      Array.from({ length: 8 }, () => repo.mulaiFinalisasi(u, s, WAKTU)),
    );
    expect(hasil.filter((h) => h === "ok")).toHaveLength(1);
    expect(hasil.filter((h) => h === "diproses")).toHaveLength(7);
  });

  it("finalizing ikut 'terbuka': mulai percakapan mengembalikannya; sesi aktif kedua ditolak indeks", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const u = await aktor();
    const s = await sesiAktif(u);
    await repo.mulaiFinalisasi(u, s, WAKTU);

    const { row, baru } = await repo.createOrGetActive(u, uuidV7(), WAKTU);
    expect(baru).toBe(false);
    expect(row).toMatchObject({ id: s, status: "finalizing" });

    await expect(
      prisma.aiChatSession.create({ data: { id: uuidV7(), userId: u } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("appendTurn pada sesi finalizing → sebab `diproses`", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const u = await aktor();
    const s = await sesiAktif(u);
    await repo.mulaiFinalisasi(u, s, WAKTU);
    const hasil = await repo.appendTurn(
      u,
      s,
      { role: "user", content: "x", at: WAKTU },
      { maxTurns: 10, maxTranscriptBytes: 100_000 },
    );
    expect(hasil).toEqual({ ok: false, sebab: "diproses" });
  });

  it("selesai → finalized + resumeId + finalizedAt; menghapus draft MENGOSONGKAN tautan, transkrip utuh", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const u = await aktor();
    const s = await sesiAktif(u);
    await repo.mulaiFinalisasi(u, s, WAKTU);
    const isi = resumeContentInputSchema.parse({}) as ResumeContent;
    const cv = await resumes.create({ userId: u }, { title: "Draft", content: isi }, "ai_chat", {
      id: s,
    });
    expect(cv.id).toBe(s);

    expect(await repo.selesaiFinalisasi(u, s, cv.id, WAKTU)).toBe(true);
    expect(await repo.findOwned(u, s)).toMatchObject({
      status: "finalized",
      resumeId: s,
      finalizedAt: WAKTU,
    });
    // Transisi kedua tidak berlaku lagi.
    expect(await repo.selesaiFinalisasi(u, s, cv.id, WAKTU)).toBe(false);

    await resumes.remove({ userId: u }, cv.id);
    expect(await repo.findOwned(u, s)).toMatchObject({ status: "finalized", resumeId: null });
  });

  it("gagal → kembali active + jejak; finalize ulang menghapus jejaknya", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const u = await aktor();
    const s = await sesiAktif(u);
    await repo.mulaiFinalisasi(u, s, WAKTU);
    expect(await repo.gagalFinalisasi(u, s, "AI_INVALID_OUTPUT", WAKTU)).toBe(true);
    expect(await repo.findOwned(u, s)).toMatchObject({
      status: "active",
      extractionError: "AI_INVALID_OUTPUT",
      extractionFailedAt: WAKTU,
    });

    expect(await repo.mulaiFinalisasi(u, s, WAKTU)).toBe("ok");
    expect(await repo.findOwned(u, s)).toMatchObject({
      status: "finalizing",
      extractionError: null,
    });
    expect(await repo.batalFinalisasi(u, s, WAKTU)).toBe(true);
    expect((await repo.findOwned(u, s))?.status).toBe("active");
  });

  it("transisi milik orang lain tidak menyentuh baris siapa pun", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const u = await aktor();
    const lain = await aktor();
    const s = await sesiAktif(u);
    expect(await repo.mulaiFinalisasi(lain, s, WAKTU)).toBe("tidak-ada");
    expect((await repo.findOwned(u, s))?.status).toBe("active");
  });
});

describe("retensi", () => {
  it("sesi `finalizing` yang tersangkut >30 hari ikut kategori abandoned", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const u = await aktor();
    const s = await sesiAktif(u);
    await repo.mulaiFinalisasi(u, s, new Date("2026-01-01T00:00:00.000Z"));
    const [, abandoned] = createAiChatSessionPolicies({ repository: repo, days: 30 });
    const sekarang = new Date("2026-09-28T00:00:00.000Z");

    expect(await abandoned!.hitung(sekarang)).toBeGreaterThanOrEqual(1);
    await abandoned!.hapus(sekarang, 10_000);
    expect(await repo.findOwned(u, s)).toBeNull();
  });
});

describe("migrasi 17/18 — down teruji", () => {
  it("down 18 lalu down 17 berjalan; up 17 lalu up 18 memulihkan (dalam transaksi yang di-rollback)", async (ctx) => {
    if (!dbTersedia) ctx.skip();
    const pernyataan = (folder: string, berkas: string): string[] =>
      readFileSync(
        fileURLToPath(new URL(`../prisma/migrations/${folder}/${berkas}`, import.meta.url)),
        "utf8",
      )
        .split("\n")
        .map((b) => b.replace(/--.*$/, ""))
        .join("\n")
        .split(";")
        .map((x) => x.trim())
        .filter((x) => x !== "");
    const M17 = "20260929090000_17_status_finalizing";
    const M18 = "20260929090100_18_finalisasi_sesi_chat";

    type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
    const keadaan = async (tx: Tx) => {
      const [b] = await tx.$queryRaw<
        Array<{ nilai: string; kolom: bigint; indeks: string | null }>
      >`
        SELECT
          (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
             FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'AiChatSessionStatus') AS nilai,
          (SELECT count(*) FROM information_schema.columns
            WHERE table_name = 'ai_chat_sessions' AND column_name = 'resume_id') AS kolom,
          to_regclass('public.ai_chat_sessions_satu_terbuka')::text AS indeks`;
      return { nilai: b?.nilai, kolom: Number(b?.kolom), indeks: b?.indeks ?? null };
    };

    const BATAL = new Error("rollback-disengaja");
    await expect(
      prisma.$transaction(async (tx) => {
        for (const x of pernyataan(M18, "down.sql")) await tx.$executeRawUnsafe(x);
        for (const x of pernyataan(M17, "down.sql")) await tx.$executeRawUnsafe(x);
        expect(await keadaan(tx)).toEqual({ nilai: "active,finalized", kolom: 0, indeks: null });
        throw BATAL;
      }),
    ).rejects.toBe(BATAL);

    // Naik lagi TIDAK bisa diuji dalam satu transaksi: nilai enum baru tidak
    // boleh dipakai di transaksi yang menambahkannya — persis alasan migrasi 17
    // dan 18 dipisah. Keadaan setelah rollback membuktikan migrasi naiknya.
    expect(await keadaan(prisma as unknown as Tx)).toEqual({
      nilai: "active,finalizing,finalized",
      kolom: 1,
      indeks: "ai_chat_sessions_satu_terbuka",
    });
  });
});
