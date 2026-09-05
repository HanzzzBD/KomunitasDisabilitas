// Penjaga pemuatan malas katalog i18n (shell eager, fitur per rute).
//
// DUA HAL YANG DIJAGA, keduanya gagal SENYAP tanpa berkas ini:
//
//  1. Rute yang lupa menyebut katalognya. Gejalanya hanya muncul di halaman itu
//     saja, dan hanya bagi pengguna yang membukanya LANGSUNG lewat URL — bukan
//     bagi yang menavigasi dari halaman lain yang kebetulan sudah memuatnya.
//     `__tests__/setup.ts` men-seed SELURUH katalog supaya ratusan test komponen
//     tidak perlu upacara pemuatan; justru karena itu berkas ini WAJIB mereset
//     registri lebih dulu, kalau tidak ia ikut tertipu seed tersebut.
//
//  2. Kode aplikasi yang mengimpor agregat lengkap (`katalog/semua.js`). Satu
//     impor saja mengembalikan seluruh teks ke bundel awal — membengkak lagi
//     tanpa satu pun test merah, dan tanpa gejala selain angka yang naik.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RouteObject } from "react-router";
import { ruteApp } from "../src/app/routes.js";
import {
  FITUR_MALAS,
  resetRegistriUntukTest,
  sudahDimuat,
  type FiturMalas,
} from "../src/shared/i18n/registri.js";

// `process.cwd()`, bukan `import.meta.url`: berkas ini berjalan di lingkungan
// jsdom, tempat `import.meta.url` bukan URL berskema file.
const SRC = resolve(process.cwd(), "src");
const ROUTES_TS = join(SRC, "app", "routes.ts");

function ratakan(rute: readonly RouteObject[]): RouteObject[] {
  return rute.flatMap((r) => [r, ...ratakan(r.children ?? [])]);
}

/** Resolusi impor relatif bergaya ESM (`./x.js` → `x.ts` / `x.tsx`). */
function resolusi(dariBerkas: string, spesifier: string): string | null {
  if (!spesifier.startsWith(".")) return null;
  const dasar = resolve(dirname(dariBerkas), spesifier).replace(/\.js$/, "");
  const kandidat = [`${dasar}.ts`, `${dasar}.tsx`, join(dasar, "index.ts"), join(dasar, "index.tsx")];
  for (const berkas of kandidat) {
    try {
      if (statSync(berkas).isFile()) return berkas;
    } catch {
      /* coba kandidat berikutnya */
    }
  }
  return null;
}

// HANYA impor STATIS. Mengikuti `import()` dinamis akan menyeberangi batas
// chunk — dan justru batas itulah yang dijaga berkas ini: `app/routes.ts`
// meng-`import()` SETIAP halaman, jadi satu rute yang menyentuhnya secara tidak
// langsung akan tampak membutuhkan seluruh katalog aplikasi. Versi pertama
// penjaga ini melakukannya dan melaporkan tiga ketergantungan palsu.
const POLA_IMPOR = /from\s+["']([^"']+)["']/g;

/** Seluruh berkas src yang terjangkau dari satu titik masuk. */
function grafModul(masuk: string): string[] {
  const terlihat = new Set<string>();
  const antre = [masuk];
  while (antre.length > 0) {
    const berkas = antre.pop() as string;
    if (terlihat.has(berkas)) continue;
    terlihat.add(berkas);
    for (const cocok of readFileSync(berkas, "utf8").matchAll(POLA_IMPOR)) {
      const spesifier = cocok[1];
      if (spesifier === undefined) continue;
      const tujuan = resolusi(berkas, spesifier);
      if (tujuan !== null) antre.push(tujuan);
    }
  }
  return [...terlihat];
}

/**
 * Prefiks katalog yang DISEBUT graf sebuah rute.
 *
 * Berbasis PREFIKS, bukan kunci utuh, dan itu keharusan: sebagian kunci dirakit
 * saat berjalan — `t(`beranda.nilai.${kunci}.judul`)` — sehingga pencocokan
 * kunci lengkap justru melewatkan halaman yang paling banyak memakainya.
 * Kepala template literal-nya tetap harfiah, dan prefiks itu yang menentukan
 * katalog mana yang dibutuhkan.
 */
function tanpaKomentar(isi: string): string {
  // Komentar dibuang SEBELUM pemindaian. Tanpa ini, nama berkas yang disebut
  // di komentar — `onboarding.test.tsx` — terbaca sebagai pemakaian katalog
  // `onboarding`, dan rutenya dipaksa memuat katalog yang tidak pernah ia
  // sentuh. Positif palsu pada penjaga seperti ini mahal: ia menyuruh orang
  // menambahkan katalog, yang justru mengembalikan bobot ke bundel.
  const tanpaBlok = isi.replace(/\/\*[\s\S]*?\*\//g, " ");
  return tanpaBlok.replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

function fiturYangDisebut(berkasBerkas: readonly string[]): Set<FiturMalas> {
  const hasil = new Set<FiturMalas>();
  for (const berkas of berkasBerkas) {
    // Katalog & registri sendiri menyebut SEMUA nama fitur; membacanya membuat
    // setiap rute tampak membutuhkan segalanya.
    if (berkas.includes(join("shared", "i18n"))) continue;
    for (const cocok of tanpaKomentar(readFileSync(berkas, "utf8")).matchAll(/["'`]([a-zA-Z]+)\./g)) {
      const fitur = FITUR_MALAS.find((f) => f === cocok[1]);
      if (fitur !== undefined) hasil.add(fitur);
    }
  }
  return hasil;
}

function berkasSrc(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const penuh = join(dir, nama);
    if (statSync(penuh).isDirectory()) return berkasSrc(penuh);
    return /\.tsx?$/.test(penuh) ? [penuh] : [];
  });
}

const ruteLazy = ratakan(ruteApp).filter(
  (r): r is RouteObject & { lazy: () => Promise<unknown> } => typeof r.lazy === "function",
);

describe("katalog i18n dimuat malas per rute", () => {
  beforeEach(() => {
    resetRegistriUntukTest();
  });

  it("ada route lazy untuk diperiksa — penjaga atas penjaga", () => {
    expect(ruteLazy.length).toBeGreaterThanOrEqual(8);
  });

  it("shell SELALU tersedia tanpa dimuat — layar galat tidak boleh menunggu unduhan", () => {
    expect(sudahDimuat("shell")).toBe(true);
    for (const fitur of FITUR_MALAS) expect(sudahDimuat(fitur)).toBe(false);
  });

  it("SETIAP rute memuat katalog untuk seluruh prefiks yang dipakainya", () => {
    // DIBACA DARI SUMBER `app/routes.ts`, bukan dari `rute.lazy.toString()`.
    //
    // Versi pertama penjaga ini memakai toString() dan HAMPA: Vite menulis
    // ulang `import("../routes/profil.js")` menjadi
    // `__vite_ssr_dynamic_import__("/src/routes/profil.tsx")`, sehingga polanya
    // tidak pernah cocok, daftar modulnya selalu kosong, dan tidak satu rute
    // pun benar-benar diperiksa — ia lulus atas dua mutasi yang seharusnya
    // menjatuhkannya. Dicatat supaya tidak ada yang "menyederhanakannya"
    // kembali ke bentuk itu.
    const sumber = readFileSync(ROUTES_TS, "utf8");
    const blok = sumber.split("lazy: async () => {").slice(1);
    expect(blok.length, "tidak ada blok lazy terbaca dari routes.ts").toBeGreaterThanOrEqual(8);

    const kurang: string[] = [];
    for (const potongan of blok) {
      const modul = /["'](\.\.\/routes\/[a-z-]+\.js)["']/.exec(potongan)?.[1];
      if (modul === undefined) continue;
      const argumen = /muatKatalog\(([^)]*)\)/.exec(potongan)?.[1] ?? "";
      const dideklarasikan = [...argumen.matchAll(/["']([a-z]+)["']/g)]
        .map((m) => m[1])
        .filter((n): n is FiturMalas => FITUR_MALAS.some((f) => f === n));

      const masuk = resolusi(ROUTES_TS, modul);
      if (masuk === null) {
        kurang.push(modul + ": berkasnya tidak ditemukan");
        continue;
      }
      for (const perlu of fiturYangDisebut(grafModul(masuk))) {
        if (!dideklarasikan.includes(perlu)) {
          kurang.push(modul + ' memakai "' + perlu + '.*" tetapi rutenya tidak memuatnya');
        }
      }
    }

    expect(kurang, "Rute dengan katalog kurang: " + kurang.join(" | ")).toEqual([]);
  });

  it("panggilan muatKatalog benar-benar mengisi registri saat lazy dijalankan", async () => {
    // Melengkapi test statis di atas dari sisi runtime: nama fitur salah ketik
    // lolos pembacaan sumber, tetapi tidak akan pernah mengisi registri.
    let adaYangMemuat = false;
    for (const rute of ruteLazy) {
      resetRegistriUntukTest();
      await rute.lazy();
      if (FITUR_MALAS.some((f) => sudahDimuat(f))) adaYangMemuat = true;
    }
    expect(adaYangMemuat).toBe(true);
  });

  it("kode aplikasi TIDAK mengimpor agregat lengkap katalog/semua.js", () => {
    const pelanggar = berkasSrc(SRC).filter((berkas) => {
      if (berkas.endsWith(join("katalog", "semua.ts"))) return false;
      return /katalog\/semua\.js/.test(readFileSync(berkas, "utf8"));
    });

    expect(pelanggar, "Impor menyeret SELURUH katalog: " + pelanggar.join(" | ")).toEqual([]);
  });
});
