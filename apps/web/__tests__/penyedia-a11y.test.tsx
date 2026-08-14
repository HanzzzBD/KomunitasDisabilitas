// Integrasi: store preferensi → DOM aplikasi, dan → mode bahasa i18n.
//
// Inilah yang membuat AC 1 & 2 (PR-026b) benar-benar berlaku di aplikasi, bukan
// hanya di paket. Sampai PR ini, `apps/web` belum memanggil apa pun dari
// `@nawasena/a11y`.
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { Providers } from "../src/app/providers.js";
import { useTeks } from "../src/shared/i18n/index.js";

function memori(): PenyimpananA11y {
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

function Tagline() {
  return <p>{useTeks()("shell.beranda.tagline")}</p>;
}

afterEach(() => {
  const el = document.documentElement;
  el.removeAttribute("style");
  for (const a of ["data-contrast", "data-motion", "data-lang-mode"]) el.removeAttribute(a);
});

describe("PenyediaA11y — token diterapkan ke halaman nyata", () => {
  it("preferensi tersimpan langsung tampak di <html>", () => {
    const store = createA11yStore({ storage: memori() });
    store.getState().setPreferensi({ textScale: 150, highContrast: true });

    render(
      <Providers a11yStore={store}>
        <p>halo</p>
      </Providers>,
    );

    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1.5");
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
  });

  it("perubahan preferensi setelah render langsung mengubah <html>", () => {
    const store = createA11yStore({ storage: memori() });
    render(
      <Providers a11yStore={store}>
        <p>halo</p>
      </Providers>,
    );

    store.getState().setPreferensi({ largeTouchTargets: true });

    expect(document.documentElement.style.getPropertyValue("--touch-target-min")).toBe("56px");
  });
});

describe("SambungkanBahasa — preferensi menggerakkan i18n", () => {
  it("simpleLanguage tersimpan → teks varian sederhana", async () => {
    const store = createA11yStore({ storage: memori() });
    store.getState().setPreferensi({ simpleLanguage: true });

    render(
      <Providers a11yStore={store}>
        <Tagline />
      </Providers>,
    );

    expect(await screen.findByText(/Cari kerja yang ramah/)).toBeInTheDocument();
  });

  it("mengubah preferensi setelah render ikut mengubah teks", async () => {
    const store = createA11yStore({ storage: memori() });
    render(
      <Providers a11yStore={store}>
        <Tagline />
      </Providers>,
    );
    expect(screen.getByText(/Ekosistem karier inklusif/)).toBeInTheDocument();

    store.getState().setPreferensi({ simpleLanguage: true });

    expect(await screen.findByText(/Cari kerja yang ramah/)).toBeInTheDocument();
  });

  it("mematikan simpleLanguage mengembalikan varian penuh", async () => {
    const store = createA11yStore({ storage: memori() });
    store.getState().setPreferensi({ simpleLanguage: true });
    render(
      <Providers a11yStore={store}>
        <Tagline />
      </Providers>,
    );
    await screen.findByText(/Cari kerja yang ramah/);

    store.getState().setPreferensi({ simpleLanguage: false });

    expect(await screen.findByText(/Ekosistem karier inklusif/)).toBeInTheDocument();
  });

  it("arahnya SATU — mode i18n tidak menulis balik ke preferensi", () => {
    // Menyambungkannya dua arah akan melahirkan dua tempat yang sama-sama
    // mengklaim tahu bahasa mana yang sedang dipakai, dan keduanya bisa benar
    // sekaligus salah.
    const store = createA11yStore({ storage: memori() });
    render(
      <Providers a11yStore={store} modeBahasaAwal="id-simple">
        <Tagline />
      </Providers>,
    );

    expect(store.getState().pilihanPengguna.simpleLanguage).toBeUndefined();
  });
});
