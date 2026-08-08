// Route diuji lewat `createMemoryRouter` atas daftar `ruteApp` YANG SAMA dengan
// produksi. Kalau test merakit daftarnya sendiri, ia menguji router karangan
// test — dan route produksi yang salah tulis akan lolos tanpa gejala.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
// Satu sumber untuk router DAN provider — lihat catatan di App.tsx.
import { createMemoryRouter, RouterProvider } from "react-router";
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

describe("ruteApp", () => {
  it("'/' memuat Beranda", async () => {
    renderDi("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Nawasena" })).toBeInTheDocument();
  });

  it("'/masuk' memuat halaman Masuk", async () => {
    renderDi("/masuk");
    expect(await screen.findByRole("heading", { level: 1, name: "Masuk" })).toBeInTheDocument();
  });

  it("setiap route dimuat lazy — tidak ada Component yang diimpor statis", () => {
    // Inilah yang membuat pemecahan chunk terjadi. Mengganti satu `lazy`
    // menjadi `Component` yang diimpor di atas berkas akan menarik halaman itu
    // ke bundel awal tanpa satu pun test lain gagal — kecuali test ini.
    for (const rute of ruteApp) {
      expect(typeof rute.lazy, `route ${String(rute.path)} tidak lazy`).toBe("function");
      expect(rute.Component, `route ${String(rute.path)} punya Component statis`).toBeUndefined();
    }
  });

  it("penjaga ini tidak lulus secara hampa", () => {
    // Daftar kosong akan membuat loop di atas lulus tanpa memeriksa apa pun.
    expect(ruteApp.length).toBeGreaterThan(1);
  });

  it("jalur '/masuk' dipertahankan — sudah terdaftar di Google Cloud Console", () => {
    // `http://localhost:5173/masuk/google` adalah Authorized redirect URI yang
    // sudah disepakati pihak luar. Mengubah jalur ini berarti login Google
    // berhenti bekerja sampai Console ikut diubah — kegagalan yang muncul jauh
    // dari sebabnya, jadi dikunci di sini.
    expect(ruteApp.map((r) => r.path)).toContain("/masuk");
  });
});
