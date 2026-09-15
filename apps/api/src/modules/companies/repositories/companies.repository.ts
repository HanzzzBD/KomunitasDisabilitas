// modules/companies — repository (PR-051, SDD §6.2).
//
// TIDAK ADA DATA SENSITIF DI SINI. Nama, deskripsi, taksonomi akomodasi
// TERSEDIA (bukan kebutuhan pribadi seseorang) adalah data fasilitas
// perusahaan — publik dengan sengaja (PRD FR-6.1, USP "Company Accessibility
// Profile"). Tidak ada penjaga kepemilikan seperti `career.repository.ts`:
// perusahaan bukan milik satu pengguna, melainkan dikurasi admin.
import type { AppPrisma } from "../../../core/db/index.js";
import type { AccommodationNeed, InclusivityStatus } from "@nawasena/schemas";

/** Baris `companies` apa adanya. */
export interface CompanyRow {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  city: string | null;
  inclusivityStatus: InclusivityStatus;
  accommodationsAvailable: AccommodationNeed[];
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyCreateData {
  name: string;
  description: string | null;
  website: string | null;
  city: string | null;
  accommodationsAvailable: AccommodationNeed[];
}

/** Patch admin — field yang tidak disebut berarti tidak diubah. */
export interface CompanyUpdatePatch {
  name?: string;
  description?: string | null;
  website?: string | null;
  city?: string | null;
  accommodationsAvailable?: AccommodationNeed[];
  inclusivityStatus?: InclusivityStatus;
}

const KOLOM = {
  id: true,
  name: true,
  description: true,
  website: true,
  city: true,
  inclusivityStatus: true,
  accommodationsAvailable: true,
  verifiedBy: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Baris Prisma (kolom JSON bertipe `JsonValue`) → bentuk baku modul ini. */
function keRow(baris: {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  city: string | null;
  inclusivityStatus: string;
  accommodationsAvailable: unknown;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CompanyRow {
  return {
    ...baris,
    inclusivityStatus: baris.inclusivityStatus as InclusivityStatus,
    // Kolom Json Prisma bertipe `JsonValue`; nilainya SELALU array — dijaga
    // di sisi tulis (service, zod) dan di `@default("[]")` schema.prisma.
    accommodationsAvailable: Array.isArray(baris.accommodationsAvailable)
      ? (baris.accommodationsAvailable as AccommodationNeed[])
      : [],
  };
}

export interface CompaniesRepository {
  /** Seluruh perusahaan, nama A→Z — skala pilot (puluhan baris, bukan ribuan). */
  listAll(): Promise<CompanyRow[]>;
  findById(id: string): Promise<CompanyRow | null>;
  create(id: string, data: CompanyCreateData): Promise<CompanyRow>;
  /** null bila `id` tidak ada. */
  update(id: string, patch: CompanyUpdatePatch): Promise<CompanyRow | null>;
  /**
   * Tulis status verifikasi + siapa + kapan sekaligus. Terpisah dari `update`
   * dengan sengaja: satu-satunya jalan menuju `inclusivityStatus: "verified"`
   * (lihat `editableInclusivityStatusSchema` di @nawasena/schemas/companies).
   */
  verify(id: string, verifiedBy: string, verifiedAt: Date): Promise<CompanyRow | null>;
}

export function createCompaniesRepository(prisma: AppPrisma): CompaniesRepository {
  return {
    listAll: async () => {
      const rows = await prisma.company.findMany({
        orderBy: { name: "asc" },
        select: KOLOM,
      });
      return rows.map(keRow);
    },

    findById: async (id) => {
      const row = await prisma.company.findUnique({ where: { id }, select: KOLOM });
      return row === null ? null : keRow(row);
    },

    create: async (id, data) => {
      const row = await prisma.company.create({ data: { id, ...data }, select: KOLOM });
      return keRow(row);
    },

    update: async (id, patch) => {
      const { count } = await prisma.company.updateMany({ where: { id }, data: patch });
      if (count === 0) return null;
      const row = await prisma.company.findUnique({ where: { id }, select: KOLOM });
      return row === null ? null : keRow(row);
    },

    verify: async (id, verifiedBy, verifiedAt) => {
      const { count } = await prisma.company.updateMany({
        where: { id },
        data: { inclusivityStatus: "verified", verifiedBy, verifiedAt },
      });
      if (count === 0) return null;
      const row = await prisma.company.findUnique({ where: { id }, select: KOLOM });
      return row === null ? null : keRow(row);
    },
  };
}
