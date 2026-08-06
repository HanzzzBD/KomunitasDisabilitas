// modules/users — repository profil akun (PR-020).
//
// Modul `auth` punya repository-nya sendiri di atas tabel yang sama, dan itu
// disengaja: query di sana adalah query LOGIN (find-or-create by phone/google,
// bump token version) yang tidak boleh terjangkau dari jalur profil. Yang
// dibagi adalah tabelnya, bukan kemampuannya. Antar-modul tetap dilarang saling
// meng-import repository (aturan boundaries PR-002).
//
// SEMUA query WAJIB menyaring `deletedAt: null`: unique index nomor, google_id,
// dan email bersifat PARSIAL, jadi baris terhapus boleh menyimpan nilai yang
// sama dan akan menjadi kembar bila ikut terbaca.
import { Prisma, type PrismaClient, type Role } from "@prisma/client";

/** Baris profil apa adanya dari DB; pemetaan ke kontrak API ada di service. */
export interface UserProfileRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  createdAt: Date;
}

/** Kolom yang dibaca — daftar eksplisit, bukan `select: *`. Kolom internal
 *  (tokenVersion, googleId, deletedAt) tidak boleh ikut terbawa tanpa sengaja. */
const KOLOM_PROFIL = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
} as const;

/** Kode Prisma untuk pelanggaran unique constraint. */
const UNIQUE_VIOLATION = "P2002";
/** Kode Prisma saat update tidak menemukan baris yang cocok. */
const RECORD_NOT_FOUND = "P2025";

/** Dilempar saat email sudah dipakai akun aktif lain (migrasi 06). */
export class EmailSudahDipakaiError extends Error {
  constructor() {
    super("email sudah dipakai akun aktif lain");
    this.name = "EmailSudahDipakaiError";
  }
}

export function createUserProfileRepository(prisma: PrismaClient) {
  return {
    /** Profil akun aktif; null bila tidak ada atau sudah dihapus. */
    async findActiveById(id: string): Promise<UserProfileRow | null> {
      return prisma.user.findFirst({ where: { id, deletedAt: null }, select: KOLOM_PROFIL });
    },

    /**
     * Perbarui profil. Mengembalikan null bila akun tidak aktif lagi (dihapus
     * di antara guard dan tulis — jendelanya kecil, tetapi ada).
     *
     * `email: undefined` di `data` berarti kolom tidak disentuh; itu yang
     * membuat "tidak dikirim = tidak diubah" bekerja tanpa cabang query kedua.
     */
    async updateProfile(
      id: string,
      data: { fullName: string; email?: string | null },
    ): Promise<UserProfileRow | null> {
      try {
        return await prisma.user.update({
          // Filter non-unique di samping PK = extendedWhereUnique (GA Prisma 5).
          where: { id, deletedAt: null },
          data,
          select: KOLOM_PROFIL,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          // Wasitnya index parsial `users_email_aktif_key` (migrasi 06), bukan
          // pemeriksaan baca-lalu-tulis di aplikasi — dua permintaan bersamaan
          // dengan email sama tidak boleh sama-sama lolos.
          if (err.code === UNIQUE_VIOLATION) throw new EmailSudahDipakaiError();
          if (err.code === RECORD_NOT_FOUND) return null;
        }
        throw err;
      }
    },
  };
}

export type UserProfileRepository = ReturnType<typeof createUserProfileRepository>;
