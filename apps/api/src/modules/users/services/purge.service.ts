// modules/users — purge/anonimisasi akun terhapus (PR-023, PRD FR-1.4, SDD §6.4).
//
// JANJI YANG DITEPATI DI SINI: "data hilang ≤ 30 hari". PR-021 membuat
// penghapusan bersifat SOFT justru supaya yang keliru bisa dibatalkan; berkas
// ini yang membuat sisi keduanya benar — bahwa setelah jendela itu lewat, data
// benar-benar hilang dan bukan hanya disembunyikan.
//
// DUA JALUR, DAN ALASANNYA BUKAN KERAPIAN:
//
//   tanpa lamaran hired → DELETE baris users. Cascade membereskan seluruh
//     anaknya sendiri, jadi tabel yang lahir di PR mana pun ikut tercakup tanpa
//     ada yang perlu mengingatnya. Ini penghapusan yang sesungguhnya.
//
//   punya lamaran hired → anonimkan. `hired count` adalah North Star Metric
//     proyek ini (SDD §6.4), dan ia hidup di baris `applications` yang
//     ber-`onDelete: Cascade`. Menghapus barisnya berarti setiap orang yang
//     menghapus akunnya ikut menghapus bukti bahwa platform ini pernah bekerja.
//     Baris `users` dipertahankan TANPA satu pun PII; lamarannya tinggal, tetapi
//     tidak lagi menunjuk siapa pun.
//
// IDEMPOTEN BY CONSTRUCTION. Tidak ada kolom "sudah dipurge". Kandidat
// didefinisikan dari KEADAAN TUJUAN — baris yang masih memegang PII — sehingga
// yang sudah bersih tidak pernah terpilih lagi, dan run yang gagal separuh jalan
// otomatis dilanjutkan run berikutnya tanpa penanganan khusus.
import {
  AUDIT_ACTION,
  type PdpPurgeReport,
} from "@nawasena/schemas";
import type { Prisma } from "@prisma/client";
import type { AuditLog } from "../../../core/audit/index.js";
import type { AppPrisma } from "../../../core/db/index.js";
import { uuidV7 } from "../../../core/ids/index.js";

/** Entitas audit job ini (tanpa PII). */
const AUDIT_ENTITY = "users.purge";

export const PURGE_POLICY = {
  /** Janji PRD FR-1.4 / SDD §6.4. */
  hariTunggu: 30,
  /**
   * Batas akun per run. Timeout queue `maintenance-pdp-purge` adalah 10 menit
   * (SDD §16); run tanpa batas atas akan menabraknya pada backlog besar dan
   * gagal SETELAH menghapus separuh — bentuk kegagalan paling buruk untuk
   * operasi destruktif. Sisanya diambil run berikutnya.
   */
  batasPerRun: 500,
} as const;

/**
 * Tabel data pribadi yang dihapus eksplisit pada jalur ANONIMISASI.
 *
 * Hanya jalur itu yang membutuhkannya: pada jalur hapus-penuh, `ON DELETE
 * CASCADE` sudah membereskan semuanya. Daftar ini karena itu adalah utang yang
 * hidup — setiap tabel baru yang menyimpan data pengguna WAJIB masuk ke sini,
 * dan penjaga `purge-kelengkapan.test.ts` menolak build sampai itu terjadi.
 *
 * `applications` SENGAJA tidak ada: ia yang dipertahankan (lihat kepala berkas).
 */
export const TABEL_DIHAPUS = [
  "accessibilityProfile",
  "seekerProfile",
  "experience",
  "education",
  "skill",
  "resume",
  "matchScore",
  "aiUsage",
  "notification",
  "refreshToken",
] as const satisfies readonly (keyof Prisma.TypeMap["model"] extends never ? never : string)[];

/** Kandidat purge: sudah lewat jendela DAN masih memegang PII. */
export function kandidatWhere(cutoff: Date): Prisma.UserWhereInput {
  return {
    deletedAt: { not: null, lt: cutoff },
    // Inilah penanda "belum dipurge" — keadaan, bukan kolom. Baris yang sudah
    // bersih tidak cocok lagi, jadi run berikutnya melewatinya sendiri.
    OR: [
      { phone: { not: null } },
      { email: { not: null } },
      { googleId: { not: null } },
      { fullName: { not: "" } },
    ],
  };
}

export interface PurgeServiceDeps {
  prisma: AppPrisma;
  auditLog: AuditLog;
  /** Sumber waktu; disuntik test untuk fast-forward. */
  clock?: () => Date;
}

export function createPurgeService(deps: PurgeServiceDeps) {
  const { prisma, auditLog } = deps;
  const now = deps.clock ?? (() => new Date());

  /** requestId sintetis: job tidak punya permintaan HTTP, tetapi audit menuntutnya. */
  const aktorSistem = () => ({ actorId: null, requestId: uuidV7() });

  return {
    /**
     * Jalankan satu run. `dryRun` menghitung dan melaporkan TANPA menyentuh
     * satu baris pun — termasuk tanpa membuka transaksi.
     */
    async run(options: { dryRun?: boolean } = {}): Promise<PdpPurgeReport> {
      const dryRun = options.dryRun ?? false;
      const cutoff = new Date(now().getTime() - PURGE_POLICY.hariTunggu * 86_400_000);
      const where = kandidatWhere(cutoff);

      // `deletedAt` disebut eksplisit di where, jadi penjaga soft delete
      // (core/db) tidak menimpanya — inilah jalan keluar yang dirancang PR-021a.
      const kandidat = await prisma.user.findMany({
        where,
        select: { id: true },
        orderBy: { deletedAt: "asc" }, // yang paling lama menunggu lebih dulu
        take: PURGE_POLICY.batasPerRun,
      });
      const sisa = await prisma.user.count({ where });

      const laporan: PdpPurgeReport = {
        dryRun,
        accounts: kandidat.length,
        deleted: 0,
        anonymized: 0,
        records: 0,
        hasMore: sisa > kandidat.length,
      };

      for (const { id } of kandidat) {
        const hasil = dryRun ? await telaah(id) : await bersihkan(id);
        laporan.deleted += hasil.deleted;
        laporan.anonymized += hasil.anonymized;
        laporan.records += hasil.records;

        // Satu baris audit per akun: setelah barisnya hilang, INI satu-satunya
        // bukti bahwa akun itu benar-benar dibersihkan dan kapan.
        auditLog(aktorSistem(), AUDIT_ACTION.DATA_PURGED, AUDIT_ENTITY, id, {
          dryRun,
          accounts: 1,
          ...hasil,
        });
      }

      // Ringkasan run (entityId null) — yang dibaca operator saat memeriksa
      // bahwa job harian benar-benar berjalan.
      auditLog(aktorSistem(), AUDIT_ACTION.DATA_PURGED, AUDIT_ENTITY, null, {
        dryRun,
        accounts: laporan.accounts,
        deleted: laporan.deleted,
        anonymized: laporan.anonymized,
        records: laporan.records,
      });

      return laporan;
    },
  };

  /** Hitung dampak tanpa menulis apa pun (dry-run). */
  async function telaah(userId: string): Promise<Omit<PdpPurgeReport, "dryRun" | "accounts" | "hasMore">> {
    const hired = await prisma.application.count({ where: { userId, status: "hired" } });
    let records = 0;
    for (const tabel of TABEL_DIHAPUS) {
      records += await delegasi(prisma, tabel).count({ where: { userId } });
    }
    return hired > 0
      ? { deleted: 0, anonymized: 1, records }
      : // Jalur hapus-penuh: cascade juga membawa `applications`, yang tidak
        // ada di TABEL_DIHAPUS. Dihitung terpisah supaya laporannya jujur.
        {
          deleted: 1,
          anonymized: 0,
          records: records + (await prisma.application.count({ where: { userId } })),
        };
  }

  /** Bersihkan satu akun — satu transaksi, semua atau tidak sama sekali. */
  async function bersihkan(
    userId: string,
  ): Promise<Omit<PdpPurgeReport, "dryRun" | "accounts" | "hasMore">> {
    return prisma.$transaction(async (tx) => {
      const hired = await tx.application.count({ where: { userId, status: "hired" } });

      if (hired === 0) {
        const anak = await hitungAnak(tx, userId);
        const lamaran = await tx.application.count({ where: { userId } });
        // Satu DELETE; `ON DELETE CASCADE` mengurus sisanya — termasuk tabel
        // yang belum lahir saat berkas ini ditulis.
        await tx.user.delete({ where: { id: userId } });
        return { deleted: 1, anonymized: 0, records: anak + lamaran };
      }

      // WAJIB LEBIH DULU: `applications.resume_id` ber-`onDelete: NoAction`
      // (PR-011, disengaja — DELETE resume yang masih dipakai lamaran harus
      // ditolak). Tanpa melepas tautannya, penghapusan `resumes` di bawah akan
      // menggagalkan SELURUH transaksi untuk setiap akun yang pernah melamar.
      await tx.application.updateMany({
        where: { userId, resumeId: { not: null } },
        data: { resumeId: null },
      });

      let records = 0;
      for (const tabel of TABEL_DIHAPUS) {
        const hasil = await delegasi(tx, tabel).deleteMany({ where: { userId } });
        records += hasil.count;
      }

      // Baris tinggal, identitasnya tidak. `role`/`createdAt`/`tokenVersion`
      // dibiarkan: bukan PII, dan menghapusnya tidak menambah perlindungan.
      //
      // `deletedAt: { not: null }` WAJIB, dan bukan sekadar syarat tambahan:
      // penjaga soft delete (core/db) menyaring `user.update` dengan
      // `deletedAt: null`, sehingga tanpa menyebut kolom ini sendiri, UPDATE
      // ini tidak akan pernah menemukan barisnya — akun terhapus justru yang
      // tak terlihat. Ini jalan keluar yang dirancang PR-021a: query yang
      // memang menyasar baris terhapus menyatakannya di tempat panggilan.
      // Sekaligus pengaman: purge tidak boleh menyentuh akun yang masih aktif.
      await tx.user.update({
        where: { id: userId, deletedAt: { not: null } },
        data: {
          fullName: "",
          email: null,
          emailVerified: false,
          phone: null,
          googleId: null,
          lastActiveAt: null,
        },
      });

      return { deleted: 0, anonymized: 1, records };
    });
  }

  async function hitungAnak(tx: TxLike, userId: string): Promise<number> {
    let total = 0;
    for (const tabel of TABEL_DIHAPUS) {
      total += await delegasi(tx, tabel).count({ where: { userId } });
    }
    return total;
  }
}

/** Permukaan delegate Prisma yang dipakai purge — sempit agar bisa dipalsukan. */
interface DelegateLike {
  count(args: { where: { userId: string } }): Promise<number>;
  deleteMany(args: { where: { userId: string } }): Promise<{ count: number }>;
}

/** Klien atau transaksi — keduanya punya delegate model yang sama bentuknya. */
type TxLike = Record<string, unknown>;

/**
 * Ambil delegate model berdasarkan namanya. Akses by-name diperlukan karena
 * daftar tabel adalah DATA (lihat TABEL_DIHAPUS) — menuliskannya sebagai
 * sepuluh pemanggilan literal akan membuat penjaga kelengkapan tidak punya
 * apa pun untuk diperiksa.
 */
function delegasi(klien: unknown, nama: string): DelegateLike {
  const delegate = (klien as Record<string, DelegateLike | undefined>)[nama];
  if (delegate === undefined) {
    throw new Error(`Model Prisma "${nama}" tidak dikenal — periksa TABEL_DIHAPUS`);
  }
  return delegate;
}

export type PurgeService = ReturnType<typeof createPurgeService>;
