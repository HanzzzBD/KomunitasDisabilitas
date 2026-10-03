// Analytics privacy-first (PR-082) — pintu masuk yang dipanggil fitur.
//
// BERKAS INI SENGAJA RINGAN. Ia ikut bundel AWAL (pageview dipasang di
// kerangka), jadi tidak mengimpor zod maupun kontrak event: validasi no-PII,
// penormal path, dan pengiriman hidup di `analitik-kirim.ts` yang dimuat malas
// pada event pertama. Pelajaran Lighthouse 3G PR-077a: skema di modul bundel
// awal tidak bisa dipangkas bundler.
//
// TIGA PINTU MATI, diperiksa sebelum apa pun dimuat:
//   1. Tanpa `VITE_UMAMI_WEBSITE_ID` (dev biasa, test, CI) → no-op total;
//   2. Do Not Track / Global Privacy Control dari peramban → dihormati;
//   3. Opt-out pengguna di Pengaturan (per perangkat, keputusan owner
//      2026-10-03) → disimpan di localStorage.
// Keputusan owner: opt-OUT (menyala bawaan) — dengan payload tanpa PII/ID.
//
// FIRE-AND-FORGET (AC "Analytics gagal → aplikasi tidak terganggu"): `track`
// tidak mengembalikan apa pun yang bisa ditunggu, dan tidak satu jalur pun
// bisa melempar ke pemanggil — termasuk gagal memuat modul pengirimnya.
import type { AnalyticsEventData, AnalyticsEventName } from "@nawasena/schemas";

export const KUNCI_OPT_OUT = "nawasena.analitik.mati";

export interface KonfigurasiAnalitik {
  websiteId: string | undefined;
  /** Origin-relatif (first-party): `/analitik` → `/analitik/api/send`. */
  dasarUrl: string;
}

/**
 * Env build lebih dulu; bila kosong, `window.__nawasenaAnalitik` — SEAM UJI:
 * build CI/Lighthouse sengaja tanpa website id (analytics no-op), dan spec
 * Playwright menyalakannya lewat `addInitScript` tanpa build terpisah.
 * Pengunjung tidak bisa "dirugikan" seam ini: yang ia nyalakan hanya
 * pengiriman ke origin situs ini sendiri, tetap lewat skema no-PII.
 */
export function konfigurasiDariEnv(): KonfigurasiAnalitik {
  const uji = (globalThis as { __nawasenaAnalitik?: Partial<KonfigurasiAnalitik> })
    .__nawasenaAnalitik;
  return {
    websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID || uji?.websiteId || undefined,
    dasarUrl: import.meta.env.VITE_UMAMI_URL || uji?.dasarUrl || "/analitik",
  };
}

let konfigurasi: KonfigurasiAnalitik = konfigurasiDariEnv();

/** Untuk test: ganti konfigurasi (bawaan dibaca dari env saat build). */
export function aturKonfigurasiAnalitik(baru: KonfigurasiAnalitik): void {
  konfigurasi = baru;
}

function bacaOptOut(): boolean {
  try {
    return globalThis.localStorage?.getItem(KUNCI_OPT_OUT) === "1";
  } catch {
    // Penyimpanan diblokir (mode privat ketat) — anggap mati: lebih aman.
    return true;
  }
}

/** Sinyal privasi peramban: DNT "1" atau Global Privacy Control. */
export function pelacakanDitolakPeramban(): boolean {
  const nav = globalThis.navigator as
    | (Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string })
    | undefined;
  if (nav === undefined) return false;
  return (
    nav.doNotTrack === "1" ||
    nav.msDoNotTrack === "1" ||
    (globalThis as { doNotTrack?: string }).doNotTrack === "1" ||
    nav.globalPrivacyControl === true
  );
}

export function analitikDimatikanPengguna(): boolean {
  return bacaOptOut();
}

export function aturAnalitikDimatikan(mati: boolean): void {
  try {
    if (mati) globalThis.localStorage?.setItem(KUNCI_OPT_OUT, "1");
    else globalThis.localStorage?.removeItem(KUNCI_OPT_OUT);
  } catch {
    // Tidak bisa disimpan — tidak ada yang bisa dilakukan; pengiriman tetap
    // tertahan oleh `bacaOptOut` yang menganggap galat sebagai "mati".
  }
}

export function analitikAktif(): boolean {
  return konfigurasi.websiteId !== undefined && !pelacakanDitolakPeramban() && !bacaOptOut();
}

type Kiriman =
  | { type: "pageview"; pathMentah: string }
  | { type: "event"; pathMentah: string; name: AnalyticsEventName; data?: Record<string, string> };

function kirim(k: Kiriman): void {
  if (!analitikAktif()) return;
  const k2 = konfigurasi;
  void import("./analitik-kirim.js")
    .then((m) => m.kirimKeUmami(k, k2))
    .catch(() => {
      // Modul gagal dimuat (luring, deploy baru) — diam. Lihat kepala berkas.
    });
}

function pathSaatIni(): string {
  return globalThis.location?.pathname ?? "/";
}

/** Pageview — path dinormalkan (tanpa id/query) SEBELUM meninggalkan perangkat. */
export function trackPageview(pathMentah: string = pathSaatIni()): void {
  kirim({ type: "pageview", pathMentah });
}

/** Event funnel (katalog: `docs/katalog-event-analitik.md`). */
export function track<N extends AnalyticsEventName>(
  name: N,
  ...data: AnalyticsEventData<N> extends undefined ? [] : [AnalyticsEventData<N>]
): void {
  kirim({
    type: "event",
    pathMentah: pathSaatIni(),
    name,
    ...(data[0] === undefined ? {} : { data: data[0] as Record<string, string> }),
  });
}

/**
 * Event yang cukup dikirim SEKALI per perangkat per subjek (mis. `profil_lengkap`
 * per akun, `wawancara` per lamaran). Penandanya lokal — kunci memuat id, tetapi
 * id itu tidak pernah meninggalkan perangkat.
 */
export function sekaliSaja(kunci: string, kerja: () => void): void {
  const penanda = `nawasena.analitik.sekali.${kunci}`;
  try {
    if (globalThis.localStorage?.getItem(penanda) === "1") return;
    globalThis.localStorage?.setItem(penanda, "1");
  } catch {
    return;
  }
  kerja();
}
