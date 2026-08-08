// Penjaga untuk PENJAGANYA. AC PR-025 menuntut budget JS < 200 KB gzip
// ditegakkan CI; test ini memastikan penegaknya benar-benar menolak, dan
// menolak hal yang tepat.
//
// Sebabnya konkret: cek budget hanya berjalan di CI setelah `vite build`, jadi
// satu-satunya kesempatan menguji perilaku GAGAL-nya adalah di sini — di CI ia
// diharapkan selalu hijau, sehingga jalur merahnya tidak akan pernah terlewati.
// Penjaga yang jalur gagalnya tidak pernah dieksekusi bukan penjaga.
import { describe, expect, it } from "vitest";
import {
  BATAS_GZIP_BYTES,
  asetAwalDari,
  chunkLazy,
  evaluasiBudget,
  ringkas,
  type UkuranAset,
} from "../scripts/cek-budget.js";

/** Bentuk keluaran Vite yang sebenarnya, disalin apa adanya. */
const HTML_BUILD = `<!doctype html>
<html lang="id">
  <head>
    <script type="module" crossorigin src="/assets/index-A1b2C3.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-D4e5F6.js">
    <link rel="stylesheet" crossorigin href="/assets/index-G7h8I9.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

const aset = (gzipBytes: number, jalur = "/assets/index-A1b2C3.js"): UkuranAset => ({
  jalur,
  gzipBytes,
});

describe("asetAwalDari — apa yang dihitung", () => {
  it("mengambil script modul DAN modulepreload (keduanya diunduh di awal)", () => {
    expect(asetAwalDari(HTML_BUILD)).toEqual([
      "/assets/index-A1b2C3.js",
      "/assets/vendor-D4e5F6.js",
    ]);
  });

  it("TIDAK menghitung CSS — budget SDD §4.5 menyebut JS awal", () => {
    expect(asetAwalDari(HTML_BUILD).some((j) => j.endsWith(".css"))).toBe(false);
  });

  it("TIDAK menghitung chunk lazy yang hanya dirujuk dari dalam JS", () => {
    // Chunk route lazy tidak pernah muncul di index.html. Kalau ia sampai
    // terhitung, code-splitting justru akan membuat budget MERAH — penjaga
    // yang menghukum hal yang seharusnya ia dorong.
    const html = `${HTML_BUILD}\n<!-- /assets/beranda-Z9y8X7.js dimuat lazy -->`;
    expect(asetAwalDari(html)).not.toContain("/assets/beranda-Z9y8X7.js");
  });

  it("html tanpa script modul menghasilkan daftar kosong (dideteksi pemanggil)", () => {
    expect(asetAwalDari("<html><body></body></html>")).toEqual([]);
  });
});

describe("evaluasiBudget — kapan merah", () => {
  it("di bawah batas → lolos", () => {
    const h = evaluasiBudget([aset(150 * 1024)]);
    expect(h.lolos).toBe(true);
    expect(h.sisaBytes).toBe(50 * 1024);
  });

  it("TEPAT di batas → lolos (tidak berdebat satu byte)", () => {
    expect(evaluasiBudget([aset(BATAS_GZIP_BYTES)]).lolos).toBe(true);
  });

  it("satu byte melewati batas → GAGAL", () => {
    const h = evaluasiBudget([aset(BATAS_GZIP_BYTES + 1)]);
    expect(h.lolos).toBe(false);
    expect(h.sisaBytes).toBe(-1);
  });

  it("menjumlahkan seluruh aset, bukan memeriksa satu per satu", () => {
    // Dua chunk yang masing-masing lolos bisa bersama-sama melewati batas.
    // Inilah bentuk kegagalan yang paling mungkin terjadi saat vendor dipisah.
    const h = evaluasiBudget([aset(120 * 1024, "/a.js"), aset(120 * 1024, "/b.js")]);
    expect(h.totalGzipBytes).toBe(240 * 1024);
    expect(h.lolos).toBe(false);
  });

  it("batas bawaan adalah 200 KB biner, sesuai SDD §4.5", () => {
    expect(BATAS_GZIP_BYTES).toBe(204_800);
  });
});

describe("chunkLazy — bukti code-splitting (AC PR-025)", () => {
  const SEMUA = ["/assets/index-A1.js", "/assets/vendor-D4.js", "/assets/beranda-Z9.js", "/assets/masuk-Y8.js"];
  const AWAL = ["/assets/index-A1.js", "/assets/vendor-D4.js"];

  it("mengembalikan chunk yang TIDAK diunduh di awal", () => {
    expect(chunkLazy(SEMUA, AWAL)).toEqual(["/assets/beranda-Z9.js", "/assets/masuk-Y8.js"]);
  });

  it("kosong bila semua chunk masuk payload awal — inilah keadaan yang harus MERAH", () => {
    // Terjadi kalau `import()` dinamis ikut ter-inline (mis. jalurnya diubah
    // menjadi variabel). Tidak ada gejala selain halaman yang makin lambat,
    // jadi hanya penjaga ini yang akan menyadarinya.
    expect(chunkLazy(AWAL, AWAL)).toEqual([]);
  });

  it("tidak terganggu urutan daftar", () => {
    expect(chunkLazy([...SEMUA].reverse(), AWAL)).toHaveLength(2);
  });
});

describe("ringkas — laporan yang bisa ditindaklanjuti", () => {
  it("menyebut tiap aset beserta ukurannya, bukan hanya total", () => {
    // Total saja tidak memberi tahu APA yang harus dikecilkan.
    const teks = ringkas(evaluasiBudget([aset(10 * 1024, "/a.js"), aset(20 * 1024, "/b.js")]));
    expect(teks).toContain("/a.js");
    expect(teks).toContain("/b.js");
    expect(teks).toContain("LOLOS");
  });

  it("menyebut kelebihannya saat gagal", () => {
    const teks = ringkas(evaluasiBudget([aset(BATAS_GZIP_BYTES + 1024)]));
    expect(teks).toContain("GAGAL");
    expect(teks).toContain("kelebihan");
  });
});
