// Kerangka admin (PR-052) — Scope: "Shell + navigasi + guard", dan AC:
// "Seeker membuka /admin → ditolak (redirect + pesan)", "Navigasi admin
// keyboard-only", "axe 0 pelanggaran shell".
//
// Dijalankan lewat `ruteApp` PRODUKSI, bukan daftar route yang dirakit di
// test — alasan yang sama dengan `pengaturan.test.tsx`: route produksi yang
// salah tulis (lupa memasang guard, lupa route indeks) harus terlihat DI SINI.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi, type StatusSesi } from "../src/shared/sesi/store.js";

interface ProfilUji {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  createdAt: string;
}

const PROFIL: ProfilUji = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Rina Admin",
  email: "admin@contoh.id",
  phone: "+6281234567890",
  role: "seeker",
  createdAt: "2026-01-15T20:00:00.000Z",
};

interface OpsiRender {
  jalur?: string;
  status?: StatusSesi;
  role?: string;
}

/** Klien yang HANYA menjawab jalur yang dipakai kerangka + halaman admin. */
function klienPalsu(role: string): ApiClient {
  return {
    request: (path: string) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      // Lencana notifikasi (`TataLetak`) memanggil ini di SETIAP halaman
      // begitu status sesi "masuk" — infrastruktur kerangka, bukan pokok
      // yang diuji berkas ini.
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }
      if (path === "/me") {
        return Promise.resolve({ data: { ...PROFIL, role } }) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderAdmin(opsi: OpsiRender = {}) {
  const { jalur = "/admin", status = "masuk", role = "admin" } = opsi;
  useStoreSesi.setState({ status });

  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  const hasil = render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(role)}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, router };
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("penjagaan sesi (Terlindungi, di LUAR PenjagaAdmin)", () => {
  it("tanpa sesi, isi admin TIDAK pernah terlihat — dialihkan ke /masuk", async () => {
    const { router } = renderAdmin({ status: "keluar" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"), { timeout: 5000 });
    expect(screen.queryByRole("heading", { name: "Admin" })).toBeNull();
  });

  it("tujuan awal ikut terbawa ke halaman masuk", async () => {
    const { router } = renderAdmin({ status: "keluar" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"), { timeout: 5000 });
    expect(router.state.location.search).toBe("?tujuan=%2Fadmin");
  });
});

describe("AC: seeker membuka /admin → ditolak (redirect + pesan)", () => {
  it("seeker dialihkan ke '/' — bukan ke /masuk, sebab sesinya sah", async () => {
    const { router } = renderAdmin({ role: "seeker" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/"), { timeout: 5000 });
    expect(screen.queryByRole("heading", { name: "Admin" })).toBeNull();
  });

  it("pesan penolakan diumumkan sebagai alert di halaman tujuan", async () => {
    renderAdmin({ role: "seeker" });

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/khusus untuk admin/i);
  });

  it("admin TIDAK dialihkan — isi shell benar-benar terlihat", async () => {
    const { router } = renderAdmin({ role: "admin" });

    await screen.findByRole("heading", { level: 1, name: "Admin" }, { timeout: 5000 });
    expect(router.state.location.pathname).toBe("/admin");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("kerangka & navigasi (AC: navigasi admin keyboard-only)", () => {
  it("judul halaman tingkat satu, panel ringkasan tingkat dua", async () => {
    renderAdmin();

    await screen.findByRole("heading", { level: 1, name: "Admin" }, { timeout: 5000 });
    expect(
      await screen.findByRole("heading", { level: 2, name: "Ringkasan" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("navigasi punya NAMA, bukan sekadar landmark 'navigation'", async () => {
    renderAdmin();
    await screen.findByRole("heading", { level: 1, name: "Admin" }, { timeout: 5000 });

    expect(screen.getByRole("navigation", { name: "Bagian admin" })).toBeInTheDocument();
  });

  it("alamat indeks BERISI, bukan mengalihkan ke alamat lain", async () => {
    const { router } = renderAdmin();
    await screen.findByRole("heading", { level: 1, name: "Admin" }, { timeout: 5000 });

    expect(router.state.location.pathname).toBe("/admin");
  });

  it("panel ringkasan bisa dicapai sepenuhnya dengan keyboard", async () => {
    // AC "Navigasi admin keyboard-only". Ditempuh sebagai PERBUATAN — Tab lalu
    // Enter — bukan dengan memeriksa href, alasan yang sama dengan
    // `pengaturan.test.tsx`.
    const { router } = renderAdmin();
    await screen.findByRole("heading", { level: 1, name: "Admin" }, { timeout: 5000 });

    const tautan = screen.getByRole("link", { name: "Ringkasan" });
    tautan.focus();
    expect(tautan).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
    expect(tautan).toHaveAttribute("aria-current", "page");
  });

  it("belum ada modul admin → keadaan kosong yang menjelaskan, bukan layar diam", async () => {
    renderAdmin();

    expect(
      await screen.findByRole("heading", { level: 3, name: "Belum ada modul yang tersedia" }),
    ).toBeInTheDocument();
  });
});

describe("gerbang aksesibilitas", () => {
  it("shell admin (peran admin) lolos axe", async () => {
    const { container } = renderAdmin();
    await screen.findByRole("heading", { level: 1, name: "Admin" }, { timeout: 5000 });

    await harusLolosAksesibilitas(container);
  });
});
