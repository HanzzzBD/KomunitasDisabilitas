// modules/profiles — repository profil pencari kerja (PR-037, SDD §6.2).
//
// LAPISAN INI TIDAK PERNAH MELIHAT PLAINTEXT. `disabilityTypes` dan
// `accommodationNeeds` masuk dan keluar sebagai `Buffer` ciphertext apa adanya;
// enkripsi/dekripsinya milik service (core/crypto, ADR-007). Pembagian itu
// bukan selera: repository adalah lapisan yang paling sering di-mock, di-log,
// dan dibaca sambil lalu — plaintext yang lewat di sini adalah plaintext yang
// cepat atau lambat ikut tercetak.
//
// `userId` adalah PRIMARY KEY `seeker_profiles` (`@id` di schema.prisma), jadi
// `upsert()` cukup satu statement dan tidak mungkin ada dua baris per pengguna.
//
// Kolom `profile_embedding` (`Unsupported("vector(768)")`) sengaja tidak pernah
// disebut: Prisma Client tidak bisa membacanya, dan pemiliknya adalah repo
// matching lewat `$queryRaw` (PR-069).
import type { AppPrisma } from "../../../core/db/index.js";

/** Baris apa adanya dari DB. Dua kolom terakhir CIPHERTEXT — jangan di-log. */
export interface SeekerProfileRow {
  headline: string | null;
  summary: string | null;
  city: string | null;
  province: string | null;
  openToRemote: boolean;
  disclosureDefault: "never" | "ask_each_time" | "always";
  /** Bukti consent eksplisit; null = belum/tidak lagi berlaku. */
  consentSensitiveAt: Date | null;
  disabilityTypes: Buffer | null;
  accommodationNeeds: Buffer | null;
}

/**
 * Perubahan sebagian pada satu baris.
 *
 * Field yang TIDAK disebut tidak disentuh sama sekali (itulah yang membuat PUT
 * bersifat gabung); field bernilai `null` benar-benar mengosongkan kolomnya.
 */
export interface SeekerProfilePatch {
  headline?: string | null;
  summary?: string | null;
  city?: string | null;
  province?: string | null;
  openToRemote?: boolean;
  disclosureDefault?: "never" | "ask_each_time" | "always";
  consentSensitiveAt?: Date | null;
  disabilityTypes?: Buffer | null;
  accommodationNeeds?: Buffer | null;
}

/** Hasil tulis: `ok: false` HANYA saat penjaga consent menolak (lihat di bawah). */
export type HasilSimpan = { ok: true; row: SeekerProfileRow } | { ok: false };

/** Kolom yang dibaca — daftar eksplisit, bukan `select: *`. */
const KOLOM_PROFIL = {
  headline: true,
  summary: true,
  city: true,
  province: true,
  openToRemote: true,
  disclosureDefault: true,
  consentSensitiveAt: true,
  disabilityTypes: true,
  accommodationNeeds: true,
} as const;

export function createProfileRepository(prisma: AppPrisma) {
  return {
    /** Profil milik satu pengguna; null bila barisnya belum pernah ada. */
    async findByUserId(userId: string): Promise<SeekerProfileRow | null> {
      return prisma.seekerProfile.findUnique({ where: { userId }, select: KOLOM_PROFIL });
    },

    /**
     * Simpan perubahan sebagian; buat barisnya bila belum ada.
     *
     * `butuhConsent` menyalakan PENJAGA TULIS: bila menyala, baris hanya ditulis
     * bila consent berlaku SETELAH patch ini diterapkan — yaitu
     * `patch.consentSensitiveAt` bila permintaan ini sendiri yang memberi
     * consent, atau nilai yang sudah tersimpan bila tidak. Penolakan
     * dikembalikan sebagai `{ ok: false }`, bukan exception: "belum consent"
     * adalah jawaban yang sah dari lapisan ini, dan menerjemahkannya menjadi 403
     * berbahasa Indonesia adalah pekerjaan service.
     *
     * KENAPA DI DALAM TRANSAKSI, dan bukan sekadar diperiksa di service. Tanpa
     * ini, urutannya adalah baca-consent → (bolak-balik jaringan) → tulis; dan
     * pencabutan consent yang mendarat di tengah jendela itu akan tertimpa oleh
     * tulisan yang sudah terlanjur lolos gerbang. Hasilnya baris berisi data
     * disabilitas TANPA consent yang berlaku — persis keadaan yang tidak boleh
     * ada.
     *
     * BATAS YANG TERSISA, ditulis alih-alih didiamkan: pada isolasi READ
     * COMMITTED (bawaan PostgreSQL) `SELECT` di bawah tidak mengunci barisnya,
     * jadi pencabutan yang commit tepat di antara SELECT dan UPDATE masih bisa
     * terlewat. Jendelanya kini mikrodetik di dalam satu transaksi, bukan satu
     * putaran permintaan HTTP, dan kedua permintaan itu harus datang dari
     * pengguna yang sama pada saat yang sama. Menutupnya sepenuhnya menuntut
     * `SELECT … FOR UPDATE` lewat raw SQL — biaya yang belum sebanding, dan
     * akan menjadi sebanding di PR-039 saat jalur sensitif dipusatkan.
     */
    async upsertByUserId(
      userId: string,
      patch: SeekerProfilePatch,
      opsi: { butuhConsent: boolean },
    ): Promise<HasilSimpan> {
      return prisma.$transaction(async (tx) => {
        if (opsi.butuhConsent) {
          const kini = await tx.seekerProfile.findUnique({
            where: { userId },
            select: { consentSensitiveAt: true },
          });
          const efektif =
            patch.consentSensitiveAt !== undefined
              ? patch.consentSensitiveAt
              : (kini?.consentSensitiveAt ?? null);
          if (efektif === null) return { ok: false };
        }

        const row = await tx.seekerProfile.upsert({
          where: { userId },
          update: patch,
          create: { userId, ...patch },
          select: KOLOM_PROFIL,
        });
        return { ok: true, row };
      });
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
