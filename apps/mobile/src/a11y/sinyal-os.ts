// Sinyal aksesibilitas Android → `SinyalOS` (PR-091, ADR-008).
//
// Murni: sumbernya (`AccessibilityInfo` RN) disuntikkan, jadi diuji Vitest.
// Yang dipetakan hanya yang punya padanan di `SinyalOS`:
//   Setelan > Aksesibilitas > Hapus animasi     → reduceMotion
//   Setelan > Aksesibilitas > Teks kontras tinggi → highContrast
// Ukuran font OS TIDAK lewat sini: RN sudah menerapkannya ke setiap <Text>
// (`allowFontScaling`), dan skala teks preferensi ditumpuk di atasnya (PR-089) —
// sama seperti zoom browser + preferensi di web.
//
// `isScreenReaderEnabled` sengaja TIDAK dibaca. `screenReaderHint` adalah
// pernyataan pengguna, bukan deteksi — paritas dengan web, yang menolak
// menebak pemakai pembaca layar.
import type { SinyalOS } from "@nawasena/a11y";

type NamaEvent = "reduceMotionChanged" | "highTextContrastChanged";

/** Subset `AccessibilityInfo` yang dipakai. */
export interface SumberSinyalOS {
  isReduceMotionEnabled(): Promise<boolean>;
  isHighTextContrastEnabled(): Promise<boolean>;
  addEventListener(nama: NamaEvent, cb: (aktif: boolean) => void): { remove(): void };
}

/**
 * Baca sinyal awal lalu ikuti perubahannya. Setelan yang diubah pengguna di
 * Android saat app terbuka langsung berlaku — tanpa restart.
 *
 * Gagal membaca = `undefined` ("tidak diketahui"), BUKAN `false`: `false`
 * berarti "OS bilang tidak" dan akan menimpa bawaan dengan keyakinan palsu.
 *
 * @returns fungsi pelepas langganan.
 */
export function pantauSinyalOS(
  sumber: SumberSinyalOS,
  setSinyal: (os: SinyalOS) => void,
): () => void {
  let sinyal: SinyalOS = {};
  let aktif = true;
  const ubah = (sebagian: SinyalOS) => {
    if (!aktif) return;
    sinyal = { ...sinyal, ...sebagian };
    setSinyal(sinyal);
  };

  const langganan = [
    sumber.addEventListener("reduceMotionChanged", (v) => ubah({ reduceMotion: v })),
    sumber.addEventListener("highTextContrastChanged", (v) => ubah({ highContrast: v })),
  ];

  void Promise.all([
    sumber.isReduceMotionEnabled().catch(() => undefined),
    sumber.isHighTextContrastEnabled().catch(() => undefined),
  ]).then(([reduceMotion, highContrast]) => {
    // Event yang tiba lebih dulu dari bacaan awal lebih baru — jangan ditimpa.
    ubah({
      ...(sinyal.reduceMotion === undefined ? { reduceMotion } : {}),
      ...(sinyal.highContrast === undefined ? { highContrast } : {}),
    });
  });

  return () => {
    aktif = false;
    for (const l of langganan) l.remove();
  };
}
