// modules/profiles — repository profil pencari kerja (PR-037, PR-039, SDD §6.2).
//
// LAPISAN INI TIDAK PERNAH MELIHAT PLAINTEXT. `disabilityTypes` dan
// `accommodationNeeds` masuk dan keluar sebagai `Buffer` ciphertext apa adanya;
// enkripsi/dekripsinya milik service (core/crypto, ADR-007). Pembagian itu
// bukan selera: repository adalah lapisan yang paling sering di-mock, di-log,
// dan dibaca sambil lalu — plaintext yang lewat di sini adalah plaintext yang
// cepat atau lambat ikut tercetak.
//
// DUA JALUR BACA, DAN ITULAH INTI PR-039 (SDD §8.2). `findSafeByUserId`
// mengembalikan bentuk yang secara TIPE tidak punya tempat bagi kolom sensitif;
// `findSensitiveByUserId` mengembalikan barisnya utuh. Yang membuat pemisahan
// ini berarti bukan disiplin melainkan `select` yang berbeda: kolom yang tidak
// diminta tidak pernah meninggalkan PostgreSQL, jadi kebocoran lewat serialisasi
// tak sengaja pada jalur aman TIDAK MUNGKIN — datanya memang tidak ada di
// memori proses.
//
// Kapan memakai yang mana: docs/akses-data-sensitif.md.
//
// `userId` adalah PRIMARY KEY `seeker_profiles` (`@id` di schema.prisma), jadi
// `upsert()` cukup satu statement dan tidak mungkin ada dua baris per pengguna.
//
// Kolom `profile_embedding` (`Unsupported("vector(768)")`) sengaja tidak pernah
// disebut: Prisma Client tidak bisa membacanya, dan pemiliknya adalah repo
// matching lewat `$queryRaw` (PR-069).
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../../core/db/index.js";

/**
 * Bagian profil yang boleh dibaca siapa pun yang berhak melihat profil.
 *
 * `consentSensitiveAt` SENGAJA TIDAK ADA DI SINI meski ia bukan data disabilitas
 * itu sendiri. Tanggal consent menyatakan bahwa orang ini pernah menyetujui
 * penyimpanan data disabilitasnya — dan itu sudah cukup untuk menyimpulkan
 * sesuatu tentang dirinya. Metadata yang membocorkan kesimpulan yang sama dengan
 * datanya bukan metadata yang aman.
 */
export interface SafeProfileRow {
  headline: string | null;
  summary: string | null;
  city: string | null;
  province: string | null;
  openToRemote: boolean;
  disclosureDefault: "never" | "ask_each_time" | "always";
}

/** Baris apa adanya dari DB. Dua kolom terakhir CIPHERTEXT — jangan di-log. */
export interface SeekerProfileRow extends SafeProfileRow {
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

/** Kolom aman — daftar eksplisit, bukan `select: *`. */
const KOLOM_AMAN = {
  headline: true,
  summary: true,
  city: true,
  province: true,
  openToRemote: true,
  disclosureDefault: true,
} as const;

/** Kolom aman + yang sensitif. Hanya untuk jalur yang memang berhak. */
const KOLOM_SENSITIF = {
  ...KOLOM_AMAN,
  consentSensitiveAt: true,
  disabilityTypes: true,
  accommodationNeeds: true,
} as const;

export function createProfileRepository(prisma: AppPrisma) {
  return {
    /**
     * Profil satu pengguna TANPA satu pun kolom sensitif.
     *
     * Inilah jalur baku. Pemanggil yang tidak benar-benar membutuhkan data
     * disabilitas tidak boleh memakai jalur satunya — bukan karena ia akan
     * membocorkannya, melainkan karena setiap pemakaian jalur sensitif
     * meninggalkan baris audit, dan audit yang penuh pembacaan yang tidak perlu
     * berhenti berguna sebagai audit.
     */
    async findSafeByUserId(userId: string): Promise<SafeProfileRow | null> {
      return prisma.seekerProfile.findUnique({ where: { userId }, select: KOLOM_AMAN });
    },

    /**
     * Profil satu pengguna BESERTA kolom sensitifnya (masih ciphertext).
     *
     * TIDAK menulis audit — penulisannya milik service, sama seperti seluruh
     * audit lain di modul ini (PR-037). Yang menjaga fungsi ini tidak dipanggil
     * dari mana-mana adalah `__tests__/akses-sensitif-jangkauan.test.ts`:
     * jangkauannya dibatasi pada berkas yang memang berhak, dan berkas baru yang
     * menyentuhnya membuat build merah sampai seseorang memutuskan.
     */
    async findSensitiveByUserId(userId: string): Promise<SeekerProfileRow | null> {
      return prisma.seekerProfile.findUnique({ where: { userId }, select: KOLOM_SENSITIF });
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
     * `SELECT … FOR UPDATE` (PR-039) MENUTUP SISA JENDELANYA. PR-037
     * meninggalkan celah yang ditulis apa adanya: pada isolasi READ COMMITTED
     * (bawaan PostgreSQL) `SELECT` biasa tidak mengunci barisnya, jadi
     * pencabutan yang commit tepat di antara SELECT dan UPDATE masih bisa
     * terlewat. Dengan `FOR UPDATE`, transaksi kedua yang menyentuh baris yang
     * sama MENUNGGU sampai yang ini selesai, lalu membaca keadaan terbaru —
     * bukan keadaan yang sudah basi saat ia memutuskan.
     *
     * Raw SQL, bukan Prisma Client, karena Prisma tidak punya cara menyatakan
     * penguncian baris. Kolomnya disebut apa adanya (`user_id`,
     * `consent_sensitive_at`) — nama fisik, bukan nama Prisma.
     *
     * BARIS YANG BELUM ADA tidak bisa dikunci, dan itu tidak apa-apa: tidak ada
     * consent untuk dicabut pada baris yang belum lahir, dan `upsert` di
     * bawahnya akan menempuh jalur INSERT yang dijaga primary key.
     */
    async upsertByUserId(
      userId: string,
      patch: SeekerProfilePatch,
      opsi: { butuhConsent: boolean },
    ): Promise<HasilSimpan> {
      return prisma.$transaction(async (tx) => {
        if (opsi.butuhConsent) {
          const terkunci = await tx.$queryRaw<Array<{ consent_sensitive_at: Date | null }>>(
            Prisma.sql`SELECT consent_sensitive_at FROM seeker_profiles
              WHERE user_id = ${userId}::uuid FOR UPDATE`,
          );
          const kini = terkunci[0]?.consent_sensitive_at ?? null;
          const efektif =
            patch.consentSensitiveAt !== undefined ? patch.consentSensitiveAt : kini;
          if (efektif === null) return { ok: false };
        }

        const row = await tx.seekerProfile.upsert({
          where: { userId },
          update: patch,
          create: { userId, ...patch },
          select: KOLOM_SENSITIF,
        });
        return { ok: true, row };
      });
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
