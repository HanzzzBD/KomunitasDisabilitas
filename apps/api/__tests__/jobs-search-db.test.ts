// Integration DB pencarian lowongan (PR-056, ADR-018) — butuh PostgreSQL.
// Skip otomatis bila DB tidak terjangkau.
//
// Ditulis sebagai test DB, bukan unit test, karena LIMA hal yang HANYA
// PostgreSQL yang bisa menjawab (fake in-memory hanya akan menguji tiruan
// saya sendiri, pola sama `jobs-expiry-db.test.ts`/`notifications-db.test.ts`):
//
//   1. apakah FTS bahasa Indonesia benar-benar menemukan kata dalam
//      judul+deskripsi (AC tersirat "jalur temu-lowongan non-AI");
//   2. apakah trigram (`<%`, kemiripan KATA — lihat komentar repository
//      soal kenapa bukan `%`) benar-benar menoleransi typo ringan pada judul
//      (AC "Typo ringan tetap menemukan");
//   3. apakah containment `accommodations @>` benar-benar filter ⊇, bukan
//      irisan atau kesamaan persis (AC "Filter akomodasi: hasil ⊇ akomodasi
//      diminta");
//   4. apakah keyset (published_at, id) benar-benar stabil saat baris BARU
//      lahir di tengah penyusuran (AC "Cursor stabil di data berubah");
//   5. apakah keempat bentuk query di atas BENAR-BENAR memakai indeksnya
//      masing-masing (AC "EXPLAIN memakai indeks (bukti)"), dan apakah
//      baris ke-1000 tetap terjawab cepat (AC "p95 < 200 ms pada 1.000
//      jobs seed").
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { createJobsRepository, createJobsService } from "../src/modules/jobs/index.js";
import { busUji } from "./helpers/events.js";

const prisma = createPrismaClient();
const mentah = new PrismaClient();

const TANDA = "Uji PR-056";

let dbTersedia = false;
let companyId = "";

const repository = createJobsRepository(prisma);
const service = createJobsService({
  jobsRepository: repository,
  auditLog: () => {},
  events: busUji(),
});

beforeAll(async () => {
  try {
    await mentah.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test pencarian lowongan dilewati.");
    return;
  }
  companyId = uuidV7();
  await mentah.company.create({ data: { id: companyId, name: `${TANDA} PT` } });
});

async function bersihkan(): Promise<void> {
  if (!dbTersedia) return;
  await mentah.job.deleteMany({ where: { title: { startsWith: TANDA } } });
}

beforeEach(bersihkan);

afterAll(async () => {
  if (dbTersedia) {
    await bersihkan();
    await mentah.company.deleteMany({ where: { name: `${TANDA} PT` } });
  }
  await Promise.all([mentah.$disconnect(), prisma.$disconnect()]);
});

/**
 * Kota fiktif yang TIDAK MUNGKIN muncul di data seed manapun (`prisma/seed`,
 * fixture manual, dsb.) — dipakai sebagai filter isolasi di SETIAP pemanggilan
 * `service.search()` di berkas ini (kecuali kelompok yang sengaja menguji
 * filter kota itu sendiri, yang memakai nilai unik serupa per kasus).
 *
 * TANPA INI, test tanggal-published/akomodasi/dll akan bocor melihat lowongan
 * dari data seed dev DB yang sama (20 jobs sejak PR-001) — kegagalan yang
 * SANGAT TIDAK KENTARA karena assert `toEqual([...])` gagal dengan array yang
 * kelihatannya "hampir benar" (satu baris milik test + N baris seed).
 */
const ISOLASI = "KotaUjiPR056Isolasi8f3e";

interface OpsiLowongan {
  title: string;
  description?: string;
  city?: string | null;
  province?: string | null;
  workMode?: "onsite" | "hybrid" | "remote";
  accommodations?: string[];
  status?: "draft" | "published" | "closed";
  publishedAt?: Date | null;
  expiresAt?: Date | null;
}

async function buatLowongan(opsi: OpsiLowongan): Promise<string> {
  const id = uuidV7();
  await mentah.job.create({
    data: {
      id,
      companyId,
      title: `${TANDA} ${opsi.title}`,
      description: opsi.description ?? "Deskripsi uji",
      employmentType: "full_time",
      workMode: opsi.workMode ?? "onsite",
      city: opsi.city === undefined ? ISOLASI : opsi.city,
      province: opsi.province ?? null,
      accommodations: opsi.accommodations ?? [],
      welcomedDisabilityTypes: [],
      status: opsi.status ?? "published",
      publishedAt: opsi.publishedAt ?? new Date(),
      expiresAt: opsi.expiresAt ?? null,
    },
  });
  return id;
}

describe("pencarian FTS bahasa Indonesia (AC)", () => {
  it("menemukan kata di judul MAUPUN deskripsi", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Staf Gudang", description: "Mengelola inventaris pergudangan" });
    await buatLowongan({ title: "Staf Kasir", description: "Melayani transaksi pelanggan" });

    const hasil = await service.search({ limit: 20, city: ISOLASI, query: "inventaris" });

    expect(hasil.data.map((d) => d.title)).toEqual([`${TANDA} Staf Gudang`]);
  });

  it("query yang tidak cocok apa pun → halaman kosong, bukan error", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Staf Gudang" });

    const hasil = await service.search({ limit: 20, city: ISOLASI, query: "xyzzyabc123takadaduniawi" });

    expect(hasil.data).toEqual([]);
    expect(hasil.meta.nextCursor).toBeNull();
  });
});

describe("toleransi typo ringan via trigram (AC)", () => {
  it("typo satu huruf pada judul tetap ditemukan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Staf Layanan Pelanggan", description: "uji" });

    // "pelangan" — huruf "g" kedua hilang dari "pelanggan".
    const hasil = await service.search({ limit: 20, city: ISOLASI, query: "pelangan" });

    expect(hasil.data.map((d) => d.title)).toEqual([`${TANDA} Staf Layanan Pelanggan`]);
  });

  it("kata yang sama sekali tidak mirip TIDAK ditemukan (bukan typo, memang beda)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Staf Layanan Pelanggan", description: "uji" });

    const hasil = await service.search({ limit: 20, city: ISOLASI, query: "astronot" });

    expect(hasil.data).toEqual([]);
  });
});

describe("filter akomodasi ⊇ (AC)", () => {
  it("job dengan LEBIH BANYAK akomodasi dari yang diminta tetap cocok", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({
      title: "Punya Dua",
      accommodations: ["akses_kursi_roda", "juru_bahasa_isyarat"],
    });

    const hasil = await service.search({ limit: 20, city: ISOLASI, accommodations: ["akses_kursi_roda"] });

    expect(hasil.data.map((d) => d.title)).toEqual([`${TANDA} Punya Dua`]);
  });

  it("job yang HANYA punya sebagian dari yang diminta TIDAK cocok", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Punya Satu", accommodations: ["akses_kursi_roda"] });

    const hasil = await service.search({
      limit: 20,
      city: ISOLASI,
      accommodations: ["akses_kursi_roda", "juru_bahasa_isyarat"],
    });

    expect(hasil.data).toEqual([]);
  });

  it("job tanpa akomodasi TIDAK cocok filter akomodasi apa pun", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Tanpa Akomodasi", accommodations: [] });

    const hasil = await service.search({ limit: 20, city: ISOLASI, accommodations: ["akses_kursi_roda"] });

    expect(hasil.data).toEqual([]);
  });
});

describe("filter kota/provinsi/mode kerja & lingkup publik", () => {
  it("city dan workMode disaring persis (AND)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Nilai kota UNIK per kasus (bukan "Jakarta"/"Bandung" sungguhan) —
    // menghindari tabrakan dengan data seed dev DB yang mungkin memakainya.
    const KOTA_A = `${ISOLASI}A`;
    const KOTA_B = `${ISOLASI}B`;
    await buatLowongan({ title: "Kota A Remote", city: KOTA_A, workMode: "remote" });
    await buatLowongan({ title: "Kota A Onsite", city: KOTA_A, workMode: "onsite" });
    await buatLowongan({ title: "Kota B Remote", city: KOTA_B, workMode: "remote" });

    const hasil = await service.search({ limit: 20, city: KOTA_A, workMode: "remote" });

    expect(hasil.data.map((d) => d.title)).toEqual([`${TANDA} Kota A Remote`]);
  });

  it("hanya published & belum expiresAt yang muncul (draft/closed/kedaluwarsa tersaring)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Draft", status: "draft", publishedAt: null });
    await buatLowongan({ title: "Closed", status: "closed" });
    await buatLowongan({
      title: "Kedaluwarsa",
      expiresAt: new Date(Date.now() - 60_000),
    });
    await buatLowongan({ title: "Aktif" });

    const hasil = await service.search({ limit: 20, city: ISOLASI });

    expect(hasil.data.map((d) => d.title)).toEqual([`${TANDA} Aktif`]);
  });

  it("companyName ikut terisi dari JOIN companies", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Satu Baris" });

    const hasil = await service.search({ limit: 20, city: ISOLASI });

    expect(hasil.data[0]?.companyName).toBe(`${TANDA} PT`);
  });
});

describe("cursor pagination stabil di PostgreSQL (AC)", () => {
  it("menyusuri seluruh daftar tanpa terlewat maupun terulang", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const dasar = Date.now();
    for (let i = 0; i < 7; i += 1) {
      await buatLowongan({ title: `Urut ${i}`, publishedAt: new Date(dasar - i * 1000) });
    }

    const dilihat: string[] = [];
    let cursor: string | undefined;
    for (let putaran = 0; putaran < 7; putaran += 1) {
      const halaman = await service.search({ limit: 3, city: ISOLASI, cursor });
      dilihat.push(...halaman.data.map((d) => d.id));
      if (halaman.meta.nextCursor === null) break;
      cursor = halaman.meta.nextCursor;
    }

    expect(dilihat).toHaveLength(7);
    expect(new Set(dilihat).size).toBe(7);
  });

  it("baris BARU yang lahir di tengah penyusuran tidak menggeser halaman berikutnya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const dasar = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await buatLowongan({ title: `Awal ${i}`, publishedAt: new Date(dasar - i * 1000) });
    }

    const p1 = await service.search({ limit: 2, city: ISOLASI });
    // Penyusup terbit LEBIH BARU dari seluruh baris "Awal" — masuk ke puncak daftar.
    await buatLowongan({ title: "Penyusup", publishedAt: new Date(dasar + 60_000) });

    const p2 = await service.search({ limit: 2, city: ISOLASI, cursor: p1.meta.nextCursor as string });

    const tumpang = p2.data.filter((d) => p1.data.some((awal) => awal.id === d.id));
    expect(tumpang).toEqual([]);
  });

  it("baris dengan publishedAt IDENTIK tetap berurutan tetap (id sebagai penengah)", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const bersamaan = new Date();
    for (let i = 0; i < 3; i += 1) {
      await buatLowongan({ title: `Serentak ${i}`, publishedAt: bersamaan });
    }

    const p1 = await service.search({ limit: 2, city: ISOLASI });
    const p2 = await service.search({ limit: 2, city: ISOLASI, cursor: p1.meta.nextCursor as string });

    const tumpang = p2.data.filter((d) => p1.data.some((awal) => awal.id === d.id));
    expect(tumpang).toEqual([]);
    expect(p1.data).toHaveLength(2);
    expect(p2.data).toHaveLength(1);
  });
});

describe("cursor rusak (AC validasi input)", () => {
  it("cursor tidak terbaca ditolak sebagai error, bukan dianggap halaman pertama", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    await buatLowongan({ title: "Ada Satu" });

    await expect(service.search({ limit: 20, cursor: "***bukan-base64url-yang-sah***" })).rejects.toThrow();
  });
});

describe("EXPLAIN memakai indeks (AC — bukti)", () => {
  /**
   * Setiap predikat diuji SENDIRI-SENDIRI, TANPA `status = 'published'` yang
   * repository sesungguhnya selalu sertakan. Pada tabel sekecil test ini,
   * planner yang melihat `status = 'published'` DAN salah satu dari FTS/
   * trigram/containment akan memilih `jobs_status_published_at` (btree, satu
   * kolom kesetaraan — jauh lebih murah pada baris sedikit) dan menjadikan
   * predikat lain sekadar `Filter:` sesudahnya — BUKAN karena indeks GIN-nya
   * tidak terpakai, melainkan karena planner (secara sah) menganggap indeks
   * lain lebih murah di titik data test ini. Yang AC minta adalah bukti
   * BISA-tidaknya bentuk predikat ini memakai indeksnya sendiri — jadi setiap
   * predikat diisolasi di sini persis seperti isolasi query di
   * `notifications-db.test.ts` (partial index `notifications_unread`, yang di
   * sana pun satu-satunya kandidat di WHERE clause itu).
   *
   * `enable_seqscan = off` (pola sama `notifications-db.test.ts`/
   * `db-marketplace.test.ts`) menyingkirkan kandidat "scan semua baris" —
   * begitu itu hilang, satu-satunya indeks yang MENCAKUP predikat yang
   * tersisa adalah indeks GIN yang diuji.
   */
  async function explain(sql: TemplateStringsArray, ...params: unknown[]) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>(sql, ...params);
    });
  }

  it("FTS menyebut jobs_fts_gin", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const plan = await explain`
      EXPLAIN SELECT j."id" FROM "jobs" j
      WHERE to_tsvector('indonesian', coalesce(j."title", '') || ' ' || coalesce(j."description", ''))
        @@ plainto_tsquery('indonesian', 'pelanggan')
    `;
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("jobs_fts_gin");
  });

  it("trigram (<%) menyebut jobs_title_trgm", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const plan = await explain`
      EXPLAIN SELECT j."id" FROM "jobs" j
      WHERE 'pelangan' <% j."title"
    `;
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("jobs_title_trgm");
  });

  it("containment akomodasi menyebut jobs_accommodations_gin", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const plan = await explain`
      EXPLAIN SELECT j."id" FROM "jobs" j
      WHERE j."accommodations" @> '["akses_kursi_roda"]'::jsonb
    `;
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("jobs_accommodations_gin");
  });

  it("daftar tanpa filter query (ORDER BY published_at) menyebut jobs_status_published_at", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const plan = await explain`
      EXPLAIN SELECT j."id" FROM "jobs" j
      WHERE j."status" = 'published'
      ORDER BY j."published_at" DESC
    `;
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("jobs_status_published_at");
  });
});

describe("performa pada 1.000 lowongan seed (AC p95 < 200ms)", () => {
  const KOTA = ["Jakarta", "Bandung", "Surabaya", "Medan", "Makassar"];
  const MODE = ["onsite", "hybrid", "remote"] as const;
  const AKOMODASI = [
    "akses_kursi_roda",
    "ramah_screen_reader",
    "wawancara_via_teks",
    "jam_kerja_fleksibel",
    "ruang_kerja_tenang",
    "juru_bahasa_isyarat",
  ];

  beforeAll(async () => {
    if (!dbTersedia) return;
    const dasar = Date.now();
    const baris = Array.from({ length: 1000 }, (_, i) => ({
      id: uuidV7(),
      companyId,
      title: `${TANDA} Seed Posisi ${i} Layanan Pelanggan`,
      description: "Deskripsi seed untuk uji performa pencarian lowongan",
      employmentType: "full_time" as const,
      workMode: MODE[i % MODE.length]!,
      city: KOTA[i % KOTA.length]!,
      province: "Provinsi Uji",
      accommodations: [AKOMODASI[i % AKOMODASI.length]!],
      welcomedDisabilityTypes: [],
      status: "published" as const,
      publishedAt: new Date(dasar - i * 1000),
    }));
    await mentah.job.createMany({ data: baris });
  }, 60_000);

  it("p95 waktu tanggap search() di bawah 200ms", async (ctx) => {
    if (!dbTersedia) return ctx.skip();

    const skenario: Array<Parameters<typeof service.search>[0]> = [
      { limit: 20 },
      { limit: 20, query: "pelanggan" },
      { limit: 20, query: "pelangan" }, // typo
      { limit: 20, city: "Jakarta" },
      { limit: 20, workMode: "remote" },
      { limit: 20, accommodations: ["akses_kursi_roda"] },
      { limit: 20, city: "Bandung", workMode: "hybrid", query: "posisi" },
    ];

    const waktu: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const opsi = skenario[i % skenario.length]!;
      const mulai = performance.now();
      await service.search(opsi);
      waktu.push(performance.now() - mulai);
    }

    waktu.sort((a, b) => a - b);
    const p95 = waktu[Math.floor(waktu.length * 0.95)]!;

    // eslint-disable-next-line no-console -- bukti angka untuk deskripsi PR
    console.log(`jobs.search p95 (1000 seed, ${waktu.length} panggilan): ${p95.toFixed(1)}ms`);
    expect(p95).toBeLessThan(200);
  }, 30_000);
});
