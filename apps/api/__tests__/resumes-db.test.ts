// Integration DB CV (PR-060) — PostgreSQL sungguhan.
//
// KENAPA BERKAS INI ADA DI SAMPING resumes-http.test.ts. Yang di sana memakai
// tabel palsu di memori, jadi ia membuktikan alur endpoint tetapi TIDAK bisa
// membuktikan empat hal yang justru menjadi inti PR ini:
//
//   1. URUTAN BAWAAN daftar CV — yang menjalankannya `ORDER BY` milik
//      PostgreSQL, bukan satu baris kode pun di repo ini.
//   2. BATAS LIMA CV TAHAN KLIK GANDA — yang menjalankannya
//      `pg_advisory_xact_lock`, dan tabel palsu tidak mengunci apa pun. Ini
//      satu-satunya tempat AC "limit 5 ditegakkan" benar-benar teruji terhadap
//      permintaan yang tiba bersamaan.
//   3. JSONB BOLAK-BALIK UTUH — termasuk karakter non-latin dan emoji, yang akan
//      dipakai template PDF (PR-063).
//   4. FK `applications.resume_id` menolak penghapusan CV yang sedang dipakai,
//      sementara HAPUS AKUN tetap membersihkan semuanya lewat cascade dari
//      `users`. Keduanya milik database.
//
// Pola skip anggun sama dengan career-db.test.ts (PR-038): tanpa DB, berkas ini
// dilewati; CI selalu punya service Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resumeContentInputSchema } from "@nawasena/schemas";
import type { AppPrisma } from "../src/core/db/index.js";
import { uuidV7 } from "../src/core/ids/index.js";
import { AppError } from "../src/core/http/index.js";
import {
  createResumesRepository,
  createResumesService,
  CvDipakaiLamaranError,
} from "../src/modules/resumes/index.js";

const prisma = new PrismaClient();
let dbTersedia = false;

const repo = createResumesRepository(prisma as unknown as AppPrisma);
const service = (maksPerPengguna = 5) => createResumesService({ repo, maksPerPengguna });

/** Nomor uji berprefiks khusus supaya pembersihan tidak menyentuh data lain. */
const PREFIX_UJI = "+62887";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbTersedia = true;
  } catch {
    // eslint-disable-next-line no-console -- info skip untuk developer lokal
    console.warn("DB tidak terjangkau — integration test CV dilewati.");
  }
});

afterAll(async () => {
  if (dbTersedia) {
    const usersUji = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX_UJI } } });
    for (const u of usersUji) {
      // Lamaran tidak ikut cascade dari `resumes` (FK NoAction), tetapi ikut
      // cascade dari `users` — lihat test terakhir berkas ini.
      await prisma.user.delete({ where: { id: u.id } });
    }
  }
  await prisma.$disconnect();
});

let urutan = 0;

async function buatAktor(): Promise<{ userId: string }> {
  urutan += 1;
  const user = await prisma.user.create({
    data: {
      id: uuidV7(),
      phone: `${PREFIX_UJI}${String(urutan).padStart(6, "0")}`,
      fullName: "Uji CV",
    },
  });
  return { userId: user.id };
}

const isi = (patch: Record<string, unknown> = {}) => resumeContentInputSchema.parse(patch);

describe("urutan bawaan daftar CV", () => {
  it("yang terakhir DISUNTING lebih dulu, bukan yang terakhir dibuat", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();
    const svc = service();

    const pertama = await svc.create(aktor, { title: "CV Pertama", content: isi() });
    await svc.create(aktor, { title: "CV Kedua", content: isi() });
    // Kembali menyempurnakan CV pertama — kasus yang paling sering terjadi, dan
    // satu-satunya yang membedakan `updatedAt` dari `createdAt`.
    await svc.update(aktor, pertama.id, { title: "CV Pertama (revisi)" });

    const daftar = await svc.list(aktor);
    expect(daftar.map((r) => r.title)).toEqual(["CV Pertama (revisi)", "CV Kedua"]);
  });

  it("daftar hanya memuat milik pemanggil", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const a = await buatAktor();
    const b = await buatAktor();
    await service().create(a, { title: "CV Milik A", content: isi() });
    await service().create(b, { title: "CV Milik B", content: isi() });

    expect((await service().list(a)).map((r) => r.title)).toEqual(["CV Milik A"]);
    expect((await service().list(b)).map((r) => r.title)).toEqual(["CV Milik B"]);
  });
});

describe("batas CV tahan terhadap permintaan yang tiba bersamaan", () => {
  it("delapan POST serentak pada sisa jatah empat menghasilkan tepat 5 CV", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();
    const svc = service(5);
    await svc.create(aktor, { title: "CV Awal", content: isi() });

    // Empat sisa jatah, delapan peminat. Hitung-lalu-tulis tanpa kunci akan
    // meloloskan lebih dari empat: semuanya membaca hitungan LAMA. Klik ganda
    // pada koneksi lambat adalah bentuk paling lazim dari balapan ini, dan
    // koneksi lambat adalah keadaan yang paling lazim bagi pengguna kita.
    //
    // Hasilnya DETERMINISTIK, bukan "kira-kira empat": kuncinya menunggu alih-alih
    // membatalkan, jadi tidak ada satu pun permintaan yang gagal karena konflik.
    const hasil = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        svc.create(aktor, { title: `CV Serentak ${String(i)}`, content: isi() }),
      ),
    );

    const berhasil = hasil.filter((h) => h.status === "fulfilled");
    const ditolak = hasil.filter((h) => h.status === "rejected");

    expect(berhasil).toHaveLength(4);
    expect(ditolak).toHaveLength(4);
    for (const h of ditolak) {
      const err = (h as PromiseRejectedResult).reason as unknown;
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("BATAS_CV_TERCAPAI");
    }
    expect(await prisma.resume.count({ where: { userId: aktor.userId } })).toBe(5);
  });
});

describe("jsonb bolak-balik utuh", () => {
  it("isi CV lengkap kembali persis seperti yang disimpan", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const aktor = await buatAktor();
    const lengkap = isi({
      headline: "Desainer grafis lulusan SMK",
      summary: "Terampil Photoshop & Illustrator.",
      contact: {
        email: "rina@contoh.test",
        phone: "+6281100000000",
        city: "Jakarta",
        province: "DKI Jakarta",
        links: [{ label: "Portofolio", url: "https://contoh.test/rina" }],
      },
      experiences: [
        { title: "Desainer Lepas", company: "Studio Fiktif", startDate: "2021-01-01" },
      ],
      educations: [{ institution: "SMK Negeri 1 Jakarta", degree: "SMK", year: 2020 }],
      skills: [{ name: "Adobe Photoshop", level: "mahir" }],
      certifications: [{ name: "Pelatihan Desain BLK", issuer: "BLK Jakarta", year: 2021 }],
      organizations: [{ name: "Komunitas Tuli Jakarta", role: "Anggota" }],
    });

    const dibuat = await service().create(aktor, { title: "CV Lengkap", content: lengkap });
    const dibaca = await service().get(aktor, dibuat.id);

    expect(dibaca.content).toEqual(lengkap);
  });

  it("karakter non-latin dan emoji aman", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Bukan kelengkapan yang mengada-ada: nama tempat dan organisasi di
    // Indonesia lazim memakai tanda baca non-ASCII, dan template PDF (PR-063)
    // akan menuliskannya apa adanya.
    const aktor = await buatAktor();
    const teks = "Penerjemah BISINDO — ⌘ 手話 🤟 «Ñusantara»";
    const dibuat = await service().create(aktor, {
      title: "CV Unicode",
      content: isi({ headline: teks }),
    });

    const dibaca = await service().get(aktor, dibuat.id);
    expect(dibaca.content.headline).toBe(teks);
  });

  it("urutan larik tidak berubah setelah bolak-balik", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    // Urutan larik ADALAH urutan tampil (syarat reorder tombol PR-061). Kalau
    // jsonb menyusunnya ulang, tombol naik/turun berhenti bekerja tanpa satu pun
    // pesan kesalahan.
    const aktor = await buatAktor();
    const urutanAsli = ["Ketiga", "Pertama", "Kedua"];
    const dibuat = await service().create(aktor, {
      title: "CV Urutan",
      content: isi({ experiences: urutanAsli.map((title) => ({ title })) }),
    });

    const dibaca = await service().get(aktor, dibuat.id);
    expect(dibaca.content.experiences.map((e) => e.title)).toEqual(urutanAsli);
  });
});

describe("CV yang dipakai lamaran", () => {
  /** Satu lamaran nyata butuh lowongan nyata; ambil yang mana pun dari seed. */
  async function lowonganMana(): Promise<string | null> {
    const job = await prisma.job.findFirst({ select: { id: true } });
    return job?.id ?? null;
  }

  it("repository melempar CvDipakaiLamaranError, bukan meneruskan galat Prisma", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const jobId = await lowonganMana();
    if (jobId === null) return ctx.skip();

    const aktor = await buatAktor();
    const cv = await service().create(aktor, { title: "CV Terlampir", content: isi() });
    await prisma.application.create({
      data: { id: uuidV7(), userId: aktor.userId, jobId, resumeId: cv.id },
    });

    // FK `applications.resume_id` memakai onDelete NoAction DENGAN SENGAJA
    // (schema.prisma): CV yang sudah terkirim ke perusahaan tidak boleh lenyap
    // dari lamaran yang sedang berjalan.
    await expect(repo.deleteOwned(aktor.userId, cv.id)).rejects.toBeInstanceOf(
      CvDipakaiLamaranError,
    );
  });

  it("service menerjemahkannya menjadi 409 berpesan manusia", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const jobId = await lowonganMana();
    if (jobId === null) return ctx.skip();

    const aktor = await buatAktor();
    const cv = await service().create(aktor, { title: "CV Terlampir", content: isi() });
    await prisma.application.create({
      data: { id: uuidV7(), userId: aktor.userId, jobId, resumeId: cv.id },
    });

    try {
      await service().remove(aktor, cv.id);
      throw new Error("seharusnya ditolak");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("CV_DIPAKAI_LAMARAN");
      expect((err as AppError).status).toBe(409);
    }
  });

  it("hapus AKUN tetap membersihkan CV dan lamarannya sekaligus", async (ctx) => {
    if (!dbTersedia) return ctx.skip();
    const jobId = await lowonganMana();
    if (jobId === null) return ctx.skip();

    const aktor = await buatAktor();
    const cv = await service().create(aktor, { title: "CV Ikut Terhapus", content: isi() });
    await prisma.application.create({
      data: { id: uuidV7(), userId: aktor.userId, jobId, resumeId: cv.id },
    });

    // Inilah alasan FK-nya NoAction dan bukan Restrict: penghapusan akun
    // (hak UU PDP) menyapu `users` → `applications` + `resumes` dalam satu
    // statement, dan Restrict akan menghalanginya.
    await prisma.user.delete({ where: { id: aktor.userId } });

    expect(await prisma.resume.count({ where: { id: cv.id } })).toBe(0);
    expect(await prisma.application.count({ where: { resumeId: cv.id } })).toBe(0);
  });
});
