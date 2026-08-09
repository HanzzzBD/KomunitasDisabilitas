// Gerbang aksesibilitas lapis kedua atas SELURUH tampilan yang sudah ada
// (PR-031a). Dipasang SEBELUM pustaka komponen lahir di PR-027 — itulah inti
// penataan ulang urutan phase ini: sembilan komponen yang lahir tanpa penjaga
// akan diperbaiki belakangan, dan perbaikannya menyentuh setiap pemakainya.
//
// BATAS: jsdom tidak menggambar apa pun, jadi kontras warna dan ukuran target
// sentuh TIDAK diperiksa di sini (lihat @nawasena/a11y/pengujian). Keduanya
// milik PR-031b dengan browser sungguhan. Lulus di berkas ini berarti "tidak
// melanggar aturan yang bisa diperiksa tanpa layar", bukan "aksesibel".
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { PenyediaI18n } from "../src/shared/i18n/index.js";
import { BannerLuring } from "../src/app/banner-luring.js";
import { LayarKesalahan } from "../src/app/kesalahan.js";

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

function setDaring(nilai: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: nilai, configurable: true });
}

afterEach(() => {
  cleanup();
  setDaring(true);
});

async function renderHalaman(jalur: string) {
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  const { container } = render(
    <Providers a11yStore={createA11yStore({ storage: memori() })}>
      <RouterProvider router={router} />
    </Providers>,
  );
  // Route dimuat lazy — tunggu isinya benar-benar ada sebelum diperiksa.
  await screen.findByRole("heading", { level: 1 });
  return container;
}

describe("halaman lolos gerbang aksesibilitas", () => {
  it("beranda", async () => {
    await harusLolosAksesibilitas(await renderHalaman("/"));
  });

  it("halaman masuk", async () => {
    await harusLolosAksesibilitas(await renderHalaman("/masuk"));
  });

  it("halaman tidak ditemukan (404)", async () => {
    await harusLolosAksesibilitas(await renderHalaman("/jalur-asing"));
  });
});

describe("keadaan kegagalan lolos gerbang aksesibilitas", () => {
  // Justru keadaan inilah yang paling sering luput dari pemeriksaan: ia jarang
  // terlihat saat pengembangan, dan muncul tepat ketika pengguna sedang paling
  // butuh bisa membacanya.

  it("banner luring", async () => {
    setDaring(false);
    const { container } = render(
      <Providers a11yStore={createA11yStore({ storage: memori() })}>
        <main>
          <h1>Halaman</h1>
          <BannerLuring />
        </main>
      </Providers>,
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await harusLolosAksesibilitas(container);
  });

  it("layar kesalahan", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          loader: () => {
            throw new Error("boom");
          },
          Component: () => null,
          ErrorBoundary: LayarKesalahan,
        },
      ],
      { initialEntries: ["/"] },
    );
    const { container } = render(
      <PenyediaI18n>
        <RouterProvider router={router} />
      </PenyediaI18n>,
    );
    await screen.findByRole("heading", { level: 1 });

    await harusLolosAksesibilitas(container);
  });
});

describe("lolos pada kombinasi preferensi aksesibilitas", () => {
  it("teks 200% + kontras tinggi + bahasa sederhana", async () => {
    // Kombinasi preferensi adalah risiko tertulis PR-026 ("kombinasi preferensi
    // merusak layout"). Matriks penuhnya milik PR-036; yang diperiksa di sini
    // hanya bahwa menyalakan semuanya tidak merusak struktur aksesibilitasnya.
    const store = createA11yStore({ storage: memori() });
    store.getState().setPreferensi({
      textScale: 200,
      highContrast: true,
      simpleLanguage: true,
      largeTouchTargets: true,
    });

    const router = createMemoryRouter(ruteApp, { initialEntries: ["/"] });
    const { container } = render(
      <Providers a11yStore={store}>
        <RouterProvider router={router} />
      </Providers>,
    );
    await screen.findByRole("heading", { level: 1 });

    await harusLolosAksesibilitas(container);
  });
});
