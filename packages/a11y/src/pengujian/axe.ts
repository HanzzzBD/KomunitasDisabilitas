// Pemeriksaan aksesibilitas per komponen — gerbang lapis KEDUA (PR-031a).
//
// TIGA LAPIS, dan tidak satu pun cukup sendirian:
//
//   1. `jsx-a11y` (lint)     — analisis statis satu berkas. Menangkap markup
//                              yang salah bentuk sebelum dijalankan.
//   2. `axe` per komponen    — berkas ini. Memeriksa POHON yang sudah dirakit:
//                              label yang datang dari komponen lain, peran yang
//                              bertabrakan, atribut ARIA yang menunjuk id hilang.
//   3. `axe` + Lighthouse    — atas halaman nyata di browser (PR-031b).
//      atas halaman
//
// BATAS LAPIS KEDUA — HARUS DIBACA SEBELUM MEMPERCAYAINYA:
//
// jsdom tidak menggambar apa pun. Ia tidak punya tata letak, tidak menghitung
// warna hasil kaskade, dan tidak tahu ukuran elemen. Akibatnya SELURUH aturan
// yang bergantung pada rendering — kontras warna, ukuran target sentuh, elemen
// yang tertutup elemen lain — TIDAK BISA dijalankan di sini. axe melaporkannya
// sebagai "incomplete", bukan "pass".
//
// Karena itu lulusnya pemeriksaan ini BUKAN berarti komponennya aksesibel. Ia
// berarti komponennya tidak melanggar aturan yang bisa diperiksa tanpa layar.
// Kontras dan target sentuh dijaga PR-031b; audit manusia tetap gerbang rilis
// (PR-110).
import axe, { type AxeResults, type ElementContext, type RunOptions } from "axe-core";

/**
 * Aturan yang TIDAK BISA berjalan di jsdom, didaftarkan eksplisit.
 *
 * Ditulis sebagai daftar, bukan dibiarkan diam-diam "incomplete", supaya
 * hilangnya cakupan ini terlihat oleh siapa pun yang membaca berkas ini —
 * dan supaya PR-031b punya daftar yang harus ia tutup.
 *
 * SUDAH DITUTUP (PR-031b): ketiganya kini dijalankan di peramban sungguhan oleh
 * `apps/web/e2e/aksesibilitas.spec.ts`, dan test di sana menuntut `color-contrast`
 * serta `target-size` benar-benar LULUS — bukan sekadar berjalan. Daftar ini
 * tetap ada karena batas lapis KEDUA tidak berubah: yang membaca berkas ini
 * harus tetap tahu apa yang tidak dijaga di sini.
 *
 * `scrollable-region-focusable` masih `inapplicable` di halaman yang ada
 * sekarang (belum ada wilayah yang menggulir), jadi ia berjalan tanpa pernah
 * benar-benar diuji. Itu keadaan, bukan cakupan.
 */
export const TAK_BISA_DI_JSDOM = [
  "color-contrast",
  "target-size",
  "scrollable-region-focusable",
] as const;

export interface OpsiPeriksa {
  /** Aturan tambahan yang dimatikan, dengan ALASAN — lihat `laporkan()`. */
  matikan?: Readonly<Record<string, string>>;
  /** Jalankan hanya aturan tertentu; dipakai test yang menguji harness ini. */
  hanya?: readonly string[];
}

function opsiAxe(opsi: OpsiPeriksa = {}): RunOptions {
  const rules: RunOptions["rules"] = {};
  for (const nama of TAK_BISA_DI_JSDOM) rules[nama] = { enabled: false };
  for (const nama of Object.keys(opsi.matikan ?? {})) rules[nama] = { enabled: false };

  return opsi.hanya === undefined
    ? { rules }
    : { rules, runOnly: { type: "rule", values: [...opsi.hanya] } };
}

export async function periksaAksesibilitas(
  konteks: ElementContext,
  opsi?: OpsiPeriksa,
): Promise<AxeResults> {
  return await axe.run(konteks, opsiAxe(opsi));
}

/**
 * Ubah pelanggaran menjadi laporan yang bisa DITINDAKLANJUTI — AC PR-031
 * "Laporan kegagalan menyebut elemen + aturan".
 *
 * Pesan bawaan axe menyebut id aturan saja. Yang dibutuhkan orang yang membaca
 * CI merah adalah tiga hal sekaligus: aturan mana, elemen mana, dan apa yang
 * harus diubah. Tanpa elemennya, komponen dengan sepuluh tombol menyisakan
 * pencarian manual.
 */
export function laporkan(hasil: AxeResults): string {
  return hasil.violations
    .map((v) => {
      const simpul = v.nodes
        .map((n) => `      ${n.target.join(" ")}\n        ${n.failureSummary ?? ""}`.trimEnd())
        .join("\n");
      return `  [${v.id}] ${v.help}\n    dampak: ${v.impact ?? "tidak diketahui"}\n    rujukan: ${v.helpUrl}\n${simpul}`;
    })
    .join("\n\n");
}

/**
 * Gagal bila ada pelanggaran. Dipakai langsung di test komponen.
 *
 * Melempar `Error`, bukan mengembalikan boolean: nilai balik yang lupa
 * diperiksa adalah cara termudah sebuah gerbang berhenti menjadi gerbang.
 */
export async function harusLolosAksesibilitas(
  konteks: ElementContext,
  opsi?: OpsiPeriksa,
): Promise<void> {
  const hasil = await periksaAksesibilitas(konteks, opsi);
  if (hasil.violations.length === 0) return;

  throw new Error(
    `${hasil.violations.length} pelanggaran aksesibilitas:\n\n${laporkan(hasil)}\n\n` +
      `Catatan: aturan yang butuh rendering (${TAK_BISA_DI_JSDOM.join(", ")}) TIDAK ikut diperiksa di jsdom.`,
  );
}
