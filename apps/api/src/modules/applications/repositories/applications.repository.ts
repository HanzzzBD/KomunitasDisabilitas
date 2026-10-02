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

/** Kolom "Lamaran Saya" (PR-076) — tetap tanpa snapshot. */
const KOLOM_DETAIL = {
  ...KOLOM_LAMARAN,
  updatedAt: true,
  hiredConfirmedAt: true,
  statusHistory: true,
} as const;

export interface ApplicationDetailRow extends ApplicationRow {
  updatedAt: Date;
  hiredConfirmedAt: Date | null;
  /** JSONB mentah — dibentuk ulang (zod) di service. */
  statusHistory: Prisma.JsonValue;
}

/** Baris ekspor PDP — SATU-SATUNYA bacaan yang membawa ciphertext snapshot. */
export interface ApplicationExportRow extends ApplicationDetailRow {
  disclosureSnapshot: Uint8Array | null;
}

/** Baris jalur admin — membawa pemilik lamaran (tetap TANPA snapshot). */
export interface ApplicationAdminRow extends ApplicationDetailRow {
  userId: string;
}

/** Posisi halaman "Lamaran Saya": urut `updated_at DESC, id DESC`. */
export interface PosisiLamaran {
  updatedAt: Date;
  id: string;
}

/**
 * Perubahan yang ditulis `perbarui`. `statusHistory` adalah larik UTUH yang
 * baru (lama + entri baru) — penambahan dihitung service dari baris yang ia
 * baca, dan guard `updatedAt` memastikan tidak ada penulis lain di antaranya.
 */
export interface PerubahanLamaran {
  status?: ApplicationStatus;
  statusHistory?: Prisma.InputJsonValue;
  hiredConfirmedAt?: Date;
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
        select: { ...KOLOM_DETAIL, disclosureSnapshot: true },
        orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
      });
    },

    /**
     * Satu halaman lamaran milik pengguna, terbaru BERUBAH lebih dulu — indeks
     * `applications_user_updated (user_id, updated_at DESC)` migrasi 03 ada
     * untuk persis query ini. `limit` sudah termasuk +1 pengintip halaman.
     */
    async listMine(
      userId: string,
      limit: number,
      setelah?: PosisiLamaran,
    ): Promise<ApplicationDetailRow[]> {
      return prisma.application.findMany({
        where: {
          userId,
          ...(setelah === undefined
            ? {}
            : {
                OR: [
                  { updatedAt: { lt: setelah.updatedAt } },
                  { updatedAt: setelah.updatedAt, id: { lt: setelah.id } },
                ],
              }),
        },
        select: KOLOM_DETAIL,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit,
      });
    },

    /** Detail lamaran MILIKNYA (dengan riwayat); null bila tidak ada/milik orang lain. */
    async findOwnedDetail(userId: string, id: string): Promise<ApplicationDetailRow | null> {
      return prisma.application.findFirst({ where: { id, userId }, select: KOLOM_DETAIL });
    },

    /**
     * Tulis perubahan HANYA bila baris masih persis seperti yang dibaca
     * pemanggil (`status` + `updatedAt` sama) — compare-and-set.
     *
     * Dua klik withdraw, atau withdraw yang bersilangan dengan admin
     * menolak lamaran, tidak boleh sama-sama menambah riwayat: yang kalah
     * mendapat `false` dan menjawab 409, bukan menimpa riwayat yang baru
     * saja ditulis pihak lain.
     */
    async perbarui(
      userId: string,
      id: string,
      syarat: { status: ApplicationStatus; updatedAt: Date },
      perubahan: PerubahanLamaran,
    ): Promise<boolean> {
      const hasil = await prisma.application.updateMany({
        where: { id, userId, status: syarat.status, updatedAt: syarat.updatedAt },
        data: perubahan,
      });
      return hasil.count === 1;
    },

    // ----- Jalur admin (PR-077a) — tanpa saringan pemilik; dijaga role("admin").

    /** Satu halaman lamaran (filter lowongan/status), terbaru berubah dulu. */
    async listAdmin(
      filter: { jobId?: string; status?: ApplicationStatus },
      limit: number,
      setelah?: PosisiLamaran,
    ): Promise<ApplicationAdminRow[]> {
      return prisma.application.findMany({
        where: {
          ...(filter.jobId === undefined ? {} : { jobId: filter.jobId }),
          ...(filter.status === undefined ? {} : { status: filter.status }),
          ...(setelah === undefined
            ? {}
            : {
                OR: [
                  { updatedAt: { lt: setelah.updatedAt } },
                  { updatedAt: setelah.updatedAt, id: { lt: setelah.id } },
                ],
              }),
        },
        select: { ...KOLOM_DETAIL, userId: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit,
      });
    },

    async findForAdmin(id: string): Promise<ApplicationAdminRow | null> {
      return prisma.application.findUnique({
        where: { id },
        select: { ...KOLOM_DETAIL, userId: true },
      });
    },

    /** Compare-and-set yang sama dengan `perbarui`, tanpa saringan pemilik. */
    async perbaruiOlehAdmin(
      id: string,
      syarat: { status: ApplicationStatus; updatedAt: Date },
      perubahan: PerubahanLamaran,
    ): Promise<boolean> {
      const hasil = await prisma.application.updateMany({
        where: { id, status: syarat.status, updatedAt: syarat.updatedAt },
        data: perubahan,
      });
      return hasil.count === 1;
    },

    /**
     * SATU-SATUNYA bacaan ciphertext snapshot di jalur admin. Dipanggil HANYA
     * setelah audit pembukaannya ditulis (lihat admin-applications.service).
     */
    async bacaSnapshot(
      id: string,
    ): Promise<{ discloseDisability: boolean; disclosureSnapshot: Uint8Array | null } | null> {
      return prisma.application.findUnique({
        where: { id },
        select: { discloseDisability: true, disclosureSnapshot: true },
      });
    },

    /** Satu lamaran MILIKNYA; null bila tidak ada ATAU milik orang lain. */
    async findOwned(userId: string, id: string): Promise<ApplicationRow | null> {
      return prisma.application.findFirst({ where: { id, userId }, select: KOLOM_LAMARAN });
    },
  };
}

export type ApplicationsRepository = ReturnType<typeof createApplicationsRepository>;
