// modules/profiles — service sub-entitas karier (PR-038, SDD §6.2).
//
// SATU ALUR, TIGA ENTITAS. Riwayat kerja, pendidikan, dan keahlian menjalani
// urutan langkah yang persis sama: pastikan barisnya milik pemanggil, ubah,
// terbitkan `profile.updated`. Menuliskannya tiga kali berarti tiga tempat yang
// harus sama-sama benar — dan salinan ketiga adalah tempat pemeriksaan
// kepemilikan atau penerbitan event pertama kali terlewat, tanpa satu pun
// gejala. Yang berbeda per entitas hanya tiga hal, dan ketiganya disuntikkan:
// pemetaan kontrak↔baris, dan pemeriksaan tambahan (urutan tanggal, yang hanya
// ada pada riwayat kerja).
//
// Aturan yang sama dengan `profiles.service.ts` berlaku utuh: `userId` SELALU
// dari sesi, TIDAK PERNAH dari input. Tidak ada satu pun fungsi di sini yang
// punya parameter untuk menyebut pengguna lain.
import type {
  CreateEducation,
  CreateExperience,
  CreateSkill,
  Education,
  Experience,
  ProfileSection,
  Skill,
  UpdateEducation,
  UpdateExperience,
  UpdateSkill,
} from "@nawasena/schemas";
import type { EventBus } from "../../../core/events/index.js";
import { uuidV7 } from "../../../core/ids/index.js";
import { appError } from "../../../core/http/index.js";
import type {
  CareerRepository,
  EducationData,
  EducationRow,
  ExperienceData,
  ExperienceRow,
  SkillData,
  SkillRow,
} from "../repositories/career.repository.js";
import type { ProfilesActor } from "./profiles.service.js";

/**
 * Baris tidak ada ATAU milik orang lain — keduanya dijawab sama.
 *
 * 404, bukan 403. Membedakan keduanya berarti memberi tahu siapa pun yang
 * menebak-nebak UUID bahwa id yang ia coba itu ADA dan dimiliki seseorang; dan
 * "ada tetapi bukan milikmu" adalah keterangan yang tidak pernah perlu diketahui
 * pemanggil yang sah, sebab bagi pemilik yang benar jawaban itu tidak mungkin
 * muncul.
 */
function tidakDitemukan(sebutan: string) {
  return appError("RUTE_TIDAK_DITEMUKAN", {
    message: `${sebutan} itu tidak ditemukan`,
    hint: "Mungkin sudah dihapus. Muat ulang halaman, lalu coba lagi",
  });
}

export interface BagianKarierDeps<Row, Data, Item, Create, Update> {
  /** Nama bagian pada event `profile.updated`. */
  section: ProfileSection;
  /** Sebutan entitas dalam pesan 404 — Bahasa Indonesia, dibaca pengguna. */
  sebutan: string;
  repo: CareerRepository<Row, Data>;
  /** Baris DB → kontrak API. Eksplisit, supaya kolom baru tak punya jalan keluar. */
  keItem: (row: Row) => Item;
  /** Kontrak → kolom DB, baris utuh. */
  dariCreate: (input: Create) => Data;
  /** Kontrak → kolom DB, hanya yang benar-benar disebut pemanggil. */
  dariUpdate: (input: Update) => Partial<Data>;
  /**
   * Pemeriksaan atas keadaan SETELAH perubahan diterapkan; `row` null saat baris
   * baru dibuat. Melempar `AppError` bila tidak sah.
   */
  periksa?: (row: Row | null, patch: Partial<Data>) => void;
  events: EventBus;
  /** Sumber waktu; disuntik test. */
  clock?: () => Date;
}

export interface BagianKarier<Item, Create, Update> {
  list(actor: ProfilesActor): Promise<Item[]>;
  /** Daftar milik satu pengguna tanpa konteks permintaan — untuk ekspor PDP. */
  listFor(userId: string): Promise<Item[]>;
  create(actor: ProfilesActor, input: Create): Promise<Item>;
  update(actor: ProfilesActor, id: string, input: Update): Promise<Item>;
  remove(actor: ProfilesActor, id: string): Promise<void>;
}

export function createBagianKarier<Row, Data, Item, Create, Update>(
  deps: BagianKarierDeps<Row, Data, Item, Create, Update>,
): BagianKarier<Item, Create, Update> {
  const { section, sebutan, repo, keItem, dariCreate, dariUpdate, periksa, events } = deps;
  const now = deps.clock ?? (() => new Date());

  /**
   * Terbitkan `profile.updated` — SETELAH tulisannya berhasil, tidak sebelum.
   *
   * Pelanggan yang menghitung ulang embedding dari perubahan yang ternyata gagal
   * akan menyimpan hasil yang tidak pernah ada di tabel mana pun, dan tidak ada
   * apa pun yang kemudian memperbaikinya.
   */
  const kabarkan = (actor: ProfilesActor): void =>
    events.emit("profile.updated", {
      userId: actor.userId,
      section,
      updatedAt: now().toISOString(),
    });

  const listFor = async (userId: string): Promise<Item[]> =>
    (await repo.listByUser(userId)).map(keItem);

  return {
    /** Daftar milik pemanggil — urutan bakunya milik repository (terbaru dulu). */
    list: (actor) => listFor(actor.userId),

    listFor,

    /** Baris baru milik pemanggil; id dibuat SERVER (UUID v7). */
    async create(actor, input) {
      const data = dariCreate(input);
      periksa?.(null, data);
      // id tidak pernah datang dari klien: id pilihan klien adalah id yang bisa
      // ditebak, dan baris yang idnya bisa ditebak adalah baris yang bisa
      // ditabrak dengan sengaja.
      const row = await repo.create(actor.userId, uuidV7(), data);
      kabarkan(actor);
      return keItem(row);
    },

    /**
     * Perubahan sebagian pada satu baris.
     *
     * Barisnya dibaca lebih dulu meski `updateOwned` sendiri sudah menjawab
     * `null` untuk milik orang lain: `periksa` menilai keadaan SETELAH
     * penggabungan, dan permintaan yang hanya mengirim `endDate` tidak membawa
     * `startDate` untuk dibandingkan dengannya.
     */
    async update(actor, id, input) {
      const sebelum = await repo.findOwned(actor.userId, id);
      if (sebelum === null) throw tidakDitemukan(sebutan);

      const patch = dariUpdate(input);
      periksa?.(sebelum, patch);

      const row = await repo.updateOwned(actor.userId, id, patch);
      if (row === null) throw tidakDitemukan(sebutan);

      kabarkan(actor);
      return keItem(row);
    },

    async remove(actor, id) {
      const terhapus = await repo.deleteOwned(actor.userId, id);
      if (!terhapus) throw tidakDitemukan(sebutan);
      kabarkan(actor);
    },
  };
}

// --- Pemetaan tanggal --------------------------------------------------------
//
// Kolomnya `@db.Date` (tanpa jam/zona) tetapi Prisma tetap menyerahkannya
// sebagai `Date` JavaScript pada tengah malam UTC. Kedua arah karena itu HARUS
// melewati UTC: `toISOString().slice(0, 10)` dan bukan `getFullYear()`, sebab
// yang kedua membaca zona waktu server — dan server di Asia/Jakarta akan
// mengembalikan "2020-01-15" sebagai "2020-01-15", sementara server di UTC-5
// mengembalikannya sebagai "2020-01-14".

/** `Date` UTC → "YYYY-MM-DD". */
function keTeksTanggal(nilai: Date): string {
  return nilai.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → `Date` tengah malam UTC. Sudah tervalidasi zod di router. */
function keTanggal(nilai: string | null): Date | null {
  return nilai === null ? null : new Date(`${nilai}T00:00:00.000Z`);
}

/** Salin field yang BENAR-BENAR disebut pemanggil; `undefined` = jangan sentuh. */
function bila<T, K extends keyof T>(target: T, kunci: K, nilai: T[K] | undefined): void {
  if (nilai !== undefined) target[kunci] = nilai;
}

export interface KarierDeps {
  events: EventBus;
  clock?: () => Date;
}

/** Riwayat kerja — satu-satunya yang punya pemeriksaan urutan tanggal. */
export function createExperiencesService(
  repo: CareerRepository<ExperienceRow, ExperienceData>,
  deps: KarierDeps,
): BagianKarier<Experience, CreateExperience, UpdateExperience> {
  return createBagianKarier({
    section: "experiences",
    sebutan: "Riwayat pekerjaan",
    repo,
    keItem: (row): Experience => ({
      id: row.id,
      title: row.title,
      company: row.company,
      startDate: row.startDate === null ? null : keTeksTanggal(row.startDate),
      endDate: row.endDate === null ? null : keTeksTanggal(row.endDate),
      description: row.description,
    }),
    dariCreate: (input): ExperienceData => ({
      title: input.title,
      company: input.company,
      startDate: keTanggal(input.startDate),
      endDate: keTanggal(input.endDate),
      description: input.description,
    }),
    dariUpdate: (input): Partial<ExperienceData> => {
      const patch: Partial<ExperienceData> = {};
      bila(patch, "title", input.title);
      bila(patch, "company", input.company);
      bila(patch, "description", input.description);
      if (input.startDate !== undefined) patch.startDate = keTanggal(input.startDate);
      if (input.endDate !== undefined) patch.endDate = keTanggal(input.endDate);
      return patch;
    },
    // Pengulangan `urutanTanggal` di packages/schemas, dan memang harus diulang:
    // yang di sana hanya melihat badan permintaan, sedangkan permintaan ubah yang
    // hanya mengirim `endDate` baru bisa dinilai setelah digabung dengan baris
    // yang tersimpan. Tanpa ini, mengirim `endDate` lebih awal dalam dua langkah
    // terpisah menghasilkan baris yang selesainya mendahului mulainya.
    periksa: (row, patch) => {
      const mulai = patch.startDate !== undefined ? patch.startDate : (row?.startDate ?? null);
      const selesai = patch.endDate !== undefined ? patch.endDate : (row?.endDate ?? null);
      if (mulai !== null && selesai !== null && mulai.getTime() > selesai.getTime()) {
        throw appError("VALIDATION_ERROR", {
          message: "Tanggal selesai tidak boleh lebih awal daripada tanggal mulai",
          hint: "Periksa kembali tanggal mulai dan tanggal selesai riwayat ini",
        });
      }
    },
    events: deps.events,
    clock: deps.clock,
  });
}

/** Riwayat pendidikan. */
export function createEducationsService(
  repo: CareerRepository<EducationRow, EducationData>,
  deps: KarierDeps,
): BagianKarier<Education, CreateEducation, UpdateEducation> {
  return createBagianKarier({
    section: "educations",
    sebutan: "Riwayat pendidikan",
    repo,
    keItem: (row): Education => ({
      id: row.id,
      institution: row.institution,
      degree: row.degree,
      field: row.field,
      year: row.year,
    }),
    dariCreate: (input): EducationData => ({
      institution: input.institution,
      degree: input.degree,
      field: input.field,
      year: input.year,
    }),
    dariUpdate: (input): Partial<EducationData> => {
      const patch: Partial<EducationData> = {};
      bila(patch, "institution", input.institution);
      bila(patch, "degree", input.degree);
      bila(patch, "field", input.field);
      bila(patch, "year", input.year);
      return patch;
    },
    events: deps.events,
    clock: deps.clock,
  });
}

/** Keahlian. */
export function createSkillsService(
  repo: CareerRepository<SkillRow, SkillData>,
  deps: KarierDeps,
): BagianKarier<Skill, CreateSkill, UpdateSkill> {
  return createBagianKarier({
    section: "skills",
    sebutan: "Keahlian",
    repo,
    keItem: (row): Skill => ({ id: row.id, name: row.name, level: row.level }),
    dariCreate: (input): SkillData => ({ name: input.name, level: input.level }),
    dariUpdate: (input): Partial<SkillData> => {
      const patch: Partial<SkillData> = {};
      bila(patch, "name", input.name);
      bila(patch, "level", input.level);
      return patch;
    },
    events: deps.events,
    clock: deps.clock,
  });
}
