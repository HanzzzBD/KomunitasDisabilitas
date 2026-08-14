// modules/accessibility — service preferensi aksesibilitas (PR-034, ADR-008).
//
// Aturan yang mengikat seluruh file, sama dengan `modules/users`: userId SELALU
// datang dari sesi, TIDAK PERNAH dari input. Service ini tidak punya parameter
// untuk menyebut pengguna lain — bukan pemeriksaan yang bisa lupa dipasang,
// melainkan saluran yang tidak ada.
//
// Bentuk, batas nilai, dan bawaannya dibaca dari `@nawasena/schemas`, tidak
// ditulis ulang di sini (AC "satu sumber kebenaran"): daftar field kedua yang
// bebas menyimpang adalah persis cara preferensi aksesibilitas mulai berbeda
// antara klien dan server tanpa ada yang mengubah apa pun.
import {
  ACCESSIBILITY_DEFAULTS,
  type AccessibilityPreferences,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
import type {
  AccessibilityProfileRow,
  AccessibilityRepository,
} from "../repositories/accessibility.repository.js";

/** Konteks pemanggil — bentuknya sama dengan `UsersActor` (PR-020). */
export interface AccessibilityActor {
  userId: string;
  requestId: string;
}

export interface AccessibilityServiceDeps {
  accessibilityRepository: AccessibilityRepository;
}

/**
 * Baris DB → kontrak API. Pemetaan eksplisit, bukan spread: andai repository
 * kelak ikut membawa kolom baru (`userId`, `updatedAt`), kolom itu tetap tidak
 * punya jalan keluar dari sini.
 */
function kePreferensi(row: AccessibilityProfileRow): AccessibilityPreferences {
  return {
    textScale: row.textScale,
    highContrast: row.highContrast,
    reduceMotion: row.reduceMotion,
    simpleLanguage: row.simpleLanguage,
    prefersSignLanguage: row.prefersSignLanguage,
    largeTouchTargets: row.largeTouchTargets,
    screenReaderHint: row.screenReaderHint,
  };
}

export function createAccessibilityService(deps: AccessibilityServiceDeps) {
  const { accessibilityRepository } = deps;

  return {
    /**
     * GET /me/accessibility — preferensi pemilik sesi.
     *
     * Baris yang belum ada BUKAN kesalahan: penyediaan awal berjalan lewat event
     * yang tidak ditunggu penerbitnya, jadi permintaan yang datang beberapa
     * milidetik setelah registrasi wajar menemukannya belum ada. Yang dijawab
     * adalah ACCESSIBILITY_DEFAULTS — nilainya sama persis dengan yang akan
     * ditulis penyediaan awal, jadi pengguna tidak pernah melihat dua tampilan
     * berbeda tanpa mengubah apa pun.
     *
     * TIDAK menulis apa pun. Endpoint baca yang diam-diam menulis akan berlomba
     * dengan pelanggan event atas kunci primer yang sama, dan menambah cabang
     * tulis pada jalur baca tanpa satu pun perbedaan perilaku yang didapat.
     * Yang menulis hanya PUT.
     */
    async getMe(actor: AccessibilityActor): Promise<AccessibilityPreferences> {
      const row = await accessibilityRepository.findByUserId(actor.userId);
      if (row === null) return { ...ACCESSIBILITY_DEFAULTS };
      return kePreferensi(row);
    },

    /**
     * PUT /me/accessibility — simpan perubahan sebagian.
     *
     * Idempoten: mengirim badan yang sama sekali atau sepuluh kali berakhir pada
     * keadaan yang sama, sebab yang dikirim adalah nilai akhir yang diinginkan,
     * bukan selisih. Panggilan pertama pada pengguna tanpa baris membuat barisnya
     * — dengan bawaan untuk field yang tidak disebut.
     */
    async updateMe(
      actor: AccessibilityActor,
      patch: UpdateAccessibilityPreferences,
    ): Promise<AccessibilityPreferences> {
      return kePreferensi(await accessibilityRepository.upsertByUserId(actor.userId, patch));
    },

    /**
     * Penyediaan awal saat akun baru lahir — dipanggil pelanggan event
     * `auth.user_registered` (lihat index.ts modul ini).
     *
     * Patch KOSONG dengan sengaja: baris yang sudah ada tidak boleh dikembalikan
     * ke bawaan. Andai event yang sama terbit dua kali untuk satu pengguna —
     * yang seharusnya tidak terjadi, sebab penerbitnya bergantung pada `isNew` —
     * panggilan kedua tidak mengubah apa pun.
     */
    async provisionDefaults(userId: string): Promise<void> {
      await accessibilityRepository.upsertByUserId(userId, {});
    },
  };
}

export type AccessibilityService = ReturnType<typeof createAccessibilityService>;
