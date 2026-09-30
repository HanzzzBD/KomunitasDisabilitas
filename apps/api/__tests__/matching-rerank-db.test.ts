// Integration re-rank + cache `match_scores` (PR-072) — PostgreSQL nyata.
// Skip anggun bila DB tidak terjangkau.
//
// Membuktikan yang tidak bisa dibuktikan repo memori:
//   - angkatan diganti atomik; `rank` NULL terurut terakhir (kolom migrasi 19);
//   - hasil re-rank yang BASI (angkatan sudah diganti) tidak menulis apa pun;
//   - constraint `rank >= 1` hidup di DB;
//   - jalur worker ujung ke ujung dengan pembaca lowongan modul jobs yang asli:
//     lowongan yang sudah ditutup tidak dikirim ke LLM, dan jawaban model yang
//     menyebut ref di luar daftar tidak menambah baris.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import type { AiClient, RerankInput } from "../src/core/ai/index.js";
import { createJobsRepository, createJobsService } from "../src/modules/jobs/index.js";
import { createMatchScoresRepository, createRerankService } from "../src/modules/matching/index.js";
import { busUji } from "./helpers/events.js";

const prisma = new PrismaClient();
const app = prisma as unknown as AppPrisma;
let dbTersedia = false;

const repo = createMatchScoresRepository(app);
const jobsService = createJobsService({
  jobsRepository: createJobsRepository(app),
  auditLog: () => undefined,
  events: busUji(),
});

const user = uuidV7();
const perusahaan = uuidV7();
const J = Array.from({ length: 4 }, () => uuidV7());
const [J1, J2, J3, J4] = J as [string, string, string, string];

const T1 = new Date("2026-09-30T01:00:00.000Z");
const T2 = new Date("2026-09-30T02:00:00.000Z");

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test re-rank dilewati.");
    return;
  }
  await prisma.user.create({
    data: { id: user, phone: "+628690720000001", fullName: "Uji PR-072" },
  });
  await prisma.seekerProfile.create({
    data: { userId: user, headline: "Admin data", province: "Jawa Barat", openToRemote: true },
  });
  await prisma.company.create({ data: { id: perusahaan, name: "PT Uji PR-072" } });
  for (const [i, id] of J.entries()) {
    await prisma.job.create({
      data: {
        id,
        companyId: perusahaan,
        title: `Lowongan uji ${String(i + 1)}`,
        description: "Mengelola data pelanggan.",
        employmentType: "full_time",
        workMode: "remote",
        accommodations: ["jam_kerja_fleksibel"],
        welcomedDisabilityTypes: ["tuli"],
        // J4 sudah ditutup — tidak boleh sampai ke LLM.
        status: id === J4 ? "closed" : "published",
        publishedAt: T1,
      },
    });
  }
});

afterAll(async () => {
  if (dbTersedia) {
    await prisma.matchScore.deleteMany({ where: { userId: user } });
    await prisma.job.deleteMany({ where: { companyId: perusahaan } });
    await prisma.company.deleteMany({ where: { id: perusahaan } });
    await prisma.user.deleteMany({ where: { id: user } });
  }
  await prisma.$disconnect();
});

const skor = (pasangan: Array<[string, number]>) =>
  pasangan.map(([jobId, s]) => ({ jobId, skor: s }));

describe("match-scores.repository — angkatan", () => {
  it("gantiAngkatan mengganti seluruh baris; angkatanTerbaru membaca computed_at", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await repo.gantiAngkatan(
      user,
      skor([
        [J1, 0.5],
        [J2, 0.9],
      ]),
      T1,
    );
    await repo.gantiAngkatan(
      user,
      skor([
        [J1, 0.4],
        [J2, 0.8],
        [J3, 0.6],
      ]),
      T2,
    );
    expect(await repo.angkatanTerbaru(user)).toEqual({
      computedAt: T2,
      jumlah: 3,
      sudahRerank: false,
    });
    expect(await repo.topAngkatan(user, T1, 20)).toEqual([]);
    expect(await repo.topAngkatan(user, T2, 2)).toEqual(
      skor([
        [J2, 0.8],
        [J3, 0.6],
      ]),
    );
  });

  it("terapkanRerank: rank menang atas skor, NULL terakhir; angkatan basi tidak menulis", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await repo.gantiAngkatan(
      user,
      skor([
        [J1, 0.4],
        [J2, 0.8],
        [J3, 0.6],
      ]),
      T2,
    );

    const basi = await repo.terapkanRerank(user, T1, [
      { jobId: J1, rank: 1, explanation: "Basi." },
    ]);
    expect(basi).toBe(0);

    const n = await repo.terapkanRerank(user, T2, [
      { jobId: J1, rank: 1, explanation: "Cocok karena remote." },
      { jobId: J3, rank: 2, explanation: null },
    ]);
    expect(n).toBe(2);
    const feed = await repo.bacaFeed(user);
    expect(feed.map((b) => [b.jobId, b.rank, b.score])).toEqual([
      [J1, 1, 0.4],
      [J3, 2, 0.6],
      [J2, null, 0.8],
    ]);
    expect(feed[0]?.explanation).toBe("Cocok karena remote.");
    expect((await repo.angkatanTerbaru(user))?.sudahRerank).toBe(true);
  });

  it("constraint DB menolak rank < 1", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await expect(
      prisma.matchScore.updateMany({ where: { userId: user }, data: { rank: 0 } }),
    ).rejects.toThrow(/match_scores_rank_positif/);
  });
});

describe("rerank worker — pembaca lowongan asli", () => {
  it("lowongan tutup tidak dikirim; ref titipan tidak menambah baris; jatah tidak dipotong ulang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await repo.gantiAngkatan(
      user,
      skor([
        [J1, 0.7],
        [J2, 0.9],
        [J3, 0.8],
        [J4, 0.95],
      ]),
      T2,
    );

    const dikirim: RerankInput[] = [];
    const prompt = vi.fn((_ctx: unknown, _t: unknown, input: RerankInput) => {
      dikirim.push(input);
      return Promise.resolve({
        data: {
          urutan: [
            { ref: 9, alasan: "Titipan" },
            { ref: 3, alasan: "Cocok karena Anda terbuka kerja jarak jauh" },
          ],
        },
        dariCache: false,
      });
    });
    const kembalikan = vi.fn(() => Promise.resolve());
    const rerank = createRerankService({
      repo,
      ai: { prompt } as unknown as Pick<AiClient, "prompt">,
      quota: { kembalikan, kembalikanBila: kembalikan },
      bacaProfil: () =>
        Promise.resolve({
          headline: "Admin data",
          city: null,
          province: "Jawa Barat",
          openToRemote: true,
          keahlian: [{ name: "Excel" }],
          pengalaman: [],
        }),
      bacaLowongan: (ids) => jobsService.bacaUntukRerank(ids),
      logger: { warn: vi.fn() },
    });

    const hasil = await rerank.jalankan(
      {
        userId: user,
        computedAt: T2.toISOString(),
        reservasi: {
          hari: "2026-09-30",
          userId: user,
          feature: "rerank",
          tercatat: true,
          global: true,
        },
      },
      { percobaanTerakhir: true },
    );
    expect(hasil).toEqual({ status: "selesai", diperbarui: 3, berpenjelasan: 1 });
    expect(kembalikan).not.toHaveBeenCalled();

    // Hanya 3 lowongan aktif, urutan skor: J2 (0,9), J3 (0,8), J1 (0,7).
    expect(dikirim[0]?.lowongan).toHaveLength(3);
    const teksPrompt = JSON.stringify(dikirim[0]);
    expect(teksPrompt).not.toMatch(/tuli|welcomed/i);

    const feed = await repo.bacaFeed(user);
    expect(feed).toHaveLength(4);
    expect(feed.map((b) => [b.jobId, b.rank])).toEqual([
      [J1, 1], // ref 3 = J1
      [J2, 2],
      [J3, 3],
      [J4, null], // ditutup — tidak di-rerank, tetap di cache sampai invalidasi
    ]);
    expect(feed[0]?.explanation).toBe("Cocok karena Anda terbuka kerja jarak jauh.");
  });
});
