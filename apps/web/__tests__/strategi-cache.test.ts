// Aturan cache service worker — bagian paling berbahaya dari PR-025d.
//
// Service worker yang keliru menyimpan sesuatu akan menyajikannya BERULANG
// KALI kepada pengguna yang sama, tanpa batas waktu, dan tanpa cara mudah
// membatalkannya dari sisi server. Karena itu logikanya murni dan diuji di
// sini, bukan ditemukan lewat laporan pengguna.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NAMA_CACHE, cacheUsang, putuskanStrategi } from "../src/shared/pwa/strategi-cache.js";

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ASAL = "https://nawasena.id";

const minta = (url: string, extra: { method?: string; navigasi?: boolean } = {}) =>
  putuskanStrategi(
    { url, method: extra.method ?? "GET", navigasi: extra.navigasi ?? false },
    ASAL,
  );

describe("putuskanStrategi — yang BOLEH disimpan", () => {
  it("aset build ber-hash → cache-dulu", () => {
    // Namanya ber-hash isi, jadi isinya tidak pernah berubah untuk nama yang
    // sama. Itulah satu-satunya alasan cache-dulu aman di sini.
    expect(minta(`${ASAL}/assets/index-BX1ut2nl.js`)).toBe("cache-dulu");
    expect(minta(`${ASAL}/assets/index-G7h8I9.css`)).toBe("cache-dulu");
  });
});

describe("putuskanStrategi — penolakan yang menentukan", () => {
  it("TIDAK PERNAH menyimpan API — penolakan terpenting di berkas ini", () => {
    // Respons API bergantung pada sesi. Menyimpan satu saja berarti berisiko
    // menyajikan data satu pengguna kepada pengguna lain di perangkat sama.
    expect(minta(`${ASAL}/api/v1/me`)).toBe("lewati");
    expect(minta(`${ASAL}/api/v1/jobs?q=a`)).toBe("lewati");
    expect(minta(`${ASAL}/api/`)).toBe("lewati");
  });

  it("TIDAK menyimpan dokumen HTML — sumber 'terkunci di versi lama'", () => {
    // index.html satu-satunya berkas yang namanya TIDAK ber-hash. Menyimpannya
    // berarti pengguna bisa terpaku pada rujukan bundel lama tanpa cara memaksa
    // pembaruan — kegagalan service worker yang paling sering terjadi.
    expect(minta(`${ASAL}/`, { navigasi: true })).toBe("lewati");
    expect(minta(`${ASAL}/masuk`, { navigasi: true })).toBe("lewati");
    expect(minta(`${ASAL}/`)).toBe("lewati");
    expect(minta(`${ASAL}/index.html`)).toBe("lewati");
  });

  it("hanya GET — metode lain mengubah keadaan di server", () => {
    // Menyajikan POST dari cache berarti mengulang aksi atau menyembunyikan
    // kegagalannya.
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
      expect(minta(`${ASAL}/assets/index-A1.js`, { method })).toBe("lewati");
    }
  });

  it("hanya asal sendiri", () => {
    expect(minta("https://cdn.pihak-ketiga.com/assets/x.js")).toBe("lewati");
    // Perhatikan: jalurnya SAMA-SAMA /assets/. Yang membedakan hanya asalnya.
    expect(minta("http://nawasena.id/assets/x.js")).toBe("lewati");
  });

  it("URL tak berbentuk → lewati, bukan melempar", () => {
    // Service worker yang melempar di dalam handler `fetch` bisa menggagalkan
    // permintaannya sama sekali.
    expect(minta("bukan-url")).toBe("lewati");
    expect(minta("")).toBe("lewati");
  });

  it("bawaannya MENOLAK — jalur yang belum terpikirkan tidak ikut tersimpan", () => {
    // Aturan baru harus ditambahkan sadar. Kalau bawaannya "cache-dulu",
    // setiap jalur baru akan tersimpan diam-diam sampai ada yang sadar.
    expect(minta(`${ASAL}/gambar-unggahan/foto.png`)).toBe("lewati");
    expect(minta(`${ASAL}/manifest.webmanifest`)).toBe("lewati");
    expect(minta(`${ASAL}/entah-apa`)).toBe("lewati");
  });

  it("jalur yang MENYERUPAI aset tidak lolos", () => {
    // `/assets` harus jadi awalan sesungguhnya, bukan sekadar muncul di URL.
    expect(minta(`${ASAL}/api/assets/bocor.js`)).toBe("lewati");
    expect(minta(`${ASAL}/palsu/assets/x.js`)).toBe("lewati");
  });
});

describe("penolakan /api/ sebagai pertahanan berlapis", () => {
  // TEMUAN UJI MUTASI (PR-025d): mencabut baris `startsWith("/api/")` membuat
  // NOL test di berkas ini merah. Sebabnya, `/api/v1/me` tetap jatuh ke
  // `return "lewati"` bawaan — jadi test perilaku di atas memeriksa HASIL yang
  // kebetulan sama, bukan aturannya.
  //
  // Dengan aturan hari ini, tidak ada URL yang bisa sekaligus berawalan `/api/`
  // dan `/assets/`, sehingga penolakan itu memang belum menanggung beban. Ia
  // ada untuk perubahan yang belum terjadi: begitu seseorang melonggarkan
  // langkah terakhir (mis. "cache semua GET asal sendiri"), baris itulah
  // satu-satunya yang menahan respons ber-sesi ikut tersimpan.
  //
  // Perilaku tidak bisa membedakannya hari ini. Keberadaannya bisa.
  const sumber = readFileSync(join(AKAR, "src/shared/pwa/strategi-cache.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  it("penolakan eksplisit /api/ masih ada di sumber", () => {
    expect(sumber).toMatch(/pathname\.startsWith\(\s*["']\/api\//);
  });

  it("bawaan fungsi tetap menolak", () => {
    // Pasangan dari atas: kalau bawaannya kelak berubah jadi "cache-dulu",
    // penolakan /api/ berubah dari berlapis menjadi SATU-SATUNYA penahan.
    expect(sumber).toMatch(/return\s+"lewati";\s*\}/);
  });
});

describe("cacheUsang", () => {
  it("menandai versi lama milik kita, dan HANYA milik kita", () => {
    const usang = cacheUsang([NAMA_CACHE, "nawasena-aset-v0", "cache-aplikasi-lain"]);
    expect(usang).toEqual(["nawasena-aset-v0"]);
    // Menghapus cache milik origin lain di perangkat yang sama bukan urusan
    // kita — dan bisa merusak aplikasi orang.
    expect(usang).not.toContain("cache-aplikasi-lain");
  });

  it("tidak menghapus versi yang sedang berjalan", () => {
    expect(cacheUsang([NAMA_CACHE])).toEqual([]);
  });
});
