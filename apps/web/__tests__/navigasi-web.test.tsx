import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { UserRole } from "@nawasena/schemas";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { TataLetak } from "../src/app/tata-letak.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import { kunciPenanda } from "../src/features/onboarding/identitas.js";

const SUB = "01912345-89ab-7def-8123-456789abcde1";

afterEach(() => {
  useStoreSesi.getState().keluar();
  localStorage.clear();
});

function renderNavigasi(peran: UserRole | null, jalur = "/lowongan", klaim = peran) {
  if (peran === null) useStoreSesi.getState().keluar();
  else {
    useStoreSesi
      .getState()
      .masuk(`header.${btoa(JSON.stringify({ sub: SUB, role: klaim }))}.tanda`);
    localStorage.setItem(kunciPenanda(SUB), "1");
  }
  const request = vi.fn((path: string) => {
    if (path === "/auth/refresh") return new Promise(() => {});
    if (path === "/me") return Promise.resolve({ data: { role: peran } });
    if (path.startsWith("/me/notifications")) {
      return Promise.resolve({ data: [], meta: { nextCursor: null, unreadCount: 0 } });
    }
    return Promise.reject(new Error("jalur di luar pengujian"));
  });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: TataLetak,
        children: [
          { index: true, element: <h1>Halaman awal</h1> },
          { path: "admin", element: <h1>Dashboard pengelolaan</h1> },
          { path: "lowongan", element: <h1>Lowongan kerja</h1> },
          { path: "kamus", element: <h1>Kamus publik</h1> },
          { path: "community", element: <h1>Daftar komunitas</h1> },
          { path: "profil", element: <h1>Fitur pribadi pencari kerja</h1> },
          { path: "cv/:id", element: <h1>Fitur pribadi pencari kerja</h1> },
          { path: "lamaran/:id", element: <h1>Fitur pribadi pencari kerja</h1> },
          { path: "onboarding", element: <h1>Fitur pribadi pencari kerja</h1> },
        ],
      },
    ],
    { initialEntries: [jalur] },
  );
  render(
    <Providers queryClient={createQueryClient()} klienApi={{ request } as ApiClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, request };
}

describe("navigasi sesuai ruang kerja", () => {
  it.each([null, "seeker", "employer", "admin"] as const)(
    "menu Komunitas tersedia untuk %s",
    async (peran) => {
      const { router } = renderNavigasi(peran, "/community");
      const link = await screen.findByRole("link", { name: "Komunitas" });
      expect(link).toHaveAttribute("href", "/community");
      expect(link).toHaveAttribute("aria-current", "page");
      expect(router.state.location.pathname).toBe("/community");
    },
  );
  it("tamu melihat fitur publik dan masuk tanpa permintaan profil akun", async () => {
    const { request } = renderNavigasi(null);
    expect(screen.getByRole("navigation", { name: "Navigasi utama" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/masuk");
    expect(screen.queryByRole("link", { name: "CV saya" })).toBeNull();
    expect(request.mock.calls.some(([path]) => path === "/me")).toBe(false);
    await harusLolosAksesibilitas(document.body);
  });

  it("seeker mendapat menu karier dengan penanda halaman aktif", async () => {
    renderNavigasi("seeker");
    const nav = screen.getByRole("navigation", { name: "Pintasan halaman" });
    expect(within(nav).getByRole("link", { name: "CV saya" })).toHaveAttribute("href", "/cv");
    expect(within(nav).getByRole("link", { name: "Profil karier" })).toHaveAttribute(
      "href",
      "/profil",
    );
    expect(within(nav).getByRole("link", { name: /^Lowongan$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByRole("link", { name: "Dashboard admin" })).toBeNull();
  });

  it.each(["admin", "employer"] as const)("%s tidak melihat fitur pribadi seeker", (peran) => {
    renderNavigasi(peran);
    expect(screen.queryByRole("link", { name: "CV saya" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Profil karier" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Lamaran Saya" })).toBeNull();
    expect(screen.getByRole("link", { name: "Akun & preferensi" })).toHaveAttribute(
      "href",
      "/pengaturan",
    );
    if (peran === "admin")
      expect(screen.getByRole("link", { name: "Dashboard admin" })).toHaveAttribute(
        "href",
        "/admin",
      );
    else expect(screen.queryByRole("link", { name: "Dashboard admin" })).toBeNull();
  });

  it("profil dari server memperbarui menu ketika klaim role lebih lama", async () => {
    renderNavigasi("seeker", "/lowongan", "admin");
    await screen.findByRole("link", { name: "CV saya" });
    expect(screen.queryByRole("link", { name: "Dashboard admin" })).toBeNull();
  });
});

describe("pemisahan halaman pribadi", () => {
  it.each(["/profil", "/cv/uji", "/lamaran/uji", "/onboarding"])(
    "admin mengetik %s → dashboard tanpa merender fitur pribadi",
    async (jalur) => {
      const { router } = renderNavigasi("admin", jalur);
      await waitFor(() => expect(router.state.location.pathname).toBe("/admin"));
      expect(router.state.historyAction).toBe("REPLACE");
      expect(screen.queryByRole("heading", { name: "Fitur pribadi pencari kerja" })).toBeNull();
    },
  );

  it.each(["/lowongan", "/kamus"])("admin tetap bisa membuka halaman publik %s", (jalur) => {
    const { router } = renderNavigasi("admin", jalur);
    expect(router.state.location.pathname).toBe(jalur);
  });

  it("akun employer diarahkan ke lowongan dari fitur pribadi seeker", async () => {
    const { router } = renderNavigasi("employer", "/profil");
    await waitFor(() => expect(router.state.location.pathname).toBe("/lowongan"));
    expect(screen.queryByRole("heading", { name: "Fitur pribadi pencari kerja" })).toBeNull();
  });
});
