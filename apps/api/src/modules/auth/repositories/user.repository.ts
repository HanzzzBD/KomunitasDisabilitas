// modules/auth — repository akun untuk login OTP & Google (find-or-create).
//
// Hanya modul auth yang boleh menyentuh tabel users dari sini; modul lain
// memakai service (aturan boundaries PR-002).
//
// SEMUA query login WAJIB menyaring `deletedAt: null`: unique index nomor dan
// google_id bersifat PARSIAL (PR-009), jadi baris terhapus boleh menyimpan
// nilai yang sama dan akan menjadi kembar bila ikut terbaca.
import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { uuidV7 } from "../../../core/ids/index.js";

export interface AuthUserResult {
  id: string;
  /** true bila baris baru dibuat pada panggilan ini. */
  isNew: boolean;
}

/** Kode Prisma untuk pelanggaran unique constraint. */
const UNIQUE_VIOLATION = "P2002";
/** Kode Prisma saat update/delete tidak menemukan baris yang cocok. */
const RECORD_NOT_FOUND = "P2025";

export function createAuthUserRepository(prisma: PrismaClient) {
  /**
   * Akun aktif dengan nomor tsb. `deletedAt: null` WAJIB: unique index nomor
   * bersifat parsial (PR-009) sehingga nomor akun terhapus boleh dipakai ulang.
   */
  async function findActiveByPhone(phone: string): Promise<{ id: string } | null> {
    return prisma.user.findFirst({ where: { phone, deletedAt: null }, select: { id: true } });
  }

  /** Akun aktif yang sudah tertaut ke identitas Google tsb. */
  async function findActiveByGoogleId(googleId: string): Promise<{ id: string } | null> {
    return prisma.user.findFirst({ where: { googleId, deletedAt: null }, select: { id: true } });
  }

  return {
    findActiveByPhone,
    findActiveByGoogleId,

    /**
     * Data yang dibutuhkan untuk menerbitkan/memperbarui sesi (PR-018a).
     * `deletedAt: null` WAJIB di sini juga: refresh token milik akun yang sudah
     * dihapus tidak boleh menghidupkan sesi baru.
     */
    async findActiveSessionUser(
      id: string,
    ): Promise<{ id: string; role: Role; tokenVersion: number } | null> {
      return prisma.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, role: true, tokenVersion: true },
      });
    },

    /**
     * Naikkan `ver` satu langkah — kill-switch sesi (SDD §8.1). Setelah ini
     * SETIAP access token lama ditolak verifikasinya, tanpa perlu menunggu
     * 15 menit dan tanpa daftar token yang harus disisir.
     *
     * Increment dilakukan di DB (`increment`), bukan baca-lalu-tulis di
     * aplikasi: dua pencabutan bersamaan tidak boleh saling menimpa sehingga
     * salah satunya diam-diam tidak berlaku.
     */
    async bumpTokenVersion(id: string): Promise<number | null> {
      try {
        const row = await prisma.user.update({
          // Filter non-unique di samping PK = extendedWhereUnique (GA Prisma 5).
          where: { id, deletedAt: null },
          data: { tokenVersion: { increment: 1 } },
          select: { tokenVersion: true },
        });
        return row.tokenVersion;
      } catch (err) {
        // P2025 = tidak ada baris aktif dengan id itu; bukan kondisi error.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === RECORD_NOT_FOUND) {
          return null;
        }
        throw err;
      }
    },

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

    /**
     * Login Google (PR-017). Tiga jalur, diurutkan dari yang paling tepercaya:
     *
     * 1. `google_id` cocok → akun yang sama, selalu. Inilah yang membuat login
     *    kedua dan seterusnya mendarat di akun yang sama meski email di Google
     *    berganti.
     * 2. email cocok → TAUTKAN akun yang sudah ada (mis. dibuat lewat OTP lalu
     *    mengisi email di PUT /me). Aman HANYA karena pemanggil sudah menolak
     *    `email_verified !== true`: tanpa syarat itu langkah ini adalah jalan
     *    masuk account takeover.
     * 3. tidak keduanya → akun baru.
     *
     * `email` sengaja TIDAK punya unique index (skema PR-009), jadi langkah 2
     * tidak punya wasit di tingkat DB. Itu tidak masalah di sini: dua login
     * bersamaan dengan email sama pasti membawa `google_id` yang sama pula
     * (satu email terverifikasi hanya melekat pada satu akun Google), sehingga
     * keduanya menulis nilai yang identik. Balapan pembuatan akun baru diwasiti
     * unique index parsial `google_id`.
     */
    async findOrCreateByGoogle(identity: {
      googleId: string;
      email: string;
      fullName: string;
    }): Promise<AuthUserResult> {
      const { googleId, email, fullName } = identity;

      const tertaut = await findActiveByGoogleId(googleId);
      if (tertaut !== null) return { id: tertaut.id, isNew: false };

      const seemail = await prisma.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true, fullName: true },
      });
      if (seemail !== null) {
        await prisma.user.update({
          where: { id: seemail.id },
          data: {
            googleId,
            // Nama yang sudah diisi pengguna TIDAK ditimpa; yang kosong (akun
            // hasil login OTP) diisi dari Google agar tidak perlu mengetik lagi.
            ...(seemail.fullName === "" ? { fullName } : {}),
          },
        });
        return { id: seemail.id, isNew: false };
      }

      try {
        const created = await prisma.user.create({
          data: { id: uuidV7(), googleId, email, fullName },
          select: { id: true },
        });
        return { id: created.id, isNew: true };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
          const winner = await findActiveByGoogleId(googleId);
          if (winner !== null) return { id: winner.id, isNew: false };
        }
        throw err;
      }
    },
  };
}

export type AuthUserRepository = ReturnType<typeof createAuthUserRepository>;
