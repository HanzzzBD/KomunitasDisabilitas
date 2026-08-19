// Domain: accessibility — profil preferensi aksesibilitas (PR-026, ADR-008).
//
// Ini kontrak yang dipakai TIGA sisi: store klien (`@nawasena/a11y`), endpoint
// sinkron server (PR-034), dan panel preferensi (PR-036). Ditulis sekali di
// sini supaya ketiganya tidak pernah punya versi sendiri-sendiri.
//
// Sumber kebenaran bentuknya adalah tabel `accessibility_profiles`
// (schema.prisma, migrasi 02) — bukan SDD §4.3, yang menyebut ENAM preferensi
// sementara tabelnya punya TUJUH. Yang tidak disebut SDD: `screenReaderHint`.
// CLAUDE.md §12 menetapkan Prisma sebagai sumber kebenaran skema, jadi ketujuhnya
// masuk. Selisih itu dicatat, bukan didiamkan.
import "zod-openapi/extend";
import { z } from "zod";

/**
 * Skala teks dalam persen; 100 = ukuran normal.
 *
 * Batas atas 200 bukan angka selera: WCAG 2.2 §1.4.4 (Resize Text) menuntut
 * teks dapat diperbesar sampai 200% tanpa kehilangan konten atau fungsi. Itu
 * ambang yang harus kita penuhi, jadi itu pula batas yang kita sediakan.
 *
 * Tidak ada nilai di bawah 100. Mengecilkan teks tidak melayani satu pun
 * kebutuhan aksesibilitas, dan menyediakannya hanya membuka jalan bagi setelan
 * yang membuat produk ini justru lebih sulit dibaca.
 */
export const textScaleSchema = z
  .number()
  .int({ message: "Skala teks harus bilangan bulat" })
  .min(100, { message: "Skala teks minimal 100 persen" })
  .max(200, { message: "Skala teks maksimal 200 persen" })
  .openapi({ description: "Skala teks dalam persen (100 = normal, maks 200 — WCAG 1.4.4)" });

/**
 * Preferensi aksesibilitas pengguna (ADR-008).
 *
 * Seluruh field WAJIB ada dan punya nilai bawaan yang jelas: profil yang
 * sebagian kosong memaksa setiap pemakai menebak apa arti "tidak diisi", dan
 * tebakan yang berbeda antar-layar adalah persis cara preferensi aksesibilitas
 * berhenti dipercaya.
 *
 * Untuk perubahan sebagian, pakai `updateAccessibilityPreferencesSchema`.
 */
export const accessibilityPreferencesSchema = z
  .object({
    textScale: textScaleSchema,
    /** Kontras tinggi — dipetakan ke `data-contrast="high"` di web. */
    highContrast: z.boolean(),
    /** Kurangi animasi — `data-motion="reduced"`; juga menghormati OS. */
    reduceMotion: z.boolean(),
    /** Mode teks sederhana — memilih varian `id-simple` di katalog i18n (PR-029). */
    simpleLanguage: z.boolean(),
    /** Utamakan konten BISINDO bila tersedia (SignBridge, Fase 2–3). */
    prefersSignLanguage: z.boolean(),
    /** Target sentuh besar — 56 px alih-alih 44 px (SDD §4.3). */
    largeTouchTargets: z.boolean(),
    /**
     * Pengguna menyatakan memakai screen reader.
     *
     * PETUNJUK, bukan deteksi: browser tidak menyediakan cara mendeteksi screen
     * reader, dan setiap upaya menebaknya (mengukur perilaku fokus, waktu baca)
     * adalah sidik jari pengguna yang tidak boleh kita kumpulkan. Field ini
     * hanya terisi bila pengguna sendiri yang menyatakannya.
     */
    screenReaderHint: z.boolean(),
  })
  .openapi({ ref: "AccessibilityPreferences", description: "Profil preferensi aksesibilitas" });

export type AccessibilityPreferences = z.infer<typeof accessibilityPreferencesSchema>;

/**
 * Perubahan sebagian — dipakai `PUT /api/v1/me/accessibility` (PR-034) dan
 * penyimpanan pilihan eksplisit pengguna di klien (PR-026).
 *
 * `.strict()`: field asing DITOLAK, bukan diabaikan. Preferensi yang salah tulis
 * lalu dibuang diam-diam akan tampak "tersimpan" bagi pengguna sementara
 * layarnya tidak berubah — kegagalan yang sangat sulit dilaporkan.
 */
export const updateAccessibilityPreferencesSchema = accessibilityPreferencesSchema
  .partial()
  .strict()
  .openapi({ ref: "UpdateAccessibilityPreferences" });

export type UpdateAccessibilityPreferences = z.infer<typeof updateAccessibilityPreferencesSchema>;

/**
 * Nilai bawaan — HARUS sama dengan `@default` di `schema.prisma`.
 *
 * Bawaan yang berbeda antara klien dan server berarti pengguna baru melihat
 * satu tampilan sebelum sinkron dan tampilan lain sesudahnya, tanpa pernah
 * mengubah apa pun. Dijaga test di PR-034 saat endpoint sinkronnya lahir.
 */
export const ACCESSIBILITY_DEFAULTS: AccessibilityPreferences = {
  textScale: 100,
  highContrast: false,
  reduceMotion: false,
  simpleLanguage: false,
  prefersSignLanguage: false,
  largeTouchTargets: false,
  screenReaderHint: false,
};

/**
 * GET/PUT /api/v1/me/accessibility — response 200.
 *
 * PEMBUNGKUS `{ data }`, BUKAN preferensi telanjang. Controller PR-034 menjawab
 * `res.status(200).json({ data: … })` pada kedua endpoint, persis seperti
 * `meResponseSchema` membungkus `meSchema`. Klien yang memarse
 * `accessibilityPreferencesSchema` langsung atas badan HTTP akan menolak SETIAP
 * jawaban yang benar — dan kegagalannya baru muncul di produksi, sebab fixture
 * test yang ditulis tangan cenderung mengikuti skema yang salah itu.
 *
 * Tanpa `.strict()` di lapisan luar, dengan sengaja: pembungkus yang lebih
 * sempit daripada jawaban server berarti field envelope yang ditambahkan kelak
 * (mis. `meta`) meruntuhkan seluruh pemanggilan alih-alih diabaikan.
 */
export const accessibilityResponseSchema = z
  .object({ data: accessibilityPreferencesSchema })
  .openapi({ ref: "AccessibilityResponse" });

export type AccessibilityResponse = z.infer<typeof accessibilityResponseSchema>;
