// AC PR-026: (1) OS dihormati bila pengguna belum set eksplisit,
//            (2) perubahan store LANGSUNG mengubah token DOM.
//
// Diuji tanpa merender satu komponen pun — glue-nya memang bebas React.
import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createA11yStore } from "../src/store.js";
import { hubungkanKeDom } from "../src/web/hubungkan.js";
import { KUERI_OS, type JendelaMedia } from "../src/web/os.js";

function memori(): StateStorage {
  const isi: Record<string, string> = {};
  return {
    getItem: (k) => isi[k] ?? null,
    setItem: (k, v) => {
      isi[k] = v;
    },
    removeItem: (k) => {
      delete isi[k];
    },
  };
}

function jendelaPalsu(cocok: Partial<Record<string, boolean>> = {}) {
  const pemicu = new Map<string, (() => void)[]>();
  const jendela: JendelaMedia = {
    matchMedia(kueri: string) {
      const daftar = pemicu.get(kueri) ?? [];
      pemicu.set(kueri, daftar);
      return {
        media: kueri,
        matches: cocok[kueri] ?? false,
        addEventListener: (_n: string, cb: () => void) => daftar.push(cb),
        removeEventListener: () => {},
      } as unknown as MediaQueryList;
    },
  };
  return { jendela, pemicu, cocok };
}

const siapkan = (cocok: Partial<Record<string, boolean>> = {}) => {
  const store = createA11yStore({ storage: memori() });
  const el = document.createElement("html");
  const { jendela, pemicu } = jendelaPalsu(cocok);
  return { store, el, jendela, pemicu };
};

describe("hubungkanKeDom — keadaan awal", () => {
  it("menerapkan token SEBELUM interaksi pertama", () => {
    // Terbalik urutannya, akan ada satu frame ketika layar memakai bawaan
    // alih-alih setelan pengguna — kedipan yang paling terasa justru bagi
    // pengguna yang paling membutuhkan setelan itu.
    const { store, el, jendela } = siapkan();
    store.getState().setPreferensi({ textScale: 150 });

    hubungkanKeDom({ store, elemen: el, jendela });

    expect(el.style.getPropertyValue("--font-scale")).toBe("1.5");
  });

  it("AC-1: setelan OS berlaku bila pengguna belum memilih", () => {
    const { store, el, jendela } = siapkan({ [KUERI_OS.reduceMotion]: true });
    hubungkanKeDom({ store, elemen: el, jendela });

    expect(el.getAttribute("data-motion")).toBe("reduced");
  });

  it("AC-1: pilihan pengguna MENANG atas setelan OS", () => {
    const { store, el, jendela } = siapkan({ [KUERI_OS.reduceMotion]: true });
    store.getState().setPreferensi({ reduceMotion: false });

    hubungkanKeDom({ store, elemen: el, jendela });

    expect(el.hasAttribute("data-motion")).toBe(false);
  });
});

describe("hubungkanKeDom — perubahan langsung (AC-2)", () => {
  it("mengubah store langsung menulis ulang token", () => {
    const { store, el, jendela } = siapkan();
    hubungkanKeDom({ store, elemen: el, jendela });

    store.getState().setPreferensi({ highContrast: true, textScale: 175 });

    expect(el.getAttribute("data-contrast")).toBe("high");
    expect(el.style.getPropertyValue("--font-scale")).toBe("1.75");
  });

  it("mematikan preferensi langsung menghapus atributnya", () => {
    const { store, el, jendela } = siapkan();
    hubungkanKeDom({ store, elemen: el, jendela });

    store.getState().setPreferensi({ simpleLanguage: true });
    expect(el.getAttribute("data-lang-mode")).toBe("simple");

    store.getState().setPreferensi({ simpleLanguage: false });
    expect(el.hasAttribute("data-lang-mode")).toBe(false);
  });

  it("`hapusPilihan` mengembalikan kendali ke setelan OS, langsung di DOM", () => {
    const { store, el, jendela } = siapkan({ [KUERI_OS.reduceMotion]: true });
    store.getState().setPreferensi({ reduceMotion: false });
    hubungkanKeDom({ store, elemen: el, jendela });
    expect(el.hasAttribute("data-motion")).toBe(false);

    store.getState().hapusPilihan("reduceMotion");

    expect(el.getAttribute("data-motion")).toBe("reduced");
  });
});

describe("hubungkanKeDom — perubahan setelan OS di tengah sesi", () => {
  it("perubahan OS masuk lewat store, bukan ditulis langsung ke DOM", () => {
    // Dua jalur penulisan bisa menghasilkan keadaan berbeda. Karena itu
    // pemantau OS hanya memperbarui store, dan langganan store yang menulis.
    const { store, el, jendela, pemicu } = siapkan({ [KUERI_OS.reduceMotion]: false });
    hubungkanKeDom({ store, elemen: el, jendela });
    expect(el.hasAttribute("data-motion")).toBe(false);

    // Pengguna menyalakan "kurangi gerak" di setelan sistem.
    (jendela as unknown as { matchMedia: (k: string) => MediaQueryList }).matchMedia = (k) =>
      ({ media: k, matches: k === KUERI_OS.reduceMotion, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
    pemicu.get(KUERI_OS.reduceMotion)?.forEach((cb) => cb());

    expect(store.getState().os.reduceMotion).toBe(true);
    expect(el.getAttribute("data-motion")).toBe("reduced");
  });
});

describe("hubungkanKeDom — pembatalan", () => {
  it("setelah dibatalkan, perubahan store tidak lagi menyentuh DOM", () => {
    const { store, el, jendela } = siapkan();
    const batal = hubungkanKeDom({ store, elemen: el, jendela });
    batal();

    store.getState().setPreferensi({ highContrast: true });

    expect(el.hasAttribute("data-contrast")).toBe(false);
  });

  it("pembatalan aman dipanggil pada elemen yang sudah dilepas", () => {
    const { store, el, jendela } = siapkan();
    const batal = hubungkanKeDom({ store, elemen: el, jendela });
    expect(() => {
      batal();
    }).not.toThrow();
    expect(vi.isMockFunction(batal)).toBe(false);
  });
});
