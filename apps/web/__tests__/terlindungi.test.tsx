// AC PR-030 nomor 5: "Route terlindungi redirect ke login dengan kembali ke
// tujuan awal".
//
// Diuji lewat router sungguhan (`createMemoryRouter`), bukan dengan merender
// guard sendirian: yang diuji AC ini adalah akibat pengalihannya — alamat mana
// yang akhirnya terbuka — dan itu hanya ada bila ada router.
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { Terlindungi } from "../src/shared/rute/terlindungi.js";
import { useStoreSesi, type StatusSesi } from "../src/shared/sesi/store.js";
import type { ApiClient } from "@nawasena/api-client";

/** Klien yang tidak pernah menjawab — pemulihan sesi dikendalikan test, bukan jaringan. */
const klienDiam: ApiClient = { request: () => new Promise(() => {}) };

function renderDi(jalur: string, status: StatusSesi) {
  useStoreSesi.setState({ status });

  const router = createMemoryRouter(
    [
      {
        path: "/rahasia",
        element: (
          <Terlindungi>
            <h1>Isi rahasia</h1>
          </Terlindungi>
        ),
      },
      { path: "/masuk", element: <h1>Masuk</h1> },
      { path: "/", element: <h1>Beranda</h1> },
    ],
    { initialEntries: [jalur] },
  );

  const hasil = render(
    <Providers queryClient={createQueryClient()} klienApi={klienDiam}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, router };
}

describe("status 'masuk' — isi ditampilkan", () => {
  it("halaman terlindungi terbuka apa adanya", async () => {
    renderDi("/rahasia", "masuk");

    expect(await screen.findByRole("heading", { name: "Isi rahasia" })).toBeInTheDocument();
  });
});

describe("status 'keluar' — dialihkan ke masuk", () => {
  it("isi rahasia TIDAK pernah terlihat", async () => {
    renderDi("/rahasia", "keluar");

    await screen.findByRole("heading", { name: "Masuk" });
    expect(screen.queryByRole("heading", { name: "Isi rahasia" })).toBeNull();
  });

  it("tujuan awal ikut terbawa ke alamat masuk", async () => {
    const { router } = renderDi("/rahasia", "keluar");

    await screen.findByRole("heading", { name: "Masuk" });
    expect(router.state.location.pathname).toBe("/masuk");
    expect(router.state.location.search).toBe("?tujuan=%2Frahasia");
  });

  it("pengalihan MENGGANTI riwayat, tidak menumpuknya", async () => {
    // Tanpa `replace`, halaman terlindungi tertinggal di riwayat: menekan
    // tombol kembali sesudah masuk mengembalikan pengguna ke sini, yang
    // mengalihkannya lagi — terasa seperti tombol kembali yang rusak.
    const { router } = renderDi("/rahasia", "keluar");
    await screen.findByRole("heading", { name: "Masuk" });

    expect(router.state.historyAction).toBe("REPLACE");
  });
});

describe("status 'memulihkan' — keadaan ketiga yang membuat guard benar", () => {
  it("TIDAK mengalihkan ke masuk selagi jawaban server belum tiba", async () => {
    // Inti cacatnya: guard yang hanya mengenal masuk/keluar membaca "keluar"
    // pada milidetik pertama tiap reload, lalu melempar pengguna yang SEDANG
    // login ke halaman masuk.
    const { router } = renderDi("/rahasia", "memulihkan");

    await screen.findByRole("status");
    expect(router.state.location.pathname).toBe("/rahasia");
    expect(screen.queryByRole("heading", { name: "Masuk" })).toBeNull();
  });

  it("isi rahasia juga belum ditampilkan", async () => {
    renderDi("/rahasia", "memulihkan");

    await screen.findByRole("status");
    expect(screen.queryByRole("heading", { name: "Isi rahasia" })).toBeNull();
  });

  it("menunggunya diumumkan, bukan layar diam", async () => {
    // Halaman yang diam tanpa keterangan terbaca sebagai halaman yang rusak —
    // dan bagi pengguna screen reader ia sama sekali tidak terbaca.
    renderDi("/rahasia", "memulihkan");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/masih masuk|cek dulu akun/i);
  });

  it("wilayahnya ditandai sibuk", async () => {
    renderDi("/rahasia", "memulihkan");
    await screen.findByRole("status");

    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("selesai memulihkan lalu masuk → isi muncul tanpa pindah halaman", async () => {
    const { router } = renderDi("/rahasia", "memulihkan");
    await screen.findByRole("status");

    useStoreSesi.getState().masuk("token-uji");

    expect(await screen.findByRole("heading", { name: "Isi rahasia" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/rahasia");
  });

  it("selesai memulihkan lalu ternyata keluar → baru dialihkan", async () => {
    const { router } = renderDi("/rahasia", "memulihkan");
    await screen.findByRole("status");

    useStoreSesi.getState().keluar();

    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"));
    expect(router.state.location.search).toBe("?tujuan=%2Frahasia");
  });
});
