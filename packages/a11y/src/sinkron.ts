// Sinkron preferensi dengan akun (PR-036, dipindah dari apps/web di PR-091).
//
// FUNGSI MURNI, BEBAS DOM — dipakai web (`SambungkanServer`) dan mobile
// (`sinkron-a11y.ts`). Dua salinan aturan yang sama akan menyimpang pada
// perbaikan berikutnya, dan penyimpangan di sini berarti pilihan aksesibilitas
// seseorang hilang di satu platform tetapi tidak di platform lain.
import {
  ACCESSIBILITY_KEYS,
  type AccessibilityProfile,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";

/**
 * Gabungkan preferensi dari akun ke pilihan lokal — inti aturan "server menang,
 * lokal hanya untuk cat pertama" (ADR-008, AC-6 PR-036).
 *
 * FUNGSI MURNI, dan itu satu-satunya alasan ia berdiri sendiri: perlombaan yang
 * ditanganinya (pengguna menggeser sakelar SEMENTARA permintaannya masih di
 * jalan) mustahil diuji andal lewat komponen — ia menuntut pengendalian waktu
 * sampai ke milidetik. Sebagai data masuk → data keluar, ia bisa diuji apa
 * adanya.
 *
 * ATURANNYA PER FIELD, bukan per profil. Menimpa seluruh profil berarti
 * membuang perubahan yang baru saja dibuat pengguna di layar — perubahan yang
 * sudah ia LIHAT berlaku, dan yang PUT-nya sudah dalam perjalanan. Yang diambil
 * dari server karena itu hanya field yang TIDAK tersentuh sejak permintaannya
 * berangkat: `sebelum` adalah cuplikan saat berangkat, `sekarang` keadaan saat
 * jawabannya tiba.
 *
 * `null` DARI SERVER BERARTI "BELUM DIATUR", DAN FIELD ITU TIDAK DITULIS.
 * Sejak migrasi 09 profil akun bisa menyatakan ketiadaan pilihan apa adanya,
 * jadi aturannya kini sesederhana kenyataannya: ada nilai → itu pilihan yang
 * pernah ditegaskan pengguna (di perangkat mana pun), tulis; `null` → tidak ada
 * pilihan, jangan sentuh, biarkan `rekonsiliasi()` turun ke sinyal OS lalu ke
 * bawaan.
 *
 * INI MENGGANTIKAN `gabungkanFieldOS` dan menutup DUA BATAS yang dulu diterima
 * sadar, keduanya akibat langsung server yang selalu menjawab nilai konkret:
 * - field bernilai bawaan tidak lagi MEMAKU apa pun, jadi perubahan setelan OS
 *   sesudah login kembali berlaku untuk field yang belum pernah dipilih;
 * - `false` yang benar-benar dipilih pengguna kini terkirim sebagai `false`
 *   (bukan `null`), jadi ia menang atas sinyal OS yang bertentangan dan reset
 *   `true → false` di perangkat A benar-benar mendarat di perangkat B.
 * Tebakan "nilai == bawaan, mungkin bukan pilihan" tidak diperlukan lagi, dan
 * karena itu dihapus — bukan dilonggarkan.
 *
 * Ditulis tujuh baris eksplisit alih-alih perulangan atas kunci: hanya bentuk
 * ini yang membuat `typecheck` ikut menjaga kecocokan tipe tiap field, dan
 * field baru di skema tidak bisa lolos diam-diam tanpa diputuskan di sini.
 */
export function gabungkanDariServer(
  server: AccessibilityProfile,
  sebelum: UpdateAccessibilityPreferences,
  sekarang: UpdateAccessibilityPreferences,
): UpdateAccessibilityPreferences {
  const hasil: UpdateAccessibilityPreferences = {};
  if (sekarang.textScale === sebelum.textScale && server.textScale !== null) {
    hasil.textScale = server.textScale;
  }
  if (sekarang.highContrast === sebelum.highContrast && server.highContrast !== null) {
    hasil.highContrast = server.highContrast;
  }
  if (sekarang.reduceMotion === sebelum.reduceMotion && server.reduceMotion !== null) {
    hasil.reduceMotion = server.reduceMotion;
  }
  if (sekarang.simpleLanguage === sebelum.simpleLanguage && server.simpleLanguage !== null) {
    hasil.simpleLanguage = server.simpleLanguage;
  }
  if (
    sekarang.largeTouchTargets === sebelum.largeTouchTargets &&
    server.largeTouchTargets !== null
  ) {
    hasil.largeTouchTargets = server.largeTouchTargets;
  }
  if (
    sekarang.prefersSignLanguage === sebelum.prefersSignLanguage &&
    server.prefersSignLanguage !== null
  ) {
    hasil.prefersSignLanguage = server.prefersSignLanguage;
  }
  if (sekarang.screenReaderHint === sebelum.screenReaderHint && server.screenReaderHint !== null) {
    hasil.screenReaderHint = server.screenReaderHint;
  }
  return hasil;
}

/**
 * Apakah akun BELUM PERNAH mengatur satu preferensi pun (semua field `null`)?
 *
 * Dipakai mobile (PR-091) untuk memutuskan wizard onboarding: pengguna yang
 * sudah mengatur preferensi di web — atau di perangkat lain — tidak ditanya
 * ulang. Penanda selesai per perangkat saja tidak cukup untuk itu, sebab ia
 * tidak menyeberangi perangkat.
 */
export function profilBelumDiatur(profil: AccessibilityProfile): boolean {
  return ACCESSIBILITY_KEYS.every((kunci) => profil[kunci] === null);
}
