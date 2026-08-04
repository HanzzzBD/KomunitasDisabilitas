// modules/auth — repository refresh token rotating (PR-018a, SDD §8.1).
//
// Model keluarga (family): satu login = satu `familyId`. Setiap rotasi mencabut
// baris lama dan menambah baris baru DENGAN familyId yang sama, jadi seluruh
// keturunan satu login bisa dicabut sekaligus saat reuse terdeteksi.
//
// Token mentah TIDAK PERNAH menyentuh file ini — hanya SHA-256-nya (kolom
// token_hash, unique). Bocornya isi tabel tidak memberi token yang bisa dipakai.
import type { PrismaClient, RefreshRevokedReason } from "@prisma/client";
import { uuidV7 } from "../../../core/ids/index.js";

export type { RefreshRevokedReason };

export interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  /** non-null = sudah dicabut. Sebabnya menentukan apakah ini reuse. */
  revokedAt: Date | null;
  /**
   * NULL untuk baris aktif — dan juga untuk baris yang dicabut SEBELUM kolom
   * ini ada (PR-018a). Pemanggil memperlakukan NULL pada baris tercabut
   * sebagai `rotated`: itulah satu-satunya sebab pencabutan yang mungkin
   * sebelum logout ada.
   */
  revokedReason: RefreshRevokedReason | null;
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
        select: {
          id: true,
          userId: true,
          familyId: true,
          expiresAt: true,
          revokedAt: true,
          revokedReason: true,
        },
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
          // 'rotated' = alur normal. Inilah SATU-SATUNYA sebab yang membuat
          // pemakaian ulang berikutnya dibaca sebagai reuse.
          data: { revokedAt: input.now, revokedReason: "rotated" },
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
    /**
     * Tandai baris PEMICU reuse sebagai bukti insiden. `revokedAt` asli
     * dipertahankan — ia memang dicabut saat rotasi; yang berubah hanyalah apa
     * yang kemudian kita ketahui tentangnya.
     *
     * Perlu terpisah dari revokeFamily karena baris ini SUDAH tercabut,
     * sedangkan revokeFamily (benar) hanya menyentuh yang masih hidup. Tanpa
     * ini, justru token yang diputar ulang — bukti paling langsung dari
     * insiden — akan dibuang job retensi 180 hari (PR-024) sementara
     * saudara-saudaranya bertahan 2 tahun.
     */
    async markReuse(id: string): Promise<void> {
      await prisma.refreshToken.updateMany({ where: { id }, data: { revokedReason: "reuse" } });
    },

    async revokeFamily(
      familyId: string,
      now: Date,
      reason: RefreshRevokedReason,
    ): Promise<number> {
      const hasil = await prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: now, revokedReason: reason },
      });
      return hasil.count;
    },

    /** Cabut semua sesi milik satu pengguna (logout semua perangkat). */
    async revokeAllForUser(
      userId: string,
      now: Date,
      reason: RefreshRevokedReason,
    ): Promise<number> {
      const hasil = await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: reason },
      });
      return hasil.count;
    },
  };
}

export type RefreshTokenRepository = ReturnType<typeof createRefreshTokenRepository>;
