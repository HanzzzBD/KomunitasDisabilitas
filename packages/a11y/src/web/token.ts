// Menulis preferensi ke `<html>` sebagai token CSS — SDD §4.3:
//
//   --font-scale, --touch-target-min,
//   data-contrast="high", data-motion="reduced", data-lang-mode="simple"
//
// Kenapa lewat token di elemen akar, bukan lewat prop yang diturunkan ke tiap
// komponen: preferensi aksesibilitas harus berlaku pada SEMUA yang tampil,
// termasuk yang dirender di luar pohon React (portal, dialog native, konten
// pihak ketiga). Satu komponen yang lupa meneruskan prop adalah satu sudut
// layar yang mengabaikan pengguna.
import type { AccessibilityPreferences } from "@nawasena/schemas";

/** Target sentuh minimum, SDD §4.3 & WCAG 2.2 §2.5.8 (24px minimum absolut). */
export const TARGET_SENTUH_PX = { normal: 44, besar: 56 } as const;

/**
 * Nilai token untuk satu profil preferensi.
 *
 * Dipisah dari penulisan DOM-nya supaya bisa diuji sebagai data — dan supaya
 * PR-026c bisa memakai fungsi yang SAMA untuk skrip anti-flash pra-paint, yang
 * berjalan sebelum React ada. Dua tempat yang menghitung token sendiri-sendiri
 * akan menyimpang, dan gejalanya adalah kedipan yang hanya muncul di sebagian
 * perangkat.
 */
export interface TokenA11y {
  properti: Readonly<Record<string, string>>;
  /** `null` = atribut dihapus. */
  atribut: Readonly<Record<string, string | null>>;
}

export function tokenDari(preferensi: AccessibilityPreferences): TokenA11y {
  return {
    properti: {
      // Pengali, bukan piksel: Tailwind preset mengalikannya dengan ukuran
      // dasar tiap kelas teks. 150 → "1.5".
      "--font-scale": String(preferensi.textScale / 100),
      "--touch-target-min": `${
        preferensi.largeTouchTargets ? TARGET_SENTUH_PX.besar : TARGET_SENTUH_PX.normal
      }px`,
    },
    atribut: {
      // Atribut DIHAPUS saat tidak aktif, bukan disetel "normal"/"false".
      // Selektor CSS `[data-contrast="high"]` lebih mudah dibaca daripada
      // `:not([data-contrast="normal"])`, dan atribut yang selalu ada mengundang
      // orang menulis aturan untuk nilai "mati" yang seharusnya cukup jadi
      // gaya bawaan.
      "data-contrast": preferensi.highContrast ? "high" : null,
      "data-motion": preferensi.reduceMotion ? "reduced" : null,
      "data-lang-mode": preferensi.simpleLanguage ? "simple" : null,
    },
  };
}

/**
 * Terapkan token ke sebuah elemen (produksi: `document.documentElement`).
 *
 * Elemennya argumen, bukan diambil dari `document` global: itu yang membuat
 * fungsi ini bisa diuji terhadap elemen lepas, dan yang membuatnya tidak
 * pernah diam-diam menyentuh halaman saat dipanggil dari tempat yang salah.
 */
export function terapkanToken(elemen: HTMLElement, preferensi: AccessibilityPreferences): void {
  const { properti, atribut } = tokenDari(preferensi);

  for (const [nama, nilai] of Object.entries(properti)) {
    elemen.style.setProperty(nama, nilai);
  }

  for (const [nama, nilai] of Object.entries(atribut)) {
    if (nilai === null) elemen.removeAttribute(nama);
    else elemen.setAttribute(nama, nilai);
  }
}

/**
 * Dua preferensi SENGAJA tidak punya token.
 *
 * `prefersSignLanguage` dan `screenReaderHint` tidak mengubah tampilan — yang
 * pertama memilih ADA atau TIDAKNYA konten BISINDO (SignBridge, Fase 2–3),
 * yang kedua mengubah teks bantuan yang ditulis komponen. Keduanya dibaca
 * langsung dari store oleh komponen yang membutuhkannya.
 *
 * Ditulis di sini, bukan hanya di dokumen, supaya orang yang mencari "kenapa
 * preferensi ini tidak muncul di `<html>`" menemukan jawabannya di tempat ia
 * mencari.
 */
export const TANPA_TOKEN = ["prefersSignLanguage", "screenReaderHint"] as const;
