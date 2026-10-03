// Tren tekstual tile metrik (PR-081, AC "Tren naik/turun tekstual — bukan
// panah warna saja"). Fungsi murni: kalimatnya diuji tanpa merender apa pun.
//
// KALIMAT, BUKAN SIMBOL. Panah ↑/↓ boleh menyertai di layar (aria-hidden),
// tetapi yang dibaca screen reader — dan yang dilihat pengguna buta warna —
// adalah "Naik 3 dibanding 30 hari sebelumnya (12)". Arah, selisih, dan nilai
// pembandingnya sama-sama disebut: "naik 3" tanpa "dari 12" tidak bisa ditimbang.
import type { AdminMetricsPeriod } from "@nawasena/schemas";
import type { FungsiTeks, KunciTeks } from "../../shared/i18n/index.js";

export type ArahTren = "naik" | "turun" | "sama";

export interface Tren {
  arah: ArahTren;
  selisih: number;
}

export function hitungTren(kini: number, lalu: number): Tren {
  if (kini > lalu) return { arah: "naik", selisih: kini - lalu };
  if (kini < lalu) return { arah: "turun", selisih: lalu - kini };
  return { arah: "sama", selisih: 0 };
}

const KUNCI_ARAH: Readonly<Record<ArahTren, KunciTeks>> = {
  naik: "admin.metrik.tren.naik",
  turun: "admin.metrik.tren.turun",
  sama: "admin.metrik.tren.sama",
};

/** Label jendela pembanding, mis. "30 hari sebelumnya". */
export const KUNCI_PERIODE_LALU: Readonly<Record<Exclude<AdminMetricsPeriod, "semua">, KunciTeks>> =
  {
    "7d": "admin.metrik.periodeLalu.7d",
    "30d": "admin.metrik.periodeLalu.30d",
  };

const ANGKA = new Intl.NumberFormat("id-ID");

/** Kalimat tren, atau `null` bila tidak ada pembanding (periode "semua"). */
export function kalimatTren(
  t: FungsiTeks,
  periode: AdminMetricsPeriod,
  kini: number,
  lalu: number | undefined,
): string | null {
  if (periode === "semua" || lalu === undefined) return null;
  const { arah, selisih } = hitungTren(kini, lalu);
  return t(KUNCI_ARAH[arah], {
    selisih: ANGKA.format(selisih),
    lalu: ANGKA.format(lalu),
    pembanding: t(KUNCI_PERIODE_LALU[periode]),
  });
}

export function formatAngka(n: number): string {
  return ANGKA.format(n);
}
