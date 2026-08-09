// `gabungKelas` — dasar setiap komponen di paket ini.
//
// Yang diuji bukan penyambungan string, melainkan PENYELESAIAN TABRAKAN.
// Tailwind menghasilkan kelas yang saling menimpa, dan pemenangnya ditentukan
// urutan di lembar gaya — BUKAN urutan di atribut class. Tanpa penggabungan
// yang benar, `className` dari pemakai akan tampak berlaku di sebagian kasus
// dan diam-diam gagal di sebagian lain.
import { describe, expect, it } from "vitest";
import { gabungKelas } from "../src/gabung-kelas.js";

describe("gabungKelas — dasar", () => {
  it("menggabungkan kelas biasa", () => {
    expect(gabungKelas("a", "b")).toBe("a b");
  });

  it("mengabaikan nilai kosong dan bersyarat", () => {
    expect(gabungKelas("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("menerima array dan objek (lewat clsx)", () => {
    expect(gabungKelas(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});

describe("gabungKelas — tabrakan kelas Tailwind", () => {
  it("yang belakangan MENANG", () => {
    expect(gabungKelas("p-2", "p-4")).toBe("p-4");
    expect(gabungKelas("text-sm", "text-lg")).toBe("text-lg");
  });

  it("kelas yang tidak bertabrakan tetap dipertahankan", () => {
    expect(gabungKelas("p-2 font-bold", "p-4")).toBe("font-bold p-4");
  });
});

describe("gabungKelas — kelas kustom preset kita", () => {
  it("`min-h-sentuh` dikenali sebagai anggota grup min-h", () => {
    // Tanpa pendaftaran di `extendTailwindMerge`, twMerge tidak tahu
    // `min-h-sentuh` bertabrakan dengan `min-h-0` — keduanya akan sama-sama
    // lolos, dan yang menang ditentukan urutan lembar gaya.
    expect(gabungKelas("min-h-sentuh", "min-h-0")).toBe("min-h-0");
    expect(gabungKelas("min-h-0", "min-h-sentuh")).toBe("min-h-sentuh");
  });

  it("`min-w-sentuh` juga", () => {
    expect(gabungKelas("min-w-sentuh", "min-w-0")).toBe("min-w-0");
  });

  it("target sentuh BISA ditimpa pemakai — itu disengaja, dan berbahaya", () => {
    // Penggabungan yang benar membuat penimpaan berlaku secara PASTI, bukan
    // kadang-kadang. Bahwa ia bisa ditimpa sama sekali adalah keputusan API:
    // sebagian kontrol memang punya alasan sah (mis. berada di dalam sel tabel
    // padat). Penjagaannya bukan di sini melainkan di review — dan di PR-031b,
    // yang bisa mengukur ukuran sebenarnya di browser.
    expect(gabungKelas("min-h-sentuh", "min-h-4")).toBe("min-h-4");
  });
});
