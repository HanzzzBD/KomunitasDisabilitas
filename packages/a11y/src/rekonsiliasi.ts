// Rekonsiliasi preferensi — ADR-008 & SDD §4.3:
// "OS setting menang bila user belum set eksplisit".
//
// Fungsi MURNI, tanpa DOM. Sistem operasi dibaca di adapter web (PR-026b) lalu
// dioper ke sini sebagai data biasa, sehingga mobile bisa memakai logika yang
// SAMA PERSIS dengan sumber sinyal yang berbeda (setelan aksesibilitas Android).
import {
  ACCESSIBILITY_DEFAULTS,
  type AccessibilityPreferences,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";

/**
 * Sinyal dari sistem operasi. Semuanya opsional: `undefined` berarti "tidak
 * diketahui", yang BERBEDA dari `false` ("OS bilang tidak").
 *
 * Perbedaan itu menentukan. Browser lama tidak melaporkan `prefers-contrast`
 * sama sekali; memperlakukan ketiadaannya sebagai "pengguna tidak mau kontras
 * tinggi" akan menimpa keinginan yang tidak pernah dinyatakan.
 */
export interface SinyalOS {
  reduceMotion?: boolean | undefined;
  highContrast?: boolean | undefined;
}

/**
 * Gabungkan tiga sumber menjadi preferensi efektif.
 *
 * Urutan menang: **pilihan eksplisit pengguna → sinyal OS → bawaan**.
 *
 * Kenapa pilihan pengguna disimpan sebagai OBJEK SEBAGIAN (`Partial`), bukan
 * profil utuh: hanya bentuk itu yang bisa membedakan "pengguna memilih tidak"
 * dari "pengguna belum memilih". Profil utuh memaksa setiap field punya nilai,
 * dan begitu itu terjadi, aturan "OS menang bila belum diset" tidak bisa
 * ditegakkan lagi — tidak ada lagi yang tahu mana yang benar-benar dipilih.
 */
export function rekonsiliasi(
  pilihanPengguna: UpdateAccessibilityPreferences,
  os: SinyalOS = {},
): AccessibilityPreferences {
  const ambil = <K extends keyof AccessibilityPreferences>(
    kunci: K,
    dariOS: boolean | undefined,
  ): AccessibilityPreferences[K] => {
    const eksplisit = pilihanPengguna[kunci];
    // `!= null` menangkap `undefined` DAN `null` sekaligus, dan keduanya memang
    // berarti hal yang sama di sini: pengguna belum memilih. `null` datang dari
    // profil akun (`GET /me/accessibility`, migrasi 09) yang menyatakan "belum
    // diatur" secara eksplisit; `undefined` datang dari kunci yang memang tidak
    // ada di objek pilihan lokal. Memperlakukan `null` sebagai nilai akan
    // mengembalikannya sebagai preferensi efektif dan memadamkan tingkat OS —
    // persis kegagalan yang bentuk nullable itu ada untuk mencegahnya.
    if (eksplisit != null) return eksplisit as AccessibilityPreferences[K];
    if (dariOS !== undefined) return dariOS as AccessibilityPreferences[K];
    return ACCESSIBILITY_DEFAULTS[kunci];
  };

  return {
    // `textScale` tidak punya padanan OS yang bisa dibaca andal. Ukuran font
    // sistem memang memengaruhi rem, tetapi lewat browser — bukan lewat kita.
    // `??` sudah menangani `null` maupun `undefined`.
    textScale: pilihanPengguna.textScale ?? ACCESSIBILITY_DEFAULTS.textScale,
    highContrast: ambil("highContrast", os.highContrast),
    reduceMotion: ambil("reduceMotion", os.reduceMotion),
    // Tiga di bawah tidak punya sinyal OS sama sekali: tidak ada API browser
    // maupun Android yang melaporkannya. Hanya pengguna yang bisa menyatakannya.
    simpleLanguage: ambil("simpleLanguage", undefined),
    prefersSignLanguage: ambil("prefersSignLanguage", undefined),
    largeTouchTargets: ambil("largeTouchTargets", undefined),
    screenReaderHint: ambil("screenReaderHint", undefined),
  };
}

/**
 * Apakah sebuah preferensi berasal dari pilihan eksplisit pengguna?
 *
 * Dipakai panel preferensi (PR-036) untuk menampilkan "mengikuti setelan
 * perangkat" alih-alih nilai mati — pengguna berhak tahu mengapa layarnya
 * terlihat begitu, dan mana yang akan ikut berubah bila mereka mengubah setelan
 * sistem.
 */
export function dipilihPengguna(
  pilihanPengguna: UpdateAccessibilityPreferences,
  kunci: keyof AccessibilityPreferences,
): boolean {
  // `!= null` — sama seperti `ambil()` di atas: `null` ("belum diatur", datang
  // dari profil akun) dan `undefined` (kunci tidak ada) sama-sama BUKAN pilihan.
  return pilihanPengguna[kunci] != null;
}
