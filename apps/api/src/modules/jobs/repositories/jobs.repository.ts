// modules/jobs — repository (PR-055, SDD §6.1/§6.2).
//
// TIDAK ADA PENJAGA KEPEMILIKAN, sama alasannya dengan `companies.repository.ts`:
// lowongan dikurasi admin, bukan milik satu pengguna. `createdBy` tercatat
// (siapa membuatnya), tetapi bukan sebagai batas akses.
//
// TRANSISI STATUS (`publish`/`close`) TERPISAH dari `update()` DENGAN SENGAJA —
// pola yang sama dengan `verify()` di `companies.repository.ts`: keduanya
// satu-satunya jalan menulis kolom `status`+`publishedAt`, dan KELEGALAN
// transisinya (draft→published, published→closed) diputuskan SERVICE, bukan
// di sini — repository ini murni mekanis, membaca status terkini lalu menulis
// yang diminta, tanpa tahu aturan FSM-nya.
import { Prisma } from "@prisma/client";
import type {
  AccommodationNeed,
  DisabilityType,
  EmploymentType,
  JobSource,
  JobStatus,
  WorkMode,
} from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";

/** Pelanggaran foreign key — `companyId` menunjuk perusahaan yang tidak ada. */
const FOREIGN_KEY_VIOLATION = "P2003";
/** Baris yang coba diambil/dihapus sudah tidak ada. */
const RECORD_NOT_FOUND = "P2025";

/** Baris `jobs` apa adanya. */
export interface JobRow {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requirements: string | null;
  employmentType: EmploymentType;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryVisible: boolean;
  accommodations: AccommodationNeed[];
  welcomedDisabilityTypes: DisabilityType[];
  source: JobSource;
  status: JobStatus;
  createdBy: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** POST /admin/jobs — `status`/`source` TIDAK di sini, keduanya bawaan kolom Prisma. */
export interface JobCreateData {
  companyId: string;
  title: string;
  description: string;
  requirements: string | null;
  employmentType: EmploymentType;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryVisible: boolean;
  accommodations: AccommodationNeed[];
  welcomedDisabilityTypes: DisabilityType[];
  createdBy: string | null;
}

/** PUT /admin/jobs/:id — field yang tidak disebut berarti tidak diubah. */
export interface JobUpdatePatch {
  title?: string;
  description?: string;
  requirements?: string | null;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  city?: string | null;
  province?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryVisible?: boolean;
  accommodations?: AccommodationNeed[];
  welcomedDisabilityTypes?: DisabilityType[];
  expiresAt?: Date | null;
}

/** Hasil `create()` — sentinel string, bukan exception, untuk kegagalan yang SAH (lihat `ai-usage.repository.ts` untuk pola yang sama). */
export type JobCreateResult = JobRow | "perusahaan-tidak-ada";

/** Hasil `delete()` — tiga kemungkinan yang SAH, bukan exception. */
export type JobDeleteResult = "dihapus" | "tidak-ditemukan" | "berlamaran";

const KOLOM = {
  id: true,
  companyId: true,
  title: true,
  description: true,
  requirements: true,
  employmentType: true,
  workMode: true,
  city: true,
  province: true,
  salaryMin: true,
  salaryMax: true,
  salaryVisible: true,
  accommodations: true,
  welcomedDisabilityTypes: true,
  source: true,
  status: true,
  createdBy: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type BarisPrisma = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requirements: string | null;
  employmentType: string;
  workMode: string;
  city: string | null;
  province: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryVisible: boolean;
  accommodations: unknown;
  welcomedDisabilityTypes: string[];
  source: string;
  status: string;
  createdBy: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Baris Prisma (kolom Json bertipe `JsonValue`, enum bertipe `string`) → bentuk baku modul ini. */
function keRow(baris: BarisPrisma): JobRow {
  return {
    ...baris,
    employmentType: baris.employmentType as EmploymentType,
    workMode: baris.workMode as WorkMode,
    source: baris.source as JobSource,
    status: baris.status as JobStatus,
    welcomedDisabilityTypes: baris.welcomedDisabilityTypes as DisabilityType[],
    // Kolom Json Prisma bertipe `JsonValue`; nilainya SELALU array — dijaga
    // di sisi tulis (service, zod) dan `@default("[]")` schema.prisma, pola
    // sama dengan `companies.repository.ts`.
    accommodations: Array.isArray(baris.accommodations)
      ? (baris.accommodations as AccommodationNeed[])
      : [],
  };
}

/** Satu baris hasil `search()` — kartu publik, JOIN `companies` untuk nama (lihat `JobSearchResult` @nawasena/schemas). */
export interface JobSearchRow {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  accommodations: AccommodationNeed[];
  /** TIDAK PERNAH null — `search()` hanya menjawab lowongan `published` (`publish()` selalu menulis keduanya bersamaan). */
  publishedAt: Date;
}

export interface JobSearchFilter {
  /** FTS `title`+`description` ATAU kemiripan trigram `title` (OR, lihat implementasi). */
  query?: string;
  city?: string;
  province?: string;
  workMode?: WorkMode;
  /** Filter ⊇ — job harus punya SEMUA nilai ini (containment jsonb `@>`). */
  accommodations?: AccommodationNeed[];
  /** Diteruskan APA ADANYA ke `LIMIT` — pemanggil yang menentukan (biasanya `limit diminta + 1`). */
  limit: number;
  /** Posisi halaman; `undefined` = halaman pertama. */
  cursor?: { sortAt: Date; id: string };
}

/** Baris mentah `search()` — kolom `Json`/enum Prisma belum ternormalisasi (pola sama `BarisPrisma`). */
type BarisPencarian = {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  employmentType: string;
  workMode: string;
  city: string | null;
  province: string | null;
  accommodations: unknown;
  publishedAt: Date;
};

function keSearchRow(baris: BarisPencarian): JobSearchRow {
  return {
    ...baris,
    employmentType: baris.employmentType as EmploymentType,
    workMode: baris.workMode as WorkMode,
    accommodations: Array.isArray(baris.accommodations)
      ? (baris.accommodations as AccommodationNeed[])
      : [],
  };
}

export interface JobsRepository {
  /** Seluruh lowongan, terbaru dulu — skala pilot (pola sama `companies.repository.ts`). */
  listAdmin(): Promise<JobRow[]>;
  findById(id: string): Promise<JobRow | null>;
  /** Lowongan `published` DAN belum `expiresAt` (atau tanpa tenggat) milik satu perusahaan. */
  listActiveByCompany(companyId: string): Promise<JobRow[]>;
  create(id: string, data: JobCreateData): Promise<JobCreateResult>;
  /** null bila `id` tidak ada. */
  update(id: string, patch: JobUpdatePatch): Promise<JobRow | null>;
  /** Satu-satunya jalan menulis `status: "published"` + `publishedAt`. */
  publish(id: string, publishedAt: Date): Promise<JobRow | null>;
  /** Satu-satunya jalan menulis `status: "closed"` dari sisi admin. */
  close(id: string): Promise<JobRow | null>;
  delete(id: string): Promise<JobDeleteResult>;
  /** GET /jobs — pencarian publik (PR-056, ADR-018). Raw SQL — satu-satunya cara memakai FTS/trigram/GIN. */
  search(filter: JobSearchFilter): Promise<JobSearchRow[]>;
}

export function createJobsRepository(prisma: AppPrisma): JobsRepository {
  return {
    listAdmin: async () => {
      const rows = await prisma.job.findMany({
        orderBy: { createdAt: "desc" },
        select: KOLOM,
      });
      return rows.map(keRow);
    },

    findById: async (id) => {
      const row = await prisma.job.findUnique({ where: { id }, select: KOLOM });
      return row === null ? null : keRow(row);
    },

    listActiveByCompany: async (companyId) => {
      const rows = await prisma.job.findMany({
        where: {
          companyId,
          status: "published",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { publishedAt: "desc" },
        select: KOLOM,
      });
      return rows.map(keRow);
    },

    create: async (id, data) => {
      try {
        const row = await prisma.job.create({ data: { id, ...data }, select: KOLOM });
        return keRow(row);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === FOREIGN_KEY_VIOLATION) {
          return "perusahaan-tidak-ada";
        }
        throw err;
      }
    },

    update: async (id, patch) => {
      const { count } = await prisma.job.updateMany({ where: { id }, data: patch });
      if (count === 0) return null;
      const row = await prisma.job.findUnique({ where: { id }, select: KOLOM });
      return row === null ? null : keRow(row);
    },

    publish: async (id, publishedAt) => {
      const { count } = await prisma.job.updateMany({
        where: { id },
        data: { status: "published", publishedAt },
      });
      if (count === 0) return null;
      const row = await prisma.job.findUnique({ where: { id }, select: KOLOM });
      return row === null ? null : keRow(row);
    },

    close: async (id) => {
      const { count } = await prisma.job.updateMany({ where: { id }, data: { status: "closed" } });
      if (count === 0) return null;
      const row = await prisma.job.findUnique({ where: { id }, select: KOLOM });
      return row === null ? null : keRow(row);
    },

    delete: async (id) => {
      try {
        await prisma.job.delete({ where: { id } });
        return "dihapus";
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === RECORD_NOT_FOUND) return "tidak-ditemukan";
          if (err.code === FOREIGN_KEY_VIOLATION) return "berlamaran";
        }
        throw err;
      }
    },

    /**
     * Raw SQL — SATU-SATUNYA cara memakai FTS (`jobs_fts_gin`), trigram
     * (`jobs_title_trgm`), dan containment akomodasi (`jobs_accommodations_gin`)
     * sekaligus; Prisma Client tidak punya API untuk ketiganya (migrasi 03,
     * PR-011). Setiap kondisi OPSIONAL ditambahkan hanya bila filternya
     * diminta — `WHERE` yang pendek untuk pencarian tanpa filter berarti
     * planner tidak dipaksa mengevaluasi predikat yang selalu benar.
     *
     * Ekspresi FTS di sini HARUS sama persis (nama fungsi, `coalesce`,
     * konkatenasi) dengan definisi `jobs_fts_gin` di migrasi — indeks
     * ekspresi Postgres cocok berdasarkan pohon ekspresi, bukan alias tabel,
     * tetapi tetap gagal cocok bila bentuknya berbeda sedikit pun.
     */
    search: async (filter) => {
      const kondisi: Prisma.Sql[] = [
        Prisma.sql`j."status" = 'published'`,
        Prisma.sql`(j."expires_at" IS NULL OR j."expires_at" > now())`,
      ];

      if (filter.city !== undefined) {
        kondisi.push(Prisma.sql`j."city" = ${filter.city}`);
      }
      if (filter.province !== undefined) {
        kondisi.push(Prisma.sql`j."province" = ${filter.province}`);
      }
      if (filter.workMode !== undefined) {
        kondisi.push(Prisma.sql`j."work_mode" = ${filter.workMode}::"WorkMode"`);
      }
      if (filter.accommodations !== undefined && filter.accommodations.length > 0) {
        kondisi.push(Prisma.sql`j."accommodations" @> ${JSON.stringify(filter.accommodations)}::jsonb`);
      }
      if (filter.query !== undefined) {
        // FTS (indeks `jobs_fts_gin`) ATAU KEMIRIPAN KATA trigram (indeks
        // `jobs_title_trgm`, operator `<%` — toleransi typo ringan, AC "typo
        // ringan tetap menemukan"). Planner boleh memakai BitmapOr kedua indeks.
        //
        // `<%` (word_similarity), BUKAN `%` (similarity string-penuh). `%`
        // membandingkan trigram SELURUH `query` melawan trigram SELURUH
        // `title` — query pendek ("pelangan") melawan judul multi-kata
        // ("Staf Layanan Pelanggan") punya sedikit trigram yang beririsan
        // relatif terhadap total, hampir selalu jatuh di bawah ambang batas.
        // `<%` mencari kecocokan SEBAGIAN — apakah `query` mirip SALAH SATU
        // kata di dalam `title` — yang justru bentuk pencarian yang dimaksud.
        kondisi.push(Prisma.sql`(
          to_tsvector('indonesian', coalesce(j."title", '') || ' ' || coalesce(j."description", ''))
            @@ plainto_tsquery('indonesian', ${filter.query})
          OR ${filter.query} <% j."title"
        )`);
      }
      if (filter.cursor !== undefined) {
        // Keyset (published_at, id) DESC — bukan OFFSET (lihat core/pagination
        // untuk alasannya). Perbandingan tuple: baris "setelah" cursor berarti
        // tuple-nya LEBIH KECIL secara leksikografis pada urutan DESC.
        //
        // `::uuid` WAJIB — perbandingan baris Postgres desugar jadi
        // perbandingan per-kolom dengan operator default; parameter Prisma
        // datang sebagai `text`/`unknown`, dan `uuid < text` tidak punya
        // operator (beda dari `published_at` yang otomatis cocok ke `timestamptz`).
        kondisi.push(
          Prisma.sql`(j."published_at", j."id") < (${filter.cursor.sortAt}, ${filter.cursor.id}::uuid)`,
        );
      }

      const where = Prisma.join(kondisi, " AND ");

      const rows = await prisma.$queryRaw<BarisPencarian[]>`
        SELECT
          j."id" AS "id",
          j."company_id" AS "companyId",
          c."name" AS "companyName",
          j."title" AS "title",
          j."employment_type" AS "employmentType",
          j."work_mode" AS "workMode",
          j."city" AS "city",
          j."province" AS "province",
          j."accommodations" AS "accommodations",
          j."published_at" AS "publishedAt"
        FROM "jobs" j
        JOIN "companies" c ON c."id" = j."company_id"
        WHERE ${where}
        ORDER BY j."published_at" DESC, j."id" DESC
        LIMIT ${filter.limit}
      `;

      return rows.map(keSearchRow);
    },
  };
}
