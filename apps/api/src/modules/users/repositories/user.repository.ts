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
import { Prisma, type Role } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";

/** Baris profil apa adanya dari DB; pemetaan ke kontrak API ada di service. */
export interface UserProfileRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  createdAt: Date;
}

/** Baris ekspor PDP: profil + dua kolom yang tidak tampil di UI (PR-022). */
export interface ExportAccountRow extends UserProfileRow {
  emailVerified: boolean;
  /** Dipakai HANYA untuk menurunkan daftar cara masuk; tidak pernah diekspor. */
  googleId: string | null;
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

export function createUserProfileRepository(prisma: AppPrisma) {
  return {
    /** Profil akun aktif; null bila tidak ada atau sudah dihapus. */
    async findActiveById(id: string): Promise<UserProfileRow | null> {
      return prisma.user.findFirst({ where: { id, deletedAt: null }, select: KOLOM_PROFIL });
    },

    /**
     * Baris untuk ekspor PDP (PR-022) — lebih luas daripada profil, sebab hak
     * portabilitas mencakup data yang tidak ditampilkan di UI.
     *
     * `googleId` ikut dibaca HANYA untuk diturunkan menjadi daftar cara masuk;
     * ia tidak pernah keluar dari service. `tokenVersion` dan `deletedAt` tetap
     * di luar: keduanya mekanik internal, bukan data pribadi siapa pun.
     */
    async findAccountForExport(id: string): Promise<ExportAccountRow | null> {
      return prisma.user.findFirst({
        where: { id, deletedAt: null },
        select: { ...KOLOM_PROFIL, emailVerified: true, googleId: true },
      });
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
          data: {
            fullName: data.fullName,
            ...(data.email === undefined
              ? {}
              : // Email yang DIKETIK SENDIRI tidak pernah terverifikasi — endpoint
                // ini tidak punya cara membuktikan pengguna memegang alamat itu
                // (PR-020a). Nilai false-nya yang membuat alamat ini tidak bisa
                // dipakai menautkan identitas Google siapa pun. Ditulis ulang
                // SETIAP kali email disentuh, termasuk saat dikosongkan: alamat
                // terverifikasi dari Google yang diganti manual kehilangan
                // statusnya, dan itu memang yang benar.
                { email: data.email, emailVerified: false }),
          },
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
