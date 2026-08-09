// Penjaga: INTI `@nawasena/a11y` harus bebas DOM.
//
// Dokumen phase menuliskannya sebagai syarat ("API paket dirancang
// platform-agnostic, tanpa DOM di core logic") karena mobile mengimpor paket
// yang sama di Phase 15 — dan di sana `document`, `window`, dan `localStorage`
// tidak ada sama sekali.
//
// Pelanggarannya tidak akan terlihat di sini: seluruh test paket ini berjalan
// di jsdom, jadi `document` SELALU tersedia saat diuji. Ia baru muncul sebagai
// crash di perangkat pengguna mobile, berbulan-bulan kemudian. Karena itu
// aturannya ditegakkan penjaga, bukan oleh ketiadaan DOM saat test.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * Buang komentar sebelum memindai — berkas inti MENYEBUT `localStorage` dan
 * `document` dalam penjelasan tentang mengapa keduanya tidak dipakai. Pemindai
 * yang menghukum dokumentasi mengajari orang berhenti mendokumentasikan.
 */
function tanpaKomentar(sumber: string): string {
  return sumber.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Berkas .ts tingkat atas `src/` — folder `web/` sengaja dikecualikan. */
function berkasInti(): string[] {
  return readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => e.name);
}

/** Identifier yang hanya ada di browser. */
const DILARANG = [
  "document",
  "window",
  "localStorage",
  "sessionStorage",
  "navigator",
  "matchMedia",
  "HTMLElement",
];

describe("inti @nawasena/a11y bebas DOM", () => {
  it.each(berkasInti())("src/%s tidak menyentuh API browser", (nama) => {
    const isi = tanpaKomentar(readFileSync(join(SRC, nama), "utf8"));

    for (const larangan of DILARANG) {
      expect(
        new RegExp(`\\b${larangan}\\b`).test(isi),
        `src/${nama} memakai "${larangan}" — pindahkan ke src/web/, sebab mobile mengimpor berkas ini`,
      ).toBe(false);
    }
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    // Nol berkas inti akan membuat `it.each` di atas tidak menjalankan apa pun.
    expect(berkasInti().length).toBeGreaterThan(2);

    // Dan pemindainya harus benar-benar bisa menemukan pelanggaran.
    expect(new RegExp("\\bdocument\\b").test(tanpaKomentar("const x = document.body;"))).toBe(true);
  });

  it("adapter web memang menyentuh DOM — pemisahannya bermakna", () => {
    // Sisi sebaliknya: kalau `web/` juga bebas DOM, pemisahan ini hanya folder
    // kosong yang menciptakan ilusi arsitektur.
    const web = readFileSync(join(SRC, "web", "token.ts"), "utf8");
    expect(web).toContain("HTMLElement");
  });
});
