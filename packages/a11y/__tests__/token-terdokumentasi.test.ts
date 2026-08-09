// AC PR-026: "Semua token terdokumentasi untuk pemakaian Tailwind preset."
//
// Token adalah KONTRAK antara paket ini dan setiap lembar gaya yang ditulis
// siapa pun setelahnya. Token yang lahir tanpa dokumentasi akan dipakai dengan
// cara yang tidak dimaksudkan — atau lebih sering, tidak dipakai sama sekali
// karena tidak ada yang tahu ia ada.
//
// Penjaga ini menurunkan daftar token dari KODE, bukan dari daftar tulisan
// tangan: daftar tulisan tangan adalah sumber kebenaran kedua yang bebas
// menyimpang, dan penjaga yang membandingkan dua salinan usang selalu hijau.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/schemas";
import { TANPA_TOKEN, tokenDari } from "../src/web/token.js";

const DOKUMEN = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "docs",
  "token-aksesibilitas.md",
);

const isi = readFileSync(DOKUMEN, "utf8");

/** Semua nama token yang mungkin dihasilkan, dari seluruh kombinasi menyala/mati. */
function semuaToken(): { properti: string[]; atribut: string[] } {
  const mati = tokenDari(ACCESSIBILITY_DEFAULTS);
  const nyala = tokenDari({
    textScale: 200,
    highContrast: true,
    reduceMotion: true,
    simpleLanguage: true,
    prefersSignLanguage: true,
    largeTouchTargets: true,
    screenReaderHint: true,
  });

  return {
    properti: [...new Set([...Object.keys(mati.properti), ...Object.keys(nyala.properti)])],
    atribut: [...new Set([...Object.keys(mati.atribut), ...Object.keys(nyala.atribut)])],
  };
}

describe("dokumentasi token", () => {
  const { properti, atribut } = semuaToken();

  it.each(properti)("custom property %s terdokumentasi", (nama) => {
    expect(isi, `${nama} belum ada di docs/token-aksesibilitas.md`).toContain(nama);
  });

  it.each(atribut)("atribut %s terdokumentasi beserta nilainya", (nama) => {
    // Nama saja tidak cukup: penulis CSS butuh NILAI yang harus dicocokkan.
    const nyala = tokenDari({
      ...ACCESSIBILITY_DEFAULTS,
      highContrast: true,
      reduceMotion: true,
      simpleLanguage: true,
    }).atribut[nama];

    expect(isi, `${nama} belum ada di dokumen`).toContain(nama);
    expect(isi, `nilai "${nyala}" untuk ${nama} belum disebut`).toContain(`${nama}="${nyala}"`);
  });

  it("preferensi TANPA token dijelaskan mengapa", () => {
    // Tanpa penjelasan, orang akan mencarinya di `<html>`, tidak menemukannya,
    // lalu menyimpulkan ada bug.
    for (const nama of TANPA_TOKEN) {
      expect(isi, `${nama} tidak dijelaskan di dokumen`).toContain(nama);
    }
  });

  it("dokumen menyebut nilai cadangan pada contoh CSS", () => {
    // `var(--font-scale)` tanpa cadangan menghasilkan teks tanpa ukuran bila
    // skrip pra-paint gagal — lebih buruk daripada ukuran normal.
    expect(isi).toContain("var(--font-scale, 1)");
    expect(isi).toContain("var(--touch-target-min, 44px)");
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    expect(properti.length).toBeGreaterThan(1);
    expect(atribut.length).toBeGreaterThan(2);
  });
});
