// Integration query kandidat (PR-070) — PostgreSQL + pgvector NYATA, 1.000+ lowongan.
// Skip anggun bila DB tidak terjangkau; CI selalu punya service Postgres pgvector.
//
// Setiap AC PR-070 adalah pertanyaan yang HANYA bisa dijawab planner dan indeks
// sungguhan: apakah HNSW dipakai, apakah filter berlaku di SQL, berapa lama, dan
// apakah parameter benar-benar parameter. DB dev berbagi data seed, jadi yang
// diperiksa adalah keanggotaan id milik berkas ini, bukan hasil utuh.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import {
  JUMLAH_KANDIDAT,
  createKandidatRepository,
  createKandidatService,
  kondisiKandidat,
  sqlKandidat,
  susunFilterKandidat,
  type FilterKandidat,
} from "../src/modules/matching/index.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();
const repo = createKandidatRepository(prisma);
const OPSI = { batas: JUMLAH_KANDIDAT, efSearch: 100 };
let dbTersedia = false;

const TANDA = "Uji PR-070";
const DIM = 768;
const perusahaan = uuidV7();
const kurator = uuidV7();
const user = { jabar: uuidV7(), tanpaVektor: uuidV7() };

/** RNG deterministik — hasil test tidak bergantung keberuntungan. */
function acak(benih: number): () => number {
  let s = benih >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}
const rng = acak(70);
function normal(v: number[]): number[] {
  const p = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return v.map((x) => x / p);
}
const ARAH = normal(Array.from({ length: DIM }, rng));
/** Vektor dekat ARAH (derau kecil) atau acak (jauh). */
const dekat = (derau = 0.05) => normal(ARAH.map((x) => x + derau * rng()));
const jauh = () => normal(Array.from({ length: DIM }, rng));
const lit = (v: number[]) => `[${v.join(",")}]`;

interface JobUji {
  id: string;
  workMode: "onsite" | "hybrid" | "remote";
  province: string | null;
  status?: "draft" | "published" | "closed";
  expiresAt?: Date;
  vektor: number[];
}
const jobs: JobUji[] = [];
function tambah(j: Omit<JobUji, "id">): string {
  const id = uuidV7();
  jobs.push({ id, ...j });
  return id;
}

// Kasus bernama — semuanya SANGAT dekat dengan pengguna, jadi bila lolos filter
// mereka pasti masuk top-50.
const k = {
  remoteLuar: tambah({ workMode: "remote", province: "Papua", vektor: dekat(0.01) }),
  onsiteSama: tambah({ workMode: "onsite", province: "Jawa Barat", vektor: dekat(0.01) }),
  hybridSamaBedaHuruf: tambah({
    workMode: "hybrid",
    province: "  jawa BARAT ",
    vektor: dekat(0.01),
  }),
  onsiteTanpaProvinsi: tambah({ workMode: "onsite", province: null, vektor: dekat(0.01) }),
  onsiteLuar: tambah({ workMode: "onsite", province: "Jawa Timur", vektor: dekat(0.01) }),
  hybridLuar: tambah({ workMode: "hybrid", province: "Bali", vektor: dekat(0.01) }),
  draft: tambah({ workMode: "remote", province: null, status: "draft", vektor: dekat(0.01) }),
  closed: tambah({ workMode: "remote", province: null, status: "closed", vektor: dekat(0.01) }),
  lewat: tambah({
    workMode: "remote",
    province: null,
    expiresAt: new Date("2026-01-01T00:00:00Z"),
    vektor: dekat(0.01),
  }),
};
// Penghalang iterative scan: 200 lowongan onsite PALING dekat tapi di provinsi
// lain — tanpa pemindaian iteratif, ef_search=100 tetangga pertama habis
// tersaring dan feed kosong.
const penghalang = Array.from({ length: 200 }, () =>
  tambah({ workMode: "onsite", province: "Jawa Tengah", vektor: dekat(0.001) }),
);
// Pengisi sampai > 1.000 lowongan (AC p95).
for (let i = 0; i < 850; i += 1) {
  const mode = (["onsite", "hybrid", "remote"] as const)[i % 3]!;
  tambah({
    workMode: mode,
    province: i % 2 === 0 ? "Jawa Barat" : "Sumatera Utara",
    vektor: jauh(),
  });
}

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test kandidat dilewati.");
    return;
  }
  await mentah.user.createMany({
    data: [
      { id: kurator, phone: "+628690700000001", fullName: `${TANDA} kurator`, role: "admin" },
      { id: user.jabar, phone: "+628690700000002", fullName: `${TANDA} jabar` },
      { id: user.tanpaVektor, phone: "+628690700000003", fullName: `${TANDA} tanpa vektor` },
    ],
  });
  await mentah.seekerProfile.createMany({
    data: [
      { userId: user.jabar, province: "Jawa Barat" },
      { userId: user.tanpaVektor, province: "Jawa Barat" },
    ],
  });
  await mentah.$executeRaw`UPDATE seeker_profiles SET profile_embedding = ${lit(ARAH)}::vector WHERE user_id = ${user.jabar}::uuid`;
  await mentah.company.create({ data: { id: perusahaan, name: `${TANDA} PT` } });

  for (let i = 0; i < jobs.length; i += 100) {
    const nilai = jobs.slice(i, i + 100).map(
      (j) => Prisma.sql`(${j.id}::uuid, ${perusahaan}::uuid, ${`${TANDA} ${j.workMode}`}, 'x',
        'full_time'::"EmploymentType", ${j.workMode}::"WorkMode", ${j.province},
        ${j.status ?? "published"}::"JobStatus", now() - interval '1 day', ${j.expiresAt ?? null},
        ${kurator}::uuid, ${lit(j.vektor)}::vector, now())`,
    );
    await mentah.$executeRaw`
      INSERT INTO jobs (id, company_id, title, description, employment_type, work_mode, province,
                        status, published_at, expires_at, created_by, job_embedding, updated_at)
      VALUES ${Prisma.join(nilai)}`;
  }
  await mentah.$executeRaw`ANALYZE jobs`;
}, 120_000);

afterAll(async () => {
  if (dbTersedia) {
    await mentah.job.deleteMany({ where: { companyId: perusahaan } });
    await mentah.company.deleteMany({ where: { id: perusahaan } });
    await mentah.user.deleteMany({
      where: { id: { in: [kurator, user.jabar, user.tanpaVektor] } },
    });
  }
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

const FILTER_JABAR = susunFilterKandidat({ province: "Jawa Barat" });

describe("cariKandidat — hard filter di SQL", () => {
  it("AC: hanya published & belum expired; lokasi = provinsi sama ATAU remote ATAU tanpa provinsi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const hasil = await repo.cariKandidat(user.jabar, FILTER_JABAR, OPSI);
    const ids = new Set(hasil?.map((h) => h.jobId));

    for (const lolos of [
      k.remoteLuar,
      k.onsiteSama,
      k.hybridSamaBedaHuruf,
      k.onsiteTanpaProvinsi,
    ]) {
      expect(ids.has(lolos)).toBe(true);
    }
    for (const tersaring of [k.onsiteLuar, k.hybridLuar, k.draft, k.closed, k.lewat]) {
      expect(ids.has(tersaring)).toBe(false);
    }
  });

  it("AC: pengguna tanpa provinsi → tanpa filter lokasi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const hasil = await repo.cariKandidat(
      user.jabar,
      susunFilterKandidat({ province: null }),
      OPSI,
    );
    const ids = new Set(hasil?.map((h) => h.jobId));
    // Tanpa filter lokasi, 200 lowongan onsite Jawa Tengah (paling dekat) justru
    // memenuhi kandidat — bukti filter lokasi benar-benar tidak dipasang.
    expect(penghalang.some((id) => ids.has(id))).toBe(true);
    expect(ids.has(k.draft)).toBe(false);
  });

  it("filter mode kerja ber-parameter: hanya remote → tidak ada onsite/hybrid", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const hanyaRemote: FilterKandidat = {
      modeDiizinkan: ["remote"],
      modeBebasLokasi: ["remote"],
      provinsi: null,
    };
    const hasil = (await repo.cariKandidat(user.jabar, hanyaRemote, OPSI)) ?? [];
    expect(hasil.length).toBeGreaterThan(0);
    expect(hasil.every((h) => h.workMode === "remote")).toBe(true);
  });

  it("top-50 PENUH walau 200 tetangga terdekat tersaring (iterative scan), terurut kemiripan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const hasil = (await repo.cariKandidat(user.jabar, FILTER_JABAR, OPSI)) ?? [];
    expect(hasil).toHaveLength(JUMLAH_KANDIDAT);
    const terhalang = new Set(penghalang);
    expect(hasil.some((h) => terhalang.has(h.jobId))).toBe(false);
    for (let i = 1; i < hasil.length; i += 1) {
      expect(hasil[i - 1]!.kemiripan).toBeGreaterThanOrEqual(hasil[i]!.kemiripan);
    }
  });

  it("pengguna tanpa vektor → null (PR-073 yang memilih jalur pengganti)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    expect(await repo.cariKandidat(user.tanpaVektor, FILTER_JABAR, OPSI)).toBeNull();
    expect(await repo.cariKandidat(uuidV7(), FILTER_JABAR, OPSI)).toBeNull();
  });
});

describe("cariKandidat — keamanan: parameter, bukan string", () => {
  it("AC: percobaan injeksi lewat provinsi GAGAL — tidak melonggarkan filter, tidak merusak tabel", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    for (const jahat of ["x' OR '1'='1", "Jawa Barat') OR TRUE --", "'; DROP TABLE jobs; --"]) {
      const hasil =
        (await repo.cariKandidat(user.jabar, { ...FILTER_JABAR, provinsi: jahat }, OPSI)) ?? [];
      const ids = new Set(hasil.map((h) => h.jobId));
      // Tidak melonggarkan: lowongan onsite provinsi lain tetap tersaring.
      expect(ids.has(k.onsiteLuar)).toBe(false);
      expect(ids.has(k.onsiteSama)).toBe(false); // provinsinya memang tidak cocok
    }
    expect(await mentah.job.count({ where: { companyId: perusahaan } })).toBe(jobs.length);
  });

  it("mode kerja di luar enum ditolak SEBELUM menyentuh SQL", () => {
    expect(() =>
      kondisiKandidat({
        modeDiizinkan: [`remote'::"WorkMode") OR TRUE --` as never],
        modeBebasLokasi: [],
        provinsi: null,
      }),
    ).toThrow();
    expect(() =>
      kondisiKandidat({ modeDiizinkan: [], modeBebasLokasi: [], provinsi: null }),
    ).toThrow();
  });
});

describe("cariKandidat — kinerja & indeks", () => {
  // Keputusan owner 2026-09-30: planner BEBAS memilih di produksi. Pada ±1.000
  // lowongan ia memilih Seq Scan + Sort (eksak, lebih murah); pada 10.000 ia
  // memilih HNSW sendiri (diukur manual, log PR-070). Yang dijaga test ini
  // adalah regresi yang sungguh berbahaya: bentuk query + filter yang membuat
  // indeks TIDAK BISA dipakai (operator/ekspresi yang tak cocok opclass
  // `vector_cosine_ops`) — katalog besar kelak diam-diam jatuh ke seq scan.
  // Karena itu SORT dipenalti DI TRANSAKSI TEST SAJA (`enable_sort=off`): satu-
  // satunya jalan lain untuk menghasilkan urutan jarak adalah indeks HNSW, jadi
  // bila indeks masih tidak dipakai, bentuk query-nya yang salah. (Mematikan
  // seq scan saja tidak cukup — planner beralih ke indeks status + Sort.)
  it("AC: EXPLAIN memakai indeks HNSW jobs_embedding_hnsw (indeks dapat dipakai bentuk query ini)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const rencana = await mentah.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('hnsw.ef_search', '100', true),
                                set_config('hnsw.iterative_scan', 'relaxed_order', true),
                                set_config('enable_sort', 'off', true)`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
        EXPLAIN ${sqlKandidat(user.jabar, kondisiKandidat(FILTER_JABAR), JUMLAH_KANDIDAT)}`;
    });
    const teks = rencana.map((r) => r["QUERY PLAN"]).join("\n");
    // eslint-disable-next-line no-console -- bukti EXPLAIN untuk log PR
    console.log(`EXPLAIN kandidat PR-070:\n${teks}`);
    expect(teks).toContain("jobs_embedding_hnsw");
  });

  it(`AC: p95 < 100 ms pada ${jobs.length} lowongan uji`, async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const service = createKandidatService({
      repo,
      bacaProfil: () => Promise.resolve({ province: "Jawa Barat" }),
      efSearch: 100,
    });
    for (let i = 0; i < 5; i += 1) await service.cari(user.jabar); // pemanasan

    const durasi: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const mulai = performance.now();
      await service.cari(user.jabar);
      durasi.push(performance.now() - mulai);
    }
    durasi.sort((a, b) => a - b);
    const p95 = durasi[Math.ceil(durasi.length * 0.95) - 1]!;
    // eslint-disable-next-line no-console -- bukti kinerja untuk log PR
    console.log(`p95 kandidat PR-070: ${p95.toFixed(1)} ms (median ${durasi[20]!.toFixed(1)} ms)`);
    expect(p95).toBeLessThan(100);
  });
});
