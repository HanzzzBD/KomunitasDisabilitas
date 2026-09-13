// modules/companies — repository lowongan aktif (PR-054, Gap G5).
//
// KENAPA DI SINI, BUKAN DI MODUL `jobs` (yang belum lahir sampai PR-055).
// Halaman publik perusahaan (US-09) butuh menunjukkan lowongan aktifnya
// SEBELUM modul jobs penuh ada — tabel `jobs` sendiri sudah ada sejak
// migrasi 03 (PR-011), jadi query-nya sah dilakukan sekarang. Berkas
// TERPISAH dari `companies.repository.ts` dengan sengaja: yang satu itu
// murni model `Company`, ini murni model `Job` — dua model, dua berkas,
// supaya batasnya tetap jelas begitu modul `jobs` sungguhan lahir dan
// query ini pindah ke sana APA ADANYA.
//
// "AKTIF" = `status: "published"` DAN belum lewat `expiresAt` (atau
// `expiresAt` null — lowongan tanpa tenggat). Definisi yang SAMA dengan yang
// dipakai `jobs/expiry.service.ts` (PR-024b) untuk menentukan lowongan mana
// yang akan ditutup otomatis — dua penulis berbeda, satu definisi kebenaran.
import type { AppPrisma } from "../../../core/db/index.js";
import type { EmploymentType, WorkMode } from "@nawasena/schemas";

export interface ActiveJobRow {
  id: string;
  title: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  publishedAt: Date | null;
}

const KOLOM = {
  id: true,
  title: true,
  employmentType: true,
  workMode: true,
  city: true,
  province: true,
  publishedAt: true,
} as const;

export interface ActiveJobsRepository {
  /** Lowongan `published` milik satu perusahaan, terbaru dulu. */
  listActiveByCompany(companyId: string): Promise<ActiveJobRow[]>;
}

export function createActiveJobsRepository(prisma: AppPrisma): ActiveJobsRepository {
  return {
    async listActiveByCompany(companyId) {
      const rows = await prisma.job.findMany({
        where: {
          companyId,
          status: "published",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { publishedAt: "desc" },
        select: KOLOM,
      });
      return rows.map((r) => ({
        ...r,
        employmentType: r.employmentType as EmploymentType,
        workMode: r.workMode as WorkMode,
      }));
    },
  };
}
