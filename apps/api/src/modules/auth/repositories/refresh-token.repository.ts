// modules/auth — repository refresh token rotating (PR-018a, SDD §8.1).
//
// Model keluarga (family): satu login = satu `familyId`. Setiap rotasi mencabut
// baris lama dan menambah baris baru DENGAN familyId yang sama, jadi seluruh
// keturunan satu login bisa dicabut sekaligus saat reuse terdeteksi.
//
// Token mentah TIDAK PERNAH menyentuh file ini — hanya SHA-256-nya (kolom
// token_hash, unique). Bocornya isi tabel tidak memberi token yang bisa dipakai.
import type { PrismaClient } from "@prisma/client";
import { uuidV7 } from "../../../core/ids/index.js";

export interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  /** non-null = sudah dicabut; dipakai ulang berarti REUSE. */
  revokedAt: Date | null;
}

export interface RefreshTokenInsert {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export function createRefreshTokenRepository(prisma: PrismaClient) {
  return {
    /** Simpan refresh baru (login baru atau hasil rotasi). */
    async insert(input: RefreshTokenInsert): Promise<string> {
      const row = await prisma.refreshToken.create({
        data: { id: uuidV7(), ...input },
        select: { id: true },
      });
      return row.id;
    },

    async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
      return prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, familyId: true, expiresAt: true, revokedAt: true },
      });
    },

    /**
     * Rotasi ATOMIK: cabut baris lama + terbitkan penggantinya dalam satu
     * transaksi. Dua sifat yang membuat ini benar:
     *
     * 1. `revokedAt: null` ada di klausa WHERE, bukan hanya diperiksa lebih
     *    dahulu di service. Dua permintaan yang membawa refresh SAMA dan tiba
     *    bersamaan akan sama-sama lolos pemeriksaan itu; yang menentukan
     *    pemenangnya adalah UPDATE ini — yang kalah mendapat count 0 dan
     *    mengembalikan `null`, bukan sepasang token kembar yang sah.
     * 2. Bila insert gagal, pencabutan ikut batal — pengguna tidak kehilangan
     *    sesinya karena kegagalan tulis di tengah jalan.
     *
     * `null` = kalah balapan ATAU baris sudah dicabut duluan; pemanggil
     * memperlakukannya sebagai penolakan, bukan error server.
     */
    async rotate(input: {
      currentId: string;
      nextTokenHash: string;
      nextExpiresAt: Date;
      userId: string;
      familyId: string;
      now: Date;
    }): Promise<string | null> {
      return prisma.$transaction(async (tx) => {
        const dicabut = await tx.refreshToken.updateMany({
          where: { id: input.currentId, revokedAt: null },
          data: { revokedAt: input.now },
        });
        if (dicabut.count === 0) return null;

        const row = await tx.refreshToken.create({
          data: {
            id: uuidV7(),
            userId: input.userId,
            familyId: input.familyId,
            tokenHash: input.nextTokenHash,
            expiresAt: input.nextExpiresAt,
          },
          select: { id: true },
        });
        return row.id;
      });
    },

    /**
     * Cabut SELURUH keluarga — respons atas reuse terdeteksi. Sengaja tidak
     * pandang bulu: bila satu token keluarga ini beredar di tangan penyerang,
     * kita tidak tahu cabang mana yang miliknya, jadi seluruh cabang dimatikan
     * dan pengguna diminta masuk lagi.
     */
    async revokeFamily(familyId: string, now: Date): Promise<number> {
      const hasil = await prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      return hasil.count;
    },

    /** Cabut semua sesi milik satu pengguna (logout semua perangkat). */
    async revokeAllForUser(userId: string, now: Date): Promise<number> {
      const hasil = await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return hasil.count;
    },
  };
}

export type RefreshTokenRepository = ReturnType<typeof createRefreshTokenRepository>;
