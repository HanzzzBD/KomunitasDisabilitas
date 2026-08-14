// Kerangka aplikasi (PR-032a) — bagian "landmark/skip-link final" pada Scope
// PR-032, dan penopang AC nomor 2.
//
// BATAS YANG HARUS DIPAHAMI SEBELUM MENAMBAH TEST DI SINI: jsdom tidak
// menjalankan navigasi fragmen (`#konten-utama`). Menekan tautan lompat di sini
// TIDAK memindahkan fokus, jadi berkas ini menguji SYARAT-syarat yang membuat
// perpindahan itu mungkin — urutan, sasaran, dan kefokusan sasaran. Perpindahan
// fokus yang sesungguhnya diuji di peramban: `e2e/lompat-ke-konten.spec.ts`.
//
// Pembagian itu disengaja. Menguji "tautannya ada" lalu menyebutnya selesai
// adalah cara paling umum melahirkan tautan lompat yang tidak melompat ke mana
// pun.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { ID_KONTEN_UTAMA } from "../src/app/tata-letak.js";

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

async function renderDi(jalur: string) {
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  const hasil = render(
    <Providers a11yStore={createA11yStore({ storage: memori() })}>
      <RouterProvider router={router} />
    </Providers>,
  );
  // Timeout dinaikkan dari bawaan 1 detik — alasan sama dengan
  // `beranda.test.tsx`: chunk route dimuat dinamis, dan satu detik di runner CI
  // yang sibuk cukup untuk gagal karena mesinnya, bukan karena kodenya.
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
  return hasil;
}

/** Halaman yang memakai kerangka. `/masuk/google` memerlukan titipan OAuth. */
const HALAMAN_BERKERANGKA = ["/", "/masuk"];

afterEach(cleanup);

describe("tautan lompat ke konten", () => {
  it("adalah elemen fokusabel PERTAMA di dokumen", async () => {
    const { container } = await renderDi("/");

    // Ditaruh di urutan kedua, tautan ini tidak menyelesaikan apa pun:
    // gunanya justru menghindari penekanan Tab yang mendahuluinya.
    const fokusabel = container.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    expect(fokusabel[0]).toHaveTextContent("Lompat ke konten utama");
  });

  it("menunjuk sasaran yang BENAR-BENAR ADA dan bisa menerima fokus", async () => {
    const { container } = await renderDi("/");

    const tautan = screen.getByRole("link", { name: "Lompat ke konten utama" });
    expect(tautan).toHaveAttribute("href", `#${ID_KONTEN_UTAMA}`);

    const sasaran = container.querySelector(`#${ID_KONTEN_UTAMA}`);
    expect(sasaran, "sasaran tautan lompat tidak ada di DOM").not.toBeNull();

    // `tabindex="-1"` bukan hiasan: tanpa itu sebagian peramban hanya menggulir
    // ke sasaran tanpa memindahkan fokus, sehingga Tab berikutnya melanjutkan
    // dari tautan lompat — pengguna melihat isi halaman, tetapi fokusnya masih
    // di atas.
    expect(sasaran).toHaveAttribute("tabindex", "-1");
  });

  it("tersembunyi secara visual, TETAPI tetap ada di pohon aksesibilitas", async () => {
    await renderDi("/");

    // `hidden`/`display:none` akan mengeluarkannya dari urutan Tab — yaitu
    // menghapus fungsinya sambil menyisakan markupnya. `getByRole` gagal bila
    // itu terjadi, sebab peran tersembunyi tidak ikut terhitung.
    const tautan = screen.getByRole("link", { name: "Lompat ke konten utama" });
    expect(tautan.className).toContain("sr-only");
    expect(tautan.className).toContain("focus:not-sr-only");
  });

  it("hadir di SETIAP halaman berkerangka, bukan hanya beranda", async () => {
    for (const jalur of HALAMAN_BERKERANGKA) {
      const { unmount } = await renderDi(jalur);
      expect(
        screen.getByRole("link", { name: "Lompat ke konten utama" }),
        `tautan lompat hilang di ${jalur}`,
      ).toBeInTheDocument();
      unmount();
    }
  });
});

describe("landmark utama", () => {
  it("tepat satu <main> di tiap halaman", async () => {
    for (const jalur of HALAMAN_BERKERANGKA) {
      const { container, unmount } = await renderDi(jalur);
      expect(container.querySelectorAll("main"), `jumlah <main> salah di ${jalur}`).toHaveLength(1);
      unmount();
    }
  });

  it("halaman TIDAK menulis <main> sendiri — kerangka yang menyediakannya", async () => {
    // Inilah yang menahan erosi. Halaman berikutnya yang menyalin pola lama
    // ("bungkus semuanya dengan <main>") akan menghasilkan landmark utama
    // ganda, dan gejalanya tidak terlihat sama sekali di layar.
    const { container } = await renderDi("/masuk");
    const utama = container.querySelector("main");
    expect(utama?.id).toBe(ID_KONTEN_UTAMA);
    expect(utama?.querySelector("main"), "halaman merender <main> di dalam <main>").toBeNull();
  });

  it("layar kesalahan punya landmark sendiri — ia MENGGANTIKAN kerangka", async () => {
    // `ErrorBoundary` terpasang di route induk, jadi ia menggantikan `TataLetak`
    // seutuhnya. Tanpa `<main>` sendiri, pengguna screen reader yang melompat ke
    // konten utama akan mendarat di ketiadaan tepat saat ia paling butuh
    // membaca apa yang terjadi.
    const { container } = await renderDi("/jalur-yang-tidak-ada");
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });
});
