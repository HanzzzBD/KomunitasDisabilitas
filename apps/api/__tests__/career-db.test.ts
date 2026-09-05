// Integration DB sub-entitas karier (PR-038) — PostgreSQL sungguhan.
//
// KENAPA FILE INI ADA DI SAMPING career-http.test.ts. Yang di sana memakai tabel
// palsu di memori, jadi ia membuktikan alur endpoint tetapi TIDAK bisa
// membuktikan tiga hal yang justru menjadi Acceptance Criteria PR ini:
//
//   AC-4 urutan bawaan "terbaru dulu" — yang menjalankannya `ORDER BY` milik
//        PostgreSQL, termasuk `NULLS LAST` yang tidak punya padanan di fake.
//   AC-5 cascade delete saat akun dihapus — yang menjalankannya FK
//        `ON DELETE CASCADE`, bukan satu baris kode pun di repo ini.
//   Kolom `@db.Date` benar-benar menyimpan tanggal tanpa jam, dan bacaan
//        baliknya tidak bergeser sehari karena zona waktu server.
//
// Pola skip anggun sama dengan profiles-db.test.ts (PR-037): tanpa DB, file ini
// dilewati; CI selalu punya service Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import {
  createEducationRepository,
  createExperienceRepository,
  createSkillRepository,
} from "../src/modules/profiles/repositories/career.repository.js";
import {
  createEducationsService,
  createExperiencesService,
  createSkillsService,
} from "../src/modules/profiles/services/career.service.js";
import type { ProfilesActor } from "../src/modules/profiles/services/profiles.service.js";
import { AppError } from "../src/core/http/index.js";
import { busUji } from "./helpers/events.js";

const prisma = new PrismaClient();
let dbTersedia = false;

const deps = { events: busUji() };
const experiences = createExperiencesService(
  createExperienceRepository(prisma as unknown as AppPrisma),
  deps,
);
const educations = createEducationsService(
  createEducationRepository(prisma as unknown as AppPrisma),
  deps,
);
const skills = createSkillsService(createSkillRepository(prisma as unknown as AppPrisma), deps);

/** Nomor uji berprefiks khusus supaya pembersihan tidak menyentuh data lain. */
const PREFIX_UJI = "+62889";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test karier dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    const usersUji = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX_UJI } } });
    for (const u of usersUji) {
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
  await prisma.$disconnect();
});

let urutan = 0;

async function buatAktor(): Promise<ProfilesActor> {
  urutan += 1;
  const user = await prisma.user.create({
    data: {
      id: uuidV7(),
      phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`,
      fullName: "Uji Karier",
    },
  });
  return { userId: user.id, requestId: uuidV7() };
}

describe("urutan bawaan (AC-4) — terbaru dulu", () => {
  it("riwayat kerja: tanggal mulai turun, yang tanpa tanggal di paling bawah", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();
    await experiences.create(aktor, {
      title: "Paling lama",
      company: null,
      startDate: "2015-03-01",
      endDate: "2018-01-01",
      description: null,
    });
    await experiences.create(aktor, {
      title: "Tanpa tanggal",
      company: null,
      startDate: null,
      endDate: null,
      description: null,
    });
    await experiences.create(aktor, {
      title: "Paling baru",
      company: null,
      startDate: "2023-06-01",
      endDate: null,
      description: null,
    });

    const daftar = await experiences.list(aktor);

    // Yang tanpa tanggal BUKAN yang paling baru — ia yang paling belum
    // lengkap. Menaruhnya di puncak berarti CV seseorang dibuka oleh baris
    // yang paling sedikit ia isi.
    expect(daftar.map((e) => e.title)).toEqual(["Paling baru", "Paling lama", "Tanpa tanggal"]);
  });

  it("pendidikan: tahun turun, yang tanpa tahun di paling bawah", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();
    await educations.create(aktor, {
      institution: "SMA",
      degree: null,
      field: null,
      year: 2012,
    });
    await educations.create(aktor, {
      institution: "Kursus",
      degree: null,
      field: null,
      year: null,
    });
    await educations.create(aktor, {
      institution: "Universitas",
      degree: null,
      field: null,
      year: 2016,
    });

    const daftar = await educations.list(aktor);

    expect(daftar.map((e) => e.institution)).toEqual(["Universitas", "SMA", "Kursus"]);
  });

  it("keahlian: yang terakhir ditambahkan tampil lebih dulu", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Tanpa kolom tanggal, urutannya bersandar pada UUID v7 yang memuat waktu
    // pembuatan di 48 bit pertama (SDD §14). Test ini adalah yang akan merah
    // bila suatu saat id berganti menjadi v4.
    const aktor = await buatAktor();
    for (const name of ["Pertama", "Kedua", "Ketiga"]) {
      await skills.create(aktor, { name, level: null });
    }

    const daftar = await skills.list(aktor);

    expect(daftar.map((s) => s.name)).toEqual(["Ketiga", "Kedua", "Pertama"]);
  });

  it("keahlian: urut benar MESKI seluruh id lahir di milidetik yang sama", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Regresi migrasi 11 (2026-09-05). Test di atas bergantung pada kecepatan
    // mesin: di CI (Linux) tiga insert kerap jatuh di satu milidetik dan
    // membuatnya merah secara acak; di mesin pengembang yang lebih lambat ia
    // nyaris tidak pernah gagal — jadi ia BUKAN penjaga yang bisa dipercaya.
    //
    // Di sini kondisinya DIPAKSA: seluruh id dirakit dari stempel milidetik
    // yang SAMA, sehingga 74 bit acak sisanyalah satu-satunya pembeda `id`.
    // Dengan enam baris, peluang `id desc` kebetulan menghasilkan urutan yang
    // benar adalah 1/720 — praktis nol. Lulusnya test ini karena itu hanya bisa
    // berarti satu hal: yang mengurutkan adalah `created_at`, bukan `id`.
    const aktor = await buatAktor();
    const MS = Date.UTC(2026, 8, 5, 3, 0, 0);
    const nama = ["Satu", "Dua", "Tiga", "Empat", "Lima", "Enam"];

    for (const name of nama) {
      // Insert terpisah dengan sengaja: `now()` adalah waktu MULAI TRANSAKSI,
      // jadi merakit keenamnya dalam satu transaksi justru membuat `created_at`
      // identik dan mengembalikan persoalan yang sama.
      await prisma.skill.create({
        data: { id: uuidV7(MS), userId: aktor.userId, name, level: null },
      });
    }

    const daftar = await skills.list(aktor);

    expect(daftar.map((s) => s.name)).toEqual([...nama].reverse());

    // STEMPELNYA DIBUAT DATABASE, BUKAN KLIEN — dan itulah yang diuji di sini,
    // bukan sekadar "nilainya berbeda".
    //
    // Migrasi 11 mengira `timestamptz(6)` sudah cukup. Tidak: untuk
    // `@default(now())` Prisma membuat nilainya DI SISI KLIEN dan mengirimnya
    // sebagai parameter, dan `Date` di JavaScript berpresisi MILIDETIK. Enam
    // insert beruntun di CI yang cepat jatuh di milidetik yang sama, seri, lalu
    // urutannya diserahkan ke `id desc` yang justru acak dalam satu milidetik.
    // Test itu hijau di mesin lambat dan merah di CI — persis yang terjadi.
    //
    // MEMERIKSA "semua stempel berbeda" TIDAK CUKUP: di mesin pengembang yang
    // lambat, stempel klien pun berbeda 2-3 ms, sehingga pemeriksaan itu lulus
    // di atas kode yang salah — sudah dicoba, dan ia memang lulus. Yang
    // membedakan keduanya secara pasti adalah PRESISI: nilai dari JavaScript
    // SELALU kelipatan bulat 1000 mikrodetik; `clock_timestamp()` praktis tidak
    // pernah. Satu baris ber-sisa saja sudah membuktikan DB yang membuatnya.
    const presisi = await prisma.$queryRaw<{ sisa: number }[]>`
      SELECT (date_part('microseconds', created_at)::int % 1000) AS sisa
      FROM skills WHERE user_id = ${aktor.userId}::uuid
    `;
    expect(presisi).toHaveLength(nama.length);
    expect(
      presisi.some((b) => b.sisa !== 0),
      `Seluruh stempel bulat milidetik — tandanya dibuat KLIEN, bukan clock_timestamp(). ` +
        `Cek @default(dbgenerated("clock_timestamp()")) di schema.prisma.`,
    ).toBe(true);
    // Penjaga atas penjaga: bila kelak `uuidV7` menjadi monotonik dalam satu
    // milidetik, test ini berhenti menguji apa yang ia klaim — dan diam-diam
    // menjadi hijau karena alasan yang salah.
    const ids = daftar.map((s) => s.id);
    expect(new Set(ids.map((id) => id.slice(0, 13))).size).toBe(1);
  });
});

describe("cascade delete (AC-5)", () => {
  it("menghapus akun ikut menghapus ketiga sub-entitasnya", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();
    await experiences.create(aktor, {
      title: "Analis",
      company: null,
      startDate: null,
      endDate: null,
      description: null,
    });
    await educations.create(aktor, {
      institution: "UI",
      degree: null,
      field: null,
      year: null,
    });
    await skills.create(aktor, { name: "SQL", level: null });

    await prisma.user.delete({ where: { id: aktor.userId } });

    // Yang menghapusnya adalah FK `ON DELETE CASCADE` di migrasi 02, bukan kode
    // aplikasi. Tanpa test ini, penghapusan akun akan meninggalkan riwayat kerja
    // seseorang di database setelah ia meminta datanya hilang — pelanggaran PDP
    // yang tidak menimbulkan satu pun error.
    const where = { userId: aktor.userId };
    expect(await prisma.experience.count({ where })).toBe(0);
    expect(await prisma.education.count({ where })).toBe(0);
    expect(await prisma.skill.count({ where })).toBe(0);
  });
});

describe("kepemilikan terhadap DB sungguhan", () => {
  it("baris milik orang lain tidak bisa dibaca, diubah, atau dihapus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const a = await buatAktor();
    const b = await buatAktor();
    const milikB = await skills.create(b, { name: "Rahasia B", level: null });

    expect(await skills.list(a)).toEqual([]);
    await expect(skills.update(a, milikB.id, { name: "diambil alih" })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(skills.remove(a, milikB.id)).rejects.toBeInstanceOf(AppError);

    // Dan barisnya benar-benar utuh — bukan sekadar permintaannya yang ditolak.
    const sesudah = await skills.list(b);
    expect(sesudah).toEqual([milikB]);
  });
});

describe("kolom tanggal", () => {
  it("tanggal tersimpan tanpa jam dan terbaca kembali persis sama", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();

    const dibuat = await experiences.create(aktor, {
      title: "Analis",
      company: "PT Contoh",
      startDate: "2020-01-15",
      endDate: "2022-12-31",
      description: null,
    });

    expect(dibuat.startDate).toBe("2020-01-15");
    expect(dibuat.endDate).toBe("2022-12-31");

    // Dibaca ulang lewat query terpisah: yang di atas masih hasil `RETURNING`
    // dari statement yang sama, sedangkan yang di sini benar-benar melewati
    // penyimpanan dan pembacaan kolom `date`.
    const [dibaca] = await experiences.list(aktor);
    expect(dibaca).toMatchObject({ startDate: "2020-01-15", endDate: "2022-12-31" });
  });

  it("mengosongkan tanggal selesai berarti masih bekerja di sana", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();
    const dibuat = await experiences.create(aktor, {
      title: "Analis",
      company: null,
      startDate: "2020-01-15",
      endDate: "2022-12-31",
      description: null,
    });

    const diubah = await experiences.update(aktor, dibuat.id, { endDate: null });

    expect(diubah.endDate).toBeNull();
    // Field yang TIDAK disebut tidak ikut hilang — itulah yang membuat simpan
    // per bagian di PR-040 aman.
    expect(diubah.startDate).toBe("2020-01-15");
    expect(diubah.title).toBe("Analis");
  });
});
