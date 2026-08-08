// Route diuji lewat `createMemoryRouter` atas daftar `ruteApp` YANG SAMA dengan
// produksi. Kalau test merakit daftarnya sendiri, ia menguji router karangan
// test — dan route produksi yang salah tulis akan lolos tanpa gejala.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";

function renderDi(jalur: string) {
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  return render(
    <Providers queryClient={createQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
}

const induk = ruteApp[0] as RouteObject;
const anak = (induk.children ?? []) as RouteObject[];
const catchAll = anak.find((r) => r.path === "*");
const halaman = anak.filter((r) => r !== catchAll);

describe("ruteApp — halaman", () => {
  it("'/' memuat Beranda", async () => {
    renderDi("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Nawasena" })).toBeInTheDocument();
  });

  it("'/masuk' memuat halaman Masuk", async () => {
    renderDi("/masuk");
    expect(await screen.findByRole("heading", { level: 1, name: "Masuk" })).toBeInTheDocument();
  });

  it("URL asing → pesan 404 kita, BUKAN layar bawaan React Router", async () => {
    renderDi("/jalur-yang-tidak-ada");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Halaman tidak ditemukan" }),
    ).toBeInTheDocument();
    // Layar bawaan React Router menyapa pengembang; kalau string ini muncul,
    // berarti ErrorBoundary kita tidak terpasang.
    expect(screen.queryByText(/Unexpected Application Error/i)).not.toBeInTheDocument();
  });
});

describe("ruteApp — bentuk", () => {
  it("setiap halaman dimuat lazy — tidak ada Component yang diimpor statis", () => {
    // Inilah yang membuat pemecahan chunk terjadi. Mengganti satu `lazy`
    // menjadi `Component` yang diimpor di atas berkas akan menarik halaman itu
    // ke bundel awal tanpa satu pun test lain gagal — kecuali test ini.
    for (const rute of halaman) {
      const nama = String(rute.path ?? "(index)");
      expect(typeof rute.lazy, `halaman ${nama} tidak lazy`).toBe("function");
      expect(rute.Component, `halaman ${nama} punya Component statis`).toBeUndefined();
    }
  });

  it("route induk SENGAJA tidak lazy — ia shell yang selalu dibutuhkan", () => {
    expect(induk.Component).toBeDefined();
    expect(induk.lazy).toBeUndefined();
  });

  it("induk memasang ErrorBoundary sehingga SELURUH anak terlindungi", () => {
    // Dipasang per halaman, ia akan terlewat pada halaman yang ditambahkan
    // belakangan — dan di sanalah layar bawaan React Router akan muncul.
    expect(induk.ErrorBoundary).toBeDefined();
  });

  it("catch-all melempar 404, bukan merender layar kesalahan langsung", async () => {
    // Dirender langsung, `useRouteError()` kosong dan pesannya jatuh ke
    // "ada yang tidak berjalan semestinya" — padahal yang terjadi jelas 404.
    expect(catchAll).toBeDefined();
    expect(catchAll?.Component).toBeUndefined();
    await expect(async () => {
      await (catchAll?.loader as () => Promise<unknown>)();
    }).rejects.toBeInstanceOf(Response);
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    expect(halaman.length).toBeGreaterThan(1);
  });

  it("jalur '/masuk' dipertahankan — sudah terdaftar di Google Cloud Console", () => {
    // `http://localhost:5173/masuk/google` adalah Authorized redirect URI yang
    // sudah disepakati pihak luar. Mengubah jalur ini berarti login Google
    // berhenti bekerja sampai Console ikut diubah — kegagalan yang muncul jauh
    // dari sebabnya, jadi dikunci di sini.
    expect(anak.map((r) => r.path)).toContain("masuk");
  });
});
