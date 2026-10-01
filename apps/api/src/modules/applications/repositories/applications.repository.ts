// modules/applications — akses tabel `applications` (PR-075).
//
// LAPIS KEDUA IDEMPOTENSI ADA DI SINI, DAN WASITNYA POSTGRESQL. Unique
// `(user_id, job_id)` (migrasi 03) menolak lamaran kedua ke lowongan yang sama —
// termasuk dua permintaan yang tiba bersamaan dengan Idempotency-Key BERBEDA,
// yang tidak bisa ditahan Redis. Tidak ada baca-lalu-tulis di aplikasi: yang
// kalah balapan menerima P2002, diterjemahkan menjadi `SudahMelamarError`.
import { Prisma, type ApplicationStatus } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";
import type { EncryptedField } from "../../../core/crypto/index.js";

/** Kode Prisma untuk pelanggaran unique constraint. */
const UNIQUE_VIOLATION = "P2002";

/** Dilempar saat unique (user_id, job_id) menolak — lamaran itu sudah ada. */
export class SudahMelamarError extends Error {
  constructor() {
    super("lamaran ke lowongan ini sudah ada");
    this.name = "SudahMelamarError";
  }
}

/**
 * Kolom yang boleh keluar dari repository ke service.
 *
 * `disclosureSnapshot` SENGAJA TIDAK ADA. Jalur pelamar tidak pernah membaca
 * ciphertext-nya kembali — pembacanya kelak hanya jalur admin ter-audit
 * (PR-077) — dan yang tidak pernah di-select tidak bisa bocor lewat respons.
 */
const KOLOM_LAMARAN = {
  id: true,
  jobId: true,
  resumeId: true,
  discloseDisability: true,
  status: true,
  appliedAt: true,
} as const;

export interface ApplicationRow {
  id: string;
  jobId: string;
  resumeId: string | null;
  discloseDisability: boolean;
  status: ApplicationStatus;
  appliedAt: Date;
}

/** Baris ekspor PDP — SATU-SATUNYA bacaan yang membawa ciphertext snapshot. */
export interface ApplicationExportRow extends ApplicationRow {
  disclosureSnapshot: Uint8Array | null;
}

export interface ApplicationBaru {
  id: string;
  userId: string;
  jobId: string;
  resumeId: string;
  discloseDisability: boolean;
  /** Wajib `null` bila `discloseDisability` false — CHECK migrasi 20 menegakkannya. */
  disclosureSnapshot: EncryptedField | null;
}

export function createApplicationsRepository(prisma: AppPrisma) {
  return {
    async create(data: ApplicationBaru): Promise<ApplicationRow> {
      try {
        return await prisma.application.create({ data, select: KOLOM_LAMARAN });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
          throw new SudahMelamarError();
        }
        throw err;
      }
    },

    /**
     * Pemeriksaan murah SEBELUM data sensitif dibaca — bukan penjaga
     * keunikannya (itu unique DB di `create`). Gunanya: lamaran ganda yang
     * sudah pasti ditolak tidak sempat mendekripsi profil dan menulis audit
     * pembacaan yang tidak menghasilkan apa-apa.
     */
    async adaUntuk(userId: string, jobId: string): Promise<boolean> {
      return (await prisma.application.count({ where: { userId, jobId } })) > 0;
    },

    /**
     * Seluruh lamaran milik satu pengguna BERIKUT ciphertext snapshot-nya —
     * hanya untuk ekspor PDP pemiliknya sendiri. Terbaru lebih dulu.
     */
    async listForExport(userId: string): Promise<ApplicationExportRow[]> {
      return prisma.application.findMany({
        where: { userId },
        select: { ...KOLOM_LAMARAN, disclosureSnapshot: true },
        orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
      });
    },

    /** Satu lamaran MILIKNYA; null bila tidak ada ATAU milik orang lain. */
    async findOwned(userId: string, id: string): Promise<ApplicationRow | null> {
      return prisma.application.findFirst({ where: { id, userId }, select: KOLOM_LAMARAN });
    },
  };
}

export type ApplicationsRepository = ReturnType<typeof createApplicationsRepository>;
