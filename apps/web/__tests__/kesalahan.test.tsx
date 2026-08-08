// AC PR-025: "Error boundary menampilkan pesan sederhana + tombol muat ulang."
//
// Diuji lewat router NYATA yang benar-benar melempar, bukan dengan merender
// LayarKesalahan langsung: komponen itu membaca `useRouteError()`, dan
// merendernya di luar konteks error akan menguji jalur yang tidak pernah
// dipakai pengguna.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { LayarKesalahan } from "../src/app/kesalahan.js";

function renderDenganError(lempar: () => never) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: lempar,
        Component: () => null,
        ErrorBoundary: LayarKesalahan,
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("LayarKesalahan", () => {
  it("404 → 'Halaman tidak ditemukan'", async () => {
    renderDenganError(() => {
      throw new Response("", { status: 404 });
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Halaman tidak ditemukan" }),
    ).toBeInTheDocument();
  });

  it("401/403 → mengarahkan pengguna untuk masuk", async () => {
    renderDenganError(() => {
      throw new Response("", { status: 403 });
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Anda belum bisa membuka halaman ini" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/coba masuk lebih dulu/i)).toBeInTheDocument();
  });

  it("kesalahan tak terduga → pesan umum yang TIDAK menyalahkan pengguna", async () => {
    renderDenganError(() => {
      throw new Error("boom");
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Ada yang tidak berjalan semestinya" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ini bukan kesalahan Anda/i)).toBeInTheDocument();
  });

  it("TIDAK membocorkan pesan asli maupun jejak tumpukan", async () => {
    // Detail teknis tidak berguna bagi pengguna dan bisa memuat jalur berkas
    // internal atau potongan data. Pengirimannya ke observability = PR-103.
    renderDenganError(() => {
      throw new Error("rahasia-internal-C:/laragon/www/rahasia.ts");
    });
    await screen.findByRole("heading", { level: 1 });
    expect(document.body.textContent).not.toContain("rahasia-internal");
    expect(document.body.textContent).not.toContain("laragon");
  });

  it("diumumkan sebagai alert dan tetap punya landmark main", async () => {
    renderDenganError(() => {
      throw new Error("boom");
    });
    await screen.findByRole("heading", { level: 1 });
    // Layar ini menggantikan konten tanpa diminta, jadi kemunculannya harus
    // diumumkan. Dan pengguna yang melompat ke konten utama tidak boleh
    // mendarat di ketiadaan.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("tombol muat ulang benar-benar memuat ulang halaman", async () => {
    const reload = vi.fn();
    // `location.reload` tidak bisa di-spy langsung di jsdom; ganti objeknya.
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });

    renderDenganError(() => {
      throw new Error("boom");
    });
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Muat ulang halaman" }));

    // Muat ulang penuh, bukan navigasi router: keadaan aplikasi sudah terbukti
    // rusak, dan router bisa gagal lagi dengan cara yang sama.
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
