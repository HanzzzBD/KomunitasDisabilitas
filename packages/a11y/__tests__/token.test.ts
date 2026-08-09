// Token CSS yang dibaca seluruh Tailwind preset (SDD §4.3).
import { describe, expect, it } from "vitest";
import { ACCESSIBILITY_DEFAULTS, type AccessibilityPreferences } from "@nawasena/schemas";
import { TANPA_TOKEN, TARGET_SENTUH_PX, terapkanToken, tokenDari } from "../src/web/token.js";

const pref = (ubah: Partial<AccessibilityPreferences> = {}): AccessibilityPreferences => ({
  ...ACCESSIBILITY_DEFAULTS,
  ...ubah,
});

describe("tokenDari — nilai", () => {
  it("textScale menjadi PENGALI, bukan piksel", () => {
    // Tailwind preset mengalikannya dengan ukuran dasar tiap kelas teks.
    expect(tokenDari(pref()).properti["--font-scale"]).toBe("1");
    expect(tokenDari(pref({ textScale: 150 })).properti["--font-scale"]).toBe("1.5");
    expect(tokenDari(pref({ textScale: 200 })).properti["--font-scale"]).toBe("2");
  });

  it("target sentuh 44px, naik ke 56px saat largeTouchTargets", () => {
    expect(tokenDari(pref()).properti["--touch-target-min"]).toBe(`${TARGET_SENTUH_PX.normal}px`);
    expect(tokenDari(pref({ largeTouchTargets: true })).properti["--touch-target-min"]).toBe(
      `${TARGET_SENTUH_PX.besar}px`,
    );
  });

  it("atribut DIHAPUS saat tidak aktif, bukan disetel nilai 'mati'", () => {
    // `[data-contrast="high"]` lebih mudah dibaca daripada
    // `:not([data-contrast="normal"])`, dan atribut yang selalu ada mengundang
    // orang menulis aturan untuk nilai mati yang seharusnya cukup jadi bawaan.
    const mati = tokenDari(pref()).atribut;
    expect(mati["data-contrast"]).toBeNull();
    expect(mati["data-motion"]).toBeNull();
    expect(mati["data-lang-mode"]).toBeNull();
  });

  it("atribut memakai nilai persis dari SDD §4.3", () => {
    const hidup = tokenDari(
      pref({ highContrast: true, reduceMotion: true, simpleLanguage: true }),
    ).atribut;
    expect(hidup["data-contrast"]).toBe("high");
    expect(hidup["data-motion"]).toBe("reduced");
    expect(hidup["data-lang-mode"]).toBe("simple");
  });
});

describe("terapkanToken — penulisan ke elemen", () => {
  it("menulis properti dan atribut ke elemen", () => {
    const el = document.createElement("html");
    terapkanToken(el, pref({ textScale: 125, highContrast: true, largeTouchTargets: true }));

    expect(el.style.getPropertyValue("--font-scale")).toBe("1.25");
    expect(el.style.getPropertyValue("--touch-target-min")).toBe("56px");
    expect(el.getAttribute("data-contrast")).toBe("high");
  });

  it("mematikan preferensi MENGHAPUS atributnya", () => {
    // Kegagalan yang paling mungkin: atribut menempel setelah pengguna
    // mematikannya, sehingga layar tidak pernah kembali normal.
    const el = document.createElement("html");
    terapkanToken(el, pref({ reduceMotion: true }));
    expect(el.getAttribute("data-motion")).toBe("reduced");

    terapkanToken(el, pref({ reduceMotion: false }));
    expect(el.hasAttribute("data-motion")).toBe(false);
  });

  it("tidak menyentuh `document` global — elemennya argumen", () => {
    // Kalau fungsi ini mengambil documentElement sendiri, ia akan diam-diam
    // mengubah halaman saat dipanggil dari tempat yang salah.
    const el = document.createElement("div");
    terapkanToken(el, pref({ highContrast: true }));

    expect(el.getAttribute("data-contrast")).toBe("high");
    expect(document.documentElement.hasAttribute("data-contrast")).toBe(false);
  });
});

describe("preferensi tanpa token", () => {
  it("prefersSignLanguage & screenReaderHint tidak muncul di DOM", () => {
    // Keduanya tidak mengubah TAMPILAN — yang pertama memilih ada/tidaknya
    // konten BISINDO, yang kedua mengubah teks bantuan. Komponen membacanya
    // langsung dari store.
    const t = tokenDari(pref({ prefersSignLanguage: true, screenReaderHint: true }));
    const semua = JSON.stringify(t);

    expect(semua).not.toContain("sign");
    expect(semua).not.toContain("screen-reader");
    expect(TANPA_TOKEN).toEqual(["prefersSignLanguage", "screenReaderHint"]);
  });
});
