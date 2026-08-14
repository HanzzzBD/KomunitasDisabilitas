// modules/accessibility — repository preferensi aksesibilitas (PR-034, ADR-008).
//
// Tabel `accessibility_profiles` sudah ada sejak PR-009; PR ini tidak
// mengubah bentuknya sama sekali. Yang lahir di sini hanyalah dua query.
//
// `userId` adalah PRIMARY KEY tabel ini (`@id` di schema.prisma), bukan sekadar
// kolom unik. Itulah yang membuat `upsert()` di bawah cukup satu statement:
// tidak ada jendela baca-lalu-tulis yang bisa disusupi permintaan kedua, dan
// tidak mungkin ada dua baris untuk satu pengguna.
import { ACCESSIBILITY_DEFAULTS, type UpdateAccessibilityPreferences } from "@nawasena/schemas";
import type { AppPrisma } from "../../../core/db/index.js";

/** Baris apa adanya dari DB; pemetaan ke kontrak API ada di service. */
export interface AccessibilityProfileRow {
  textScale: number;
  highContrast: boolean;
  reduceMotion: boolean;
  simpleLanguage: boolean;
  prefersSignLanguage: boolean;
  largeTouchTargets: boolean;
  screenReaderHint: boolean;
}

/** Kolom yang dibaca — daftar eksplisit, bukan `select: *`. `userId` dan
 *  `updatedAt` sengaja di luar: keduanya tidak pernah keluar sebagai response. */
const KOLOM_PREFERENSI = {
  textScale: true,
  highContrast: true,
  reduceMotion: true,
  simpleLanguage: true,
  prefersSignLanguage: true,
  largeTouchTargets: true,
  screenReaderHint: true,
} as const;

export function createAccessibilityRepository(prisma: AppPrisma) {
  return {
    /** Preferensi milik satu pengguna; null bila barisnya belum pernah ada. */
    async findByUserId(userId: string): Promise<AccessibilityProfileRow | null> {
      return prisma.accessibilityProfile.findUnique({
        where: { userId },
        select: KOLOM_PREFERENSI,
      });
    },

    /**
     * Simpan perubahan SEBAGIAN; buat barisnya bila belum ada.
     *
     * `update: patch` — field yang tidak dikirim tidak disebut sama sekali,
     * jadi Prisma tidak menyentuh kolomnya. Itu yang membuat PUT bersifat
     * gabung, bukan ganti seluruhnya.
     *
     * `create` menyertakan ACCESSIBILITY_DEFAULTS di bawah patch meski kolomnya
     * punya `@default` di DB: bawaan yang dijanjikan kontrak (`packages/schemas`)
     * dan bawaan yang ada di migrasi adalah dua tulisan berbeda, dan satu-satunya
     * cara memastikan keduanya sama adalah menuliskan yang dari kontrak.
     *
     * Dipakai DUA pemanggil: PUT (patch berisi) dan penyediaan awal saat
     * registrasi (patch kosong → `update: {}`, yaitu no-op bila baris sudah ada).
     */
    async upsertByUserId(
      userId: string,
      patch: UpdateAccessibilityPreferences,
    ): Promise<AccessibilityProfileRow> {
      return prisma.accessibilityProfile.upsert({
        where: { userId },
        update: patch,
        create: { userId, ...ACCESSIBILITY_DEFAULTS, ...patch },
        select: KOLOM_PREFERENSI,
      });
    },
  };
}

export type AccessibilityRepository = ReturnType<typeof createAccessibilityRepository>;
