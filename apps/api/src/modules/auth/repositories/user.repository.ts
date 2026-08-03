// modules/auth — repository akun untuk login OTP (find-or-create).
//
// Hanya modul auth yang boleh menyentuh tabel users dari sini; modul lain
// memakai service (aturan boundaries PR-002).
import { Prisma, type PrismaClient } from "@prisma/client";
import { uuidV7 } from "../../../core/ids/index.js";

export interface AuthUserResult {
  id: string;
  /** true bila baris baru dibuat pada panggilan ini. */
  isNew: boolean;
}

/** Kode Prisma untuk pelanggaran unique constraint. */
const UNIQUE_VIOLATION = "P2002";

export function createAuthUserRepository(prisma: PrismaClient) {
  /**
   * Akun aktif dengan nomor tsb. `deletedAt: null` WAJIB: unique index nomor
   * bersifat parsial (PR-009) sehingga nomor akun terhapus boleh dipakai ulang.
   */
  async function findActiveByPhone(phone: string): Promise<{ id: string } | null> {
    return prisma.user.findFirst({ where: { phone, deletedAt: null }, select: { id: true } });
  }

  return {
    findActiveByPhone,

    /**
     * Cari akun aktif; buat bila belum ada. Dua verifikasi bersamaan untuk
     * nomor yang sama bisa lolos pemeriksaan pertama — unique index parsial
     * menjadi wasit, dan pihak yang kalah membaca ulang baris pemenang.
     *
     * `fullName` sengaja kosong: login OTP tidak menanyakan nama. Pengguna
     * mengisinya pada onboarding (PUT /me, PR-020).
     */
    async findOrCreateByPhone(phone: string): Promise<AuthUserResult> {
      const existing = await findActiveByPhone(phone);
      if (existing !== null) return { id: existing.id, isNew: false };

      try {
        const created = await prisma.user.create({
          data: { id: uuidV7(), phone, fullName: "" },
          select: { id: true },
        });
        return { id: created.id, isNew: true };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
          const winner = await findActiveByPhone(phone);
          if (winner !== null) return { id: winner.id, isNew: false };
        }
        throw err;
      }
    },
  };
}

export type AuthUserRepository = ReturnType<typeof createAuthUserRepository>;
