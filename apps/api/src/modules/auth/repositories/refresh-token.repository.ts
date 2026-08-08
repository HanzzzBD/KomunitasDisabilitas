// modules/auth — repository refresh token rotating (PR-018a, SDD §8.1).
//
// Model keluarga (family): satu login = satu `familyId`. Setiap rotasi mencabut
// baris lama dan menambah baris baru DENGAN familyId yang sama, jadi seluruh
// keturunan satu login bisa dicabut sekaligus saat reuse terdeteksi.
//
// Token mentah TIDAK PERNAH menyentuh file ini — hanya SHA-256-nya (kolom
// token_hash, unique). Bocornya isi tabel tidak memberi token yang bisa dipakai.
import type { RefreshRevokedReason } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";
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

/**
 * Kategori retensi `refresh_tokens` (PR-024a, SDD §6.4). Ambangnya BERBEDA
 * karena maknanya berbeda: `revoked` bukan setelan kebersihan storage
 * melainkan JENDELA DETEKSI REUSE, dan `reuse` disamakan dengan `audit_logs`
 * (2 tahun) sebab baris DB dan baris auditnya dua paruh bukti yang sama.
 */
export type RetentionKategori = "expired" | "revoked" | "reuse";

export interface RefreshTokenInsert {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

/**
 * Argumen `updateMany` untuk mencabut SEMUA sesi hidup milik satu pengguna.
 *
 * Diekspor karena hapus akun (PR-021) harus melakukannya di dalam transaksi
 * yang sama dengan `UPDATE users` — jadi ia memanggil `tx.refreshToken`
 * langsung, bukan lewat repository ini. Tanpa satu definisi bersama, akan ada
 * DUA tempat yang memutuskan apa artinya "dicabut", dan keduanya bebas
 * menyimpang: satu lupa `revokedAt: null` di where (mencabut ulang baris mati
 * dan merusak jejak sebabnya), satu lupa mengisi `revokedReason` (membuat
 * PR-024 salah menentukan retensi). Bentuk data yang salah pada tabel ini tidak
 * menimbulkan gejala apa pun sampai ada yang menyelidiki insiden.
 */
export function argumenCabutSemuaSesi(userId: string, now: Date, reason: RefreshRevokedReason) {
  return {
    // `revokedAt: null` WAJIB: baris yang sudah dicabut tidak boleh ditulis
    // ulang — sebab pencabutan pertamanya (mis. `reuse`) adalah buktinya.
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  };
}

export function createRefreshTokenRepository(prisma: AppPrisma) {
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

    /**
     * Baris yang memenuhi syarat hapus untuk satu kategori retensi (PR-024a).
     *
     * Ketiga predikat di bawah SALING LEPAS — sebuah baris tidak mungkin masuk
     * dua kategori. Itu bukan kerapian melainkan syarat kebenaran: kalau
     * `expired` juga menjaring baris yang DICABUT, token yang seharusnya
     * bertahan 180 hari akan hilang pada hari ke-90, dan reuse detection
     * (§8.1) berhenti bisa membedakan token curian dari token tak dikenal —
     * tanpa satu pun gejala.
     */
    async countRetention(kategori: RetentionKategori, cutoff: Date): Promise<number> {
      switch (kategori) {
        case "expired":
          return prisma.refreshToken.count({
            // `revokedAt: null` WAJIB: hanya token yang MATI SENDIRI karena
            // kedaluwarsa, tidak pernah dicabut, tidak membawa bukti apa pun.
            where: { revokedAt: null, expiresAt: { lt: cutoff } },
          });
        case "revoked":
          return prisma.refreshToken.count({
            where: {
              revokedAt: { not: null, lt: cutoff },
              // NULL diperlakukan sebagai `rotated` — satu-satunya sebab yang
              // mungkin sebelum kolomnya ada (PR-018a).
              NOT: { revokedReason: "reuse" },
            },
          });
        case "reuse":
          return prisma.refreshToken.count({
            where: { revokedReason: "reuse", revokedAt: { lt: cutoff } },
          });
      }
    },

    /**
     * Hapus paling banyak `batas` baris kategori tsb. Berbatch lewat subquery
     * `LIMIT` karena `deleteMany` Prisma tidak punya `take` — dan DELETE tanpa
     * batas pada tabel yang terus tumbuh mengunci lama serta menggelembungkan
     * WAL (SDD §6.4 catatan operasional).
     */
    async deleteRetentionBatch(kategori: RetentionKategori, cutoff: Date, batas: number): Promise<number> {
      switch (kategori) {
        case "expired":
          return prisma.$executeRaw`
            DELETE FROM "refresh_tokens" WHERE "id" IN (
              SELECT "id" FROM "refresh_tokens"
              WHERE "revoked_at" IS NULL AND "expires_at" < ${cutoff}
              LIMIT ${batas}
            )`;
        case "revoked":
          return prisma.$executeRaw`
            DELETE FROM "refresh_tokens" WHERE "id" IN (
              SELECT "id" FROM "refresh_tokens"
              WHERE "revoked_at" IS NOT NULL AND "revoked_at" < ${cutoff}
                AND ("revoked_reason" IS NULL OR "revoked_reason" <> 'reuse')
              LIMIT ${batas}
            )`;
        case "reuse":
          return prisma.$executeRaw`
            DELETE FROM "refresh_tokens" WHERE "id" IN (
              SELECT "id" FROM "refresh_tokens"
              WHERE "revoked_reason" = 'reuse' AND "revoked_at" < ${cutoff}
              LIMIT ${batas}
            )`;
      }
    },

    /** Cabut semua sesi milik satu pengguna (logout semua perangkat). */
    async revokeAllForUser(
      userId: string,
      now: Date,
      reason: RefreshRevokedReason,
    ): Promise<number> {
      const hasil = await prisma.refreshToken.updateMany(
        argumenCabutSemuaSesi(userId, now, reason),
      );
      return hasil.count;
    },
  };
}

export type RefreshTokenRepository = ReturnType<typeof createRefreshTokenRepository>;
