// AC PR-026: "Tidak ada flash-of-wrong-theme saat load (init sebelum paint)."
//
// Skrip pra-paint MENYALIN logika `rekonsiliasi()` + `tokenDari()` karena ia
// berjalan di <head> sebelum modul apa pun dimuat, jadi tidak bisa mengimpornya.
// Duplikasi itu tak terhindarkan; yang bisa dihindari adalah duplikasi yang
// MENYIMPANG.
//
// Test ini bukan membandingkan teks. Ia MENJALANKAN skrip di jsdom lalu
// membandingkan DOM hasilnya dengan keluaran fungsi aslinya, untuk sebuah
// matriks preferensi. Kalau salah satu berubah tanpa yang lain, ia merah.
import { afterEach, describe, expect, it } from "vitest";
import { KUNCI_PENYIMPANAN, rekonsiliasi, type UpdateAccessibilityPreferences } from "@nawasena/a11y";
import { terapkanToken } from "@nawasena/a11y/web";
import { SKRIP_PRA_PAINT } from "../src/shared/a11y/skrip-pra-paint.js";

function jalankanSkrip() {
  new Function(SKRIP_PRA_PAINT)();
}

function simpan(pilihan: UpdateAccessibilityPreferences) {
  localStorage.setItem(
    KUNCI_PENYIMPANAN,
    JSON.stringify({ state: { pilihanPengguna: pilihan }, version: 1 }),
  );
}

/** Bentuk yang dihasilkan fungsi asli, sebagai pembanding. */
function acuan(pilihan: UpdateAccessibilityPreferences) {
  const el = document.createElement("html");
  terapkanToken(el, rekonsiliasi(pilihan, { reduceMotion: false, highContrast: false }));
  return {
    fontScale: el.style.getPropertyValue("--font-scale"),
    touch: el.style.getPropertyValue("--touch-target-min"),
    contrast: el.getAttribute("data-contrast"),
    motion: el.getAttribute("data-motion"),
    lang: el.getAttribute("data-lang-mode"),
  };
}

function hasilSkrip() {
  const el = document.documentElement;
  return {
    fontScale: el.style.getPropertyValue("--font-scale"),
    touch: el.style.getPropertyValue("--touch-target-min"),
    contrast: el.getAttribute("data-contrast"),
    motion: el.getAttribute("data-motion"),
    lang: el.getAttribute("data-lang-mode"),
  };
}

afterEach(() => {
  localStorage.clear();
  const el = document.documentElement;
  el.removeAttribute("style");
  for (const a of ["data-contrast", "data-motion", "data-lang-mode"]) el.removeAttribute(a);
});

/** Matriks preferensi — bukan satu kasus bahagia. */
const KASUS: Array<[string, UpdateAccessibilityPreferences]> = [
  ["kosong", {}],
  ["teks 200%", { textScale: 200 }],
  ["teks 125%", { textScale: 125 }],
  ["kontras tinggi", { highContrast: true }],
  ["kurangi gerak", { reduceMotion: true }],
  ["bahasa sederhana", { simpleLanguage: true }],
  ["target sentuh besar", { largeTouchTargets: true }],
  ["semua menyala", {
    textScale: 175,
    highContrast: true,
    reduceMotion: true,
    simpleLanguage: true,
    largeTouchTargets: true,
  }],
  ["eksplisit mati", { highContrast: false, reduceMotion: false }],
  ["tanpa token", { prefersSignLanguage: true, screenReaderHint: true }],
];

describe("skrip pra-paint setara dengan fungsi aslinya", () => {
  it.each(KASUS)("%s", (_nama, pilihan) => {
    simpan(pilihan);
    jalankanSkrip();
    expect(hasilSkrip()).toEqual(acuan(pilihan));
  });
});

describe("skrip pra-paint — ketahanan", () => {
  it("kunci penyimpanan SAMA dengan milik paket", () => {
    // Disalin, bukan diimpor (Vite memuat config lewat loader Node yang tidak
    // bisa memetakan .js → .ts untuk paket workspace). Kunci yang menyimpang
    // berarti skrip membaca preferensi dari tempat yang salah — gejalanya
    // persis kedipan yang hendak dicegah PR ini, hanya saja permanen.
    expect(SKRIP_PRA_PAINT).toContain(JSON.stringify(KUNCI_PENYIMPANAN));
  });

  it("tanpa preferensi tersimpan → bawaan, bukan kosong", () => {
    jalankanSkrip();
    expect(hasilSkrip().fontScale).toBe("1");
    expect(hasilSkrip().touch).toBe("44px");
  });

  it("JSON rusak tidak menjatuhkan halaman", () => {
    // Skrip yang melempar di <head> MENGHENTIKAN penguraian dokumen — layar
    // kosong, bukan sekadar preferensi yang gagal dimuat.
    localStorage.setItem(KUNCI_PENYIMPANAN, "{bukan json");
    expect(() => {
      jalankanSkrip();
    }).not.toThrow();
    expect(hasilSkrip().fontScale).toBe("1");
  });

  it("bentuk tersimpan yang asing diabaikan, bukan dipercaya", () => {
    localStorage.setItem(KUNCI_PENYIMPANAN, JSON.stringify({ state: null }));
    expect(() => {
      jalankanSkrip();
    }).not.toThrow();
    expect(hasilSkrip().contrast).toBeNull();
  });

  it("textScale non-angka jatuh ke 100", () => {
    simpan({ textScale: "besar" as unknown as number });
    jalankanSkrip();
    expect(hasilSkrip().fontScale).toBe("1");
  });
});
