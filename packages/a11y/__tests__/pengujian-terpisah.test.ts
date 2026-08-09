// Penjaga: perkakas pengujian TIDAK BOLEH punya jalan masuk ke kode produksi.
//
// `axe-core` berukuran ± 500 KB belum termampat — lebih besar daripada seluruh
// budget JS awal aplikasi (200 KB gzip). Satu impor yang salah tempat akan
// menggagalkan budget itu, dan yang lebih buruk: ia bisa lolos bila kelak
// budget dinaikkan tanpa ada yang menyadari asal beratnya.
//
// Penjaga budget `apps/web` adalah jaring KEDUA. Ini yang pertama, dan ia
// menyebut sebabnya.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

function tanpaKomentar(sumber: string): string {
  return sumber.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Seluruh .ts di `src/` KECUALI folder `pengujian/`. */
function berkasProduksi(dir = SRC, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) {
      return e.name === "pengujian" ? [] : berkasProduksi(join(dir, e.name), `${prefix}${e.name}/`);
    }
    return e.name.endsWith(".ts") ? [`${prefix}${e.name}`] : [];
  });
}

describe("perkakas pengujian terpisah dari kode produksi", () => {
  it.each(berkasProduksi())("src/%s tidak mengimpor axe-core maupun ./pengujian", (nama) => {
    const isi = tanpaKomentar(readFileSync(join(SRC, nama), "utf8"));

    expect(/from\s+["']axe-core["']/.test(isi), `src/${nama} mengimpor axe-core`).toBe(false);
    expect(/from\s+["'][^"']*pengujian/.test(isi), `src/${nama} mengimpor ./pengujian`).toBe(false);
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    const daftar = berkasProduksi();
    expect(daftar.length).toBeGreaterThan(3);
    // Folder pengujian benar-benar dikecualikan, bukan kebetulan kosong.
    expect(daftar.some((n) => n.startsWith("pengujian/"))).toBe(false);
    // Dan pemindainya bisa menemukan pelanggaran.
    expect(/from\s+["']axe-core["']/.test(tanpaKomentar('import x from "axe-core";'))).toBe(true);
  });

  it("entry `pengujian` MEMANG memakai axe-core — pemisahannya bermakna", () => {
    // Arah sebaliknya: kalau folder ini juga bebas axe, pemisahan ini hanya
    // folder kosong yang menciptakan ilusi arsitektur.
    const isi = readFileSync(join(SRC, "pengujian", "axe.ts"), "utf8");
    expect(isi).toContain('from "axe-core"');
  });
});
