// Penjaga: nilai bawaan token di CSS harus SAMA dengan kontrak preferensi.
//
// Ada dua tempat yang menyatakan "seperti apa tampilan pengguna yang belum
// mengubah apa pun":
//
//   1. `ACCESSIBILITY_DEFAULTS` (packages/schemas) — dipakai store & server;
//   2. `:root` di `gaya.css` — dipakai CSS sebelum JS apa pun berjalan.
//
// Keduanya harus setuju. Kalau tidak, pengguna baru melihat SATU tampilan
// sebelum React hidup dan tampilan LAIN sesudahnya, tanpa pernah mengubah apa
// pun — kedipan yang persis sama dengan yang hendak dicegah PR-026c, hanya saja
// sumbernya kesalahan angka, bukan urutan eksekusi.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/schemas";
import { TARGET_SENTUH_PX, tokenDari } from "@nawasena/a11y/web";

const GAYA_MENTAH = readFileSync(
  join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "src/app/gaya.css"),
  "utf8",
);

/**
 * Komentar dibuang sebelum dipindai.
 *
 * Bukan kerapian: `gaya.css` MENYEBUT `prefers-reduced-motion` dalam kalimat
 * yang menjelaskan mengapa ia TIDAK dipakai. Versi pertama penjaga di bawah
 * gagal karena itu — komentar yang menjelaskan aturan tertangkap sebagai
 * pelanggaran aturan. (Pola yang sama sudah muncul di `soft-delete-jangkauan`
 * dan `pwa-fondasi`; cukup sering untuk pantas diingat.)
 */
const GAYA = GAYA_MENTAH.replace(/\/\*[\s\S]*?\*\//g, "");

/** Ambil nilai satu custom property dari blok `:root`. */
function nilaiRoot(nama: string): string | undefined {
  const blok = /:root\s*\{([\s\S]*?)\}/.exec(GAYA)?.[1] ?? "";
  return new RegExp(`${nama}\\s*:\\s*([^;]+);`).exec(blok)?.[1]?.trim();
}

describe("nilai bawaan token di CSS setuju dengan kontrak", () => {
  it("--font-scale cocok dengan textScale bawaan", () => {
    const dariKontrak = tokenDari(ACCESSIBILITY_DEFAULTS).properti["--font-scale"];
    expect(nilaiRoot("--font-scale")).toBe(dariKontrak);
  });

  it("--touch-target-min cocok dengan target sentuh normal", () => {
    expect(nilaiRoot("--touch-target-min")).toBe(`${TARGET_SENTUH_PX.normal}px`);
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    // Regex yang tidak menemukan apa pun akan membuat kedua test di atas
    // membandingkan `undefined` dengan `undefined` bila kontraknya juga kosong.
    expect(nilaiRoot("--font-scale")).toBeDefined();
    expect(nilaiRoot("--touch-target-min")).toBeDefined();
  });
});

describe("gaya dasar yang tidak boleh hilang", () => {
  it("cincin fokus dipulihkan setelah Preflight menghapus outline", () => {
    // `@tailwind base` menghapus outline bawaan browser. Tanpa aturan
    // pengganti, SELURUH aplikasi kehilangan penanda fokus dan navigasi
    // keyboard menjadi menebak-nebak — kegagalan aksesibilitas paling umum
    // yang lahir dari CSS reset.
    expect(GAYA).toContain(":focus-visible");
    expect(GAYA).toMatch(/outline:\s*3px/);
  });

  it("pengurangan gerak memakai ATRIBUT, bukan media query", () => {
    // Atribut sudah memperhitungkan pilihan eksplisit pengguna yang boleh
    // menimpa setelan OS (ADR-008).
    expect(GAYA).toContain('[data-motion="reduced"]');
    expect(GAYA).not.toContain("prefers-reduced-motion");
  });

  it("durasi animasi disetel 0.01ms, bukan 0s", () => {
    // Durasi nol membuat sebagian browser melewatkan event `transitionend`,
    // dan kode yang menunggunya menggantung selamanya.
    expect(GAYA).toContain("0.01ms");
  });
});
