// Membaca setelan aksesibilitas sistem operasi lewat `matchMedia`.
//
// ADR-008: "OS setting menang bila user belum set eksplisit". Berkas ini hanya
// MEMBACA dan melaporkan; keputusan siapa yang menang ada di `rekonsiliasi()`
// (PR-026a), yang bebas DOM dan dipakai mobile juga.
import type { SinyalOS } from "../rekonsiliasi.js";

/**
 * Kueri media per sinyal.
 *
 * `prefers-contrast: more` — BUKAN `high`. `high` adalah nilai lama yang tidak
 * pernah masuk standar; `more` yang dipakai spesifikasi Media Queries Level 5
 * dan diterapkan browser.
 */
export const KUERI_OS = {
  reduceMotion: "(prefers-reduced-motion: reduce)",
  highContrast: "(prefers-contrast: more)",
} as const;

/** Irisan `window` yang dipakai — sengaja sempit agar mudah dipalsukan di test. */
export interface JendelaMedia {
  matchMedia(kueri: string): MediaQueryList;
}

/**
 * Baca sinyal OS saat ini.
 *
 * Kueri yang TIDAK DIKENAL browser mengembalikan `matches: false` — tidak bisa
 * dibedakan dari "dikenal, dan jawabannya tidak". Karena itu kita memeriksa
 * dukungan lebih dulu lewat kueri yang sengaja tidak valid: bila browser
 * mengenali sintaksnya, `media` dikembalikan apa adanya; bila tidak, ia
 * dinormalkan menjadi `"not all"`.
 *
 * Tanpa pemeriksaan ini, browser lama akan melaporkan "pengguna tidak mau
 * kontras tinggi" padahal ia sama sekali tidak tahu — dan `rekonsiliasi()`
 * akan memperlakukannya sebagai jawaban, bukan sebagai ketidaktahuan.
 */
export function bacaSinyalOS(jendela: JendelaMedia): SinyalOS {
  const baca = (kueri: string): boolean | undefined => {
    const mql = jendela.matchMedia(kueri);
    // `media` yang tidak dikenali dinormalkan browser menjadi "not all".
    if (mql.media === "not all") return undefined;
    return mql.matches;
  };

  return {
    reduceMotion: baca(KUERI_OS.reduceMotion),
    highContrast: baca(KUERI_OS.highContrast),
  };
}

/**
 * Pantau perubahan setelan OS.
 *
 * Pengguna bisa mengubah setelan sistem SELAGI aplikasi terbuka — mengaktifkan
 * "kurangi gerak" di tengah sesi karena mulai pusing adalah persis momen ketika
 * ia paling dibutuhkan. Membaca sekali saat boot tidak cukup.
 *
 * Mengembalikan fungsi pembatalan.
 */
export function pantauSinyalOS(jendela: JendelaMedia, saatBerubah: (sinyal: SinyalOS) => void): () => void {
  const daftar = Object.values(KUERI_OS).map((kueri) => jendela.matchMedia(kueri));
  const teruskan = () => {
    saatBerubah(bacaSinyalOS(jendela));
  };

  for (const mql of daftar) {
    // `addEventListener` (standar) dengan cadangan `addListener` (usang, tetapi
    // satu-satunya yang ada di Safari lama). Pengguna yang memakai perangkat
    // lama adalah bagian dari audiens produk ini, bukan pengecualian.
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", teruskan);
    else mql.addListener?.(teruskan);
  }

  return () => {
    for (const mql of daftar) {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", teruskan);
      else mql.removeListener?.(teruskan);
    }
  };
}
