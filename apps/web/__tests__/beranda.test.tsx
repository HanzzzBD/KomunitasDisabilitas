// Halaman landing (PR-032a) — AC PR-032 nomor 2 (struktur heading & landmark),
// nomor 3 (CTA daftar → login), dan bagian 032a dari nomor 5 (id + id-simple).
//
// Dirender lewat `ruteApp` YANG SAMA dengan produksi, bukan dengan memasang
// <Beranda /> langsung: landmark `<main>` kini milik `TataLetak`, dan halaman
// yang diuji di luar kerangkanya akan tampak tidak punya landmark sama sekali —
// atau, lebih buruk, menyembunyikan kenyataan bahwa ada DUA.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";

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

async function renderBeranda({ bahasaSederhana = false } = {}) {
  const store = createA11yStore({ storage: memori() });
  if (bahasaSederhana) store.getState().setPreferensi({ simpleLanguage: true });

  const router = createMemoryRouter(ruteApp, { initialEntries: ["/"] });
  const hasil = render(
    <Providers a11yStore={store}>
      <RouterProvider router={router} />
    </Providers>,
  );
  // Timeout dinaikkan dari bawaan 1 detik: route dimuat `import()` dinamis, dan
  // biaya memuat chunk pertama kali ditanggung test yang kebetulan berjalan
  // duluan. Dengan seluruh berkas test berjalan paralel — apalagi di runner CI
  // yang lebih lambat daripada mesin pengembang — satu detik cukup untuk gagal
  // karena mesinnya sibuk, bukan karena halamannya salah. Kegagalan seperti itu
  // membuat gerbang berhenti dipercaya.
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
  return hasil;
}

afterEach(cleanup);

describe("landing — isi & ajakan (AC 3)", () => {
  it("judul tingkat satu menjawab 'halaman ini soal apa', bukan sekadar nama merek", async () => {
    await renderBeranda();

    // "Nawasena" tidak memberi tahu apa pun kepada orang yang baru pertama
    // mendengarnya — dan pengguna screen reader yang melompat ke <h1> mendarat
    // tepat di sini.
    const judul = await screen.findByRole("heading", { level: 1 });
    expect(judul).toHaveTextContent("Cari kerja tanpa hambatan");
  });

  it("CTA menuju halaman masuk, dan berupa TAUTAN bukan tombol", async () => {
    await renderBeranda();

    const cta = screen.getAllByRole("link", { name: /Mulai sekarang|Daftar atau masuk/ });
    // Dua ajakan: satu di hero, satu di penutup. Pembaca yang sampai ke bawah
    // halaman tidak boleh harus menggulir kembali ke atas untuk menemukannya.
    expect(cta.length).toBeGreaterThanOrEqual(2);

    for (const tautan of cta) {
      // Peran `link`, bukan `button`: hanya tautan yang bisa dibuka di tab baru,
      // disalin alamatnya, dan ditelusuri perayap mesin pencari — dan screen
      // reader mengumumkan keduanya secara berbeda.
      expect(tautan).toHaveAttribute("href", "/masuk");
    }
  });

  it("nilai produk ditulis sebagai DAFTAR, bukan tiga blok berdampingan", async () => {
    await renderBeranda();

    // `region` (bukan sekadar querySelector) sekaligus membuktikan sambungan
    // `aria-labelledby` bekerja: tanpa nama, <section> tidak muncul sebagai
    // landmark bernama sama sekali.
    const bagian = screen.getByRole("region", { name: /Yang Anda dapat di sini/ });

    // Screen reader mengumumkan "daftar, 3 item" dan memberi nomor tiap butir.
    // Tiga <div> bersebelahan tidak mengumumkan apa pun.
    const daftar = within(bagian).getByRole("list");
    expect(within(daftar).getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("landing — struktur heading & landmark (AC 2)", () => {
  it("tepat satu <main> di seluruh halaman", async () => {
    const { container } = await renderBeranda();

    // Landmark utama ganda membuat perintah "lompat ke konten utama" milik
    // screen reader menjadi ambigu. Yang kedua selalu lahir belakangan — di
    // sinilah ia tertangkap.
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "konten-utama");
  });

  it("tingkat heading tidak melompat", async () => {
    const { container } = await renderBeranda();

    const tingkat = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
      Number(h.tagName[1]),
    );

    expect(tingkat[0], "halaman tidak dimulai dari <h1>").toBe(1);
    for (const [i, sekarang] of tingkat.entries()) {
      if (i === 0) continue;
      const sebelumnya = tingkat[i - 1] as number;
      // Melompat 1 → 3 membuat pengguna screen reader menyangka ada bagian yang
      // terlewat, sebab urutan tingkat inilah kerangka halaman baginya.
      expect(sekarang, `tingkat melompat dari h${sebelumnya} ke h${sekarang}`).toBeLessThanOrEqual(
        sebelumnya + 1,
      );
    }
  });

  it("setiap section punya nama, bukan sekadar 'region'", async () => {
    const { container } = await renderBeranda();

    for (const section of container.querySelectorAll("section")) {
      const idJudul = section.getAttribute("aria-labelledby");
      if (idJudul === null) continue;
      expect(
        container.querySelector(`#${idJudul}`),
        `aria-labelledby="${idJudul}" menunjuk elemen yang tidak ada`,
      ).not.toBeNull();
    }

    // Penjaga agar test di atas tidak lulus secara hampa bila seluruh
    // `aria-labelledby` suatu saat hilang.
    expect(container.querySelectorAll("section[aria-labelledby]").length).toBeGreaterThan(0);
  });
});

describe("landing — dua varian bahasa (AC 5)", () => {
  it("mode bahasa sederhana mengubah isi halaman, bukan hanya shell", async () => {
    await renderBeranda({ bahasaSederhana: true });

    // Diperiksa pada DUA kalimat dari bagian yang berbeda: satu saja bisa lolos
    // karena kebetulan, mis. bila hanya hero yang tersambung ke katalog.
    expect(await screen.findByText(/Cari kerja yang cocok untuk Anda/)).toBeInTheDocument();
    expect(screen.getByText(/Anda boleh berhenti kapan saja/)).toBeInTheDocument();
  });

  it("mode bawaan menampilkan varian `id`", async () => {
    await renderBeranda();
    expect(screen.getByText(/Gratis, dan Anda bisa berhenti kapan saja/)).toBeInTheDocument();
  });
});

describe("landing — judul dokumen", () => {
  it("judul tab menyebut halamannya, bukan hanya merek", async () => {
    await renderBeranda();

    // Sepuluh entri riwayat bernama "Nawasena" tidak bisa dibedakan — dan screen
    // reader membacakan judul inilah saat halaman berganti.
    expect(document.title).toBe("Cari kerja tanpa hambatan · Nawasena");
  });
});
