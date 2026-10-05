/**
 * Target sentuh minimum — SDD §4.3 & WCAG 2.2 §2.5.8 (24 minimum absolut).
 *
 * Satuannya mengikuti platform: px CSS di web, dp di Android. Keduanya satuan
 * independen-kepadatan, jadi angkanya sama. Tinggal di inti (bukan di adapter
 * web) supaya web dan mobile membaca SATU sumber: target yang menyimpang antar
 * platform adalah janji aksesibilitas yang hanya ditepati separuh.
 */
export const TARGET_SENTUH = { normal: 44, besar: 56 } as const;
