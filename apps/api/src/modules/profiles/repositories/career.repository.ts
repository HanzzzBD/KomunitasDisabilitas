// modules/profiles — repository sub-entitas karier (PR-038, SDD §6.2).
//
// TIDAK ADA DATA SENSITIF DI SINI. Riwayat kerja, pendidikan, dan keahlian
// adalah data karier biasa: tanpa enkripsi, tanpa consent, tanpa audit. Yang
// membuat berkas ini tetap perlu ditulis dengan hati-hati adalah hal lain —
// KEPEMILIKAN.
//
// SETIAP QUERY MENYEBUT `userId`, TERMASUK YANG SUDAH PUNYA `id`. Itu bukan
// pengulangan yang bisa dihemat. `id` adalah UUID yang dikirim klien; tanpa
// `userId` di klausa yang sama, satu-satunya yang menghalangi seseorang mengubah
// riwayat kerja orang lain adalah pemeriksaan di lapisan atas — dan pemeriksaan
// yang terpisah dari query-nya adalah pemeriksaan yang cepat atau lambat lupa
// dipasang pada satu jalur baru. Di sini, jalur yang lupa memeriksa TIDAK BISA
// DITULIS: tidak ada satu pun fungsi yang menerima `id` tanpa `userId`.
//
// Akibatnya baris milik orang lain berperilaku persis seperti baris yang tidak
// ada (`count: 0` → `null`), dan itu memang yang benar: 404, bukan 403. Jawaban
// 403 atas id milik orang lain memberi tahu penebak bahwa idnya ADA.
import type { AppPrisma } from "../../../core/db/index.js";

/** Baris `experiences` apa adanya. Tanggal `@db.Date` → `Date` UTC tengah malam. */
export interface ExperienceRow {
  id: string;
  title: string;
  company: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
}

/** Baris `educations` apa adanya. */
export interface EducationRow {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  year: number | null;
}

/** Baris `skills` apa adanya. */
export interface SkillRow {
  id: string;
  name: string;
  level: string | null;
}

/** Kolom yang ditulis saat membuat baris: seluruh baris tanpa `id`. */
export type ExperienceData = Omit<ExperienceRow, "id">;
export type EducationData = Omit<EducationRow, "id">;
export type SkillData = Omit<SkillRow, "id">;

/**
 * Kontrak yang sama untuk ketiga sub-entitas.
 *
 * Bentuknya sengaja seragam supaya service-nya bisa ditulis SEKALI
 * (`career.service.ts`): tiga entitas dengan alur create/list/update/delete yang
 * identik akan menjadi tiga salinan alur yang sama, dan salinan ketiga adalah
 * tempat pemeriksaan kepemilikan pertama kali terlewat.
 */
export interface CareerRepository<Row, Data> {
  /** Seluruh milik satu pengguna, terbaru dulu. */
  listByUser(userId: string): Promise<Row[]>;
  /** Satu baris MILIKNYA; null bila tidak ada ATAU milik orang lain. */
  findOwned(userId: string, id: string): Promise<Row | null>;
  create(userId: string, id: string, data: Data): Promise<Row>;
  /** null bila tidak ada/bukan miliknya — tanpa menyentuh baris siapa pun. */
  updateOwned(userId: string, id: string, patch: Partial<Data>): Promise<Row | null>;
  /** false bila tidak ada/bukan miliknya. */
  deleteOwned(userId: string, id: string): Promise<boolean>;
}

const KOLOM_EXPERIENCE = {
  id: true,
  title: true,
  company: true,
  startDate: true,
  endDate: true,
  description: true,
} as const;

const KOLOM_EDUCATION = {
  id: true,
  institution: true,
  degree: true,
  field: true,
  year: true,
} as const;

const KOLOM_SKILL = { id: true, name: true, level: true } as const;

/**
 * Urutan baku riwayat kerja: yang paling baru dulu.
 *
 * `nulls: "last"` penting. Riwayat tanpa tanggal mulai bukan riwayat paling
 * baru — ia riwayat yang belum lengkap, dan menaruhnya di puncak berarti CV
 * seseorang dibuka oleh baris yang paling sedikit dia isi.
 *
 * PENENGAH SERI ADALAH `createdAt`, BUKAN `id`. Sampai 2026-09-05 tugas itu
 * dipegang `id desc` dengan alasan "UUID v7 berurut waktu pembuatan" — dan
 * alasan itu hanya separuh benar: `core/ids/index.ts` menyatakan sendiri bahwa
 * urutan DALAM milidetik yang sama tidak dijamin. Tiga baris yang ditambahkan
 * beruntun kerap jatuh di milidetik yang sama, lalu keluar dalam urutan acak —
 * terlihat sebagai `career-db.test.ts` yang merah sesekali, dan sebagai daftar
 * yang urutannya salah bagi pengguna yang mengisi formulir dengan cepat.
 * `timestamptz(6)` berpresisi mikrodetik dan datang dari transaksi yang
 * berbeda, jadi ia benar-benar menengahi.
 *
 * `id desc` DIPERTAHANKAN sebagai penengah terakhir, dan itu disengaja: baris
 * yang sudah ada sebelum migrasi 11 semuanya menerima stempel waktu yang sama,
 * sehingga urutannya jatuh kembali ke perilaku lama alih-alih menjadi acak.
 */
const URUT_EXPERIENCE = [
  { startDate: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] as const;

const URUT_EDUCATION = [
  { year: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] as const;

/**
 * Keahlian tidak punya tanggal apa pun, jadi `createdAt` ADALAH urutannya —
 * bukan sekadar penengah. Inilah yang paling terdampak sebelum migrasi 11:
 * tanpa kolom lain, seluruh urutannya bersandar pada jaminan yang tidak pernah
 * diberikan `uuidV7`.
 */
const URUT_SKILL = [{ createdAt: "desc" }, { id: "desc" }] as const;

export function createExperienceRepository(
  prisma: AppPrisma,
): CareerRepository<ExperienceRow, ExperienceData> {
  return {
    listByUser: (userId) =>
      prisma.experience.findMany({
        where: { userId },
        orderBy: [...URUT_EXPERIENCE],
        select: KOLOM_EXPERIENCE,
      }),

    findOwned: (userId, id) =>
      prisma.experience.findFirst({ where: { id, userId }, select: KOLOM_EXPERIENCE }),

    create: (userId, id, data) =>
      prisma.experience.create({ data: { id, userId, ...data }, select: KOLOM_EXPERIENCE }),

    async updateOwned(userId, id, patch) {
      const { count } = await prisma.experience.updateMany({ where: { id, userId }, data: patch });
      if (count === 0) return null;
      // Dua statement, bukan satu transaksi: satu-satunya yang bisa menghapus
      // baris ini di antaranya adalah PEMILIKNYA SENDIRI dari permintaan lain,
      // dan jawaban 404 pada kasus itu justru yang benar — barisnya memang sudah
      // tidak ada saat jawabannya disusun.
      return prisma.experience.findFirst({ where: { id, userId }, select: KOLOM_EXPERIENCE });
    },

    async deleteOwned(userId, id) {
      const { count } = await prisma.experience.deleteMany({ where: { id, userId } });
      return count > 0;
    },
  };
}

export function createEducationRepository(
  prisma: AppPrisma,
): CareerRepository<EducationRow, EducationData> {
  return {
    listByUser: (userId) =>
      prisma.education.findMany({
        where: { userId },
        orderBy: [...URUT_EDUCATION],
        select: KOLOM_EDUCATION,
      }),

    findOwned: (userId, id) =>
      prisma.education.findFirst({ where: { id, userId }, select: KOLOM_EDUCATION }),

    create: (userId, id, data) =>
      prisma.education.create({ data: { id, userId, ...data }, select: KOLOM_EDUCATION }),

    async updateOwned(userId, id, patch) {
      const { count } = await prisma.education.updateMany({ where: { id, userId }, data: patch });
      if (count === 0) return null;
      return prisma.education.findFirst({ where: { id, userId }, select: KOLOM_EDUCATION });
    },

    async deleteOwned(userId, id) {
      const { count } = await prisma.education.deleteMany({ where: { id, userId } });
      return count > 0;
    },
  };
}

export function createSkillRepository(prisma: AppPrisma): CareerRepository<SkillRow, SkillData> {
  return {
    listByUser: (userId) =>
      prisma.skill.findMany({
        where: { userId },
        orderBy: [...URUT_SKILL],
        select: KOLOM_SKILL,
      }),

    findOwned: (userId, id) =>
      prisma.skill.findFirst({ where: { id, userId }, select: KOLOM_SKILL }),

    create: (userId, id, data) =>
      prisma.skill.create({ data: { id, userId, ...data }, select: KOLOM_SKILL }),

    async updateOwned(userId, id, patch) {
      const { count } = await prisma.skill.updateMany({ where: { id, userId }, data: patch });
      if (count === 0) return null;
      return prisma.skill.findFirst({ where: { id, userId }, select: KOLOM_SKILL });
    },

    async deleteOwned(userId, id) {
      const { count } = await prisma.skill.deleteMany({ where: { id, userId } });
      return count > 0;
    },
  };
}
