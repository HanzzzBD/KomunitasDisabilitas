// Moderasi akun admin (PR-083b). Alur browser nyata + axe di
// `e2e/admin-pengguna.spec.ts`; berkas ini menjaga cepat di jsdom:
//   - konfirmasi DUA langkah: alasan → tinjau → POST (tidak sebelumnya);
//   - fokus pindah ke judul langkah; "Kembali" tidak membuang isian;
//   - baris admin tanpa tombol aksi; cari dikirim saat formulir dikirim.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { AdminUser } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const ADMIN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Admin Uji",
  email: null,
  phone: "+6281234567890",
  role: "admin",
  createdAt: "2026-01-15T20:00:00.000Z",
};

const RINA: AdminUser = {
  id: "01912345-89ab-7def-8123-4567890aab01",
  fullName: "Rina Pelamar",
  phone: "+6281200000001",
  email: "rina@contoh.test",
  role: "seeker",
  createdAt: "2026-09-20T03:00:00.000Z",
  suspendedAt: null,
  suspendReason: null,
};
const ADMIN_BARIS: AdminUser = { ...RINA, id: ADMIN.id, fullName: "Admin Uji", role: "admin" };

interface Permintaan {
  path: string;
  method: string;
  body: unknown;
}

function renderPengguna() {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  let rina = { ...RINA };
  const klien: ApiClient = {
    request: (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }
      if (path === "/me") return Promise.resolve({ data: ADMIN }) as Promise<never>;
      jejak.push({ path, method, body: options?.body });
      if (path.startsWith("/admin/users") && method === "GET") {
        return Promise.resolve({
          data: [rina, ADMIN_BARIS],
          meta: { nextCursor: null },
        }) as Promise<never>;
      }
      if (path.endsWith("/suspend")) {
        rina = { ...rina, suspendedAt: "2026-10-03T03:00:00.000Z", suspendReason: "tiket #31" };
        return Promise.resolve({ data: rina }) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/admin/pengguna"] });
  render(
    <Providers queryClient={createQueryClient()} klienApi={klien}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { jejak };
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("/admin/pengguna", () => {
  it("tangguhkan = DUA langkah: alasan → tinjau → POST; fokus berpindah ke judul langkah", async () => {
    const { jejak } = renderPengguna();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Tangguhkan Rina Pelamar" }));
    const dialog = await screen.findByRole("dialog", { name: "Tangguhkan akun Rina Pelamar?" });
    expect(dialog).toHaveAccessibleDescription(/Semua sesinya langsung berakhir/);

    // Langkah 1: alasan kosong ditolak, tidak ada permintaan.
    await user.click(within(dialog).getByRole("button", { name: "Lanjut" }));
    expect(within(dialog).getByText("Tulis alasannya dulu.")).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: /Alasan \(catatan internal\)/ }),
      "tiket #31",
    );
    await user.click(within(dialog).getByRole("button", { name: "Lanjut" }));

    // Langkah 2: judul langkah difokus, alasan ditinjau, BELUM ada POST.
    const langkah2 = within(dialog).getByRole("heading", { name: /Langkah 2 dari 2/ });
    await waitFor(() => expect(langkah2).toHaveFocus());
    expect(within(dialog).getByText("tiket #31")).toBeInTheDocument();
    expect(jejak.some((p) => p.method === "POST")).toBe(false);

    // Kembali tidak membuang isian.
    await user.click(within(dialog).getByRole("button", { name: "Kembali ubah alasan" }));
    expect(within(dialog).getByRole("textbox", { name: /Alasan/ })).toHaveValue("tiket #31");
    await user.click(within(dialog).getByRole("button", { name: "Lanjut" }));

    await user.click(within(dialog).getByRole("button", { name: "Ya, tangguhkan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = jejak.filter((p) => p.method === "POST");
    expect(post).toHaveLength(1);
    expect(post[0]?.path).toBe(`/admin/users/${RINA.id}/suspend`);
    expect(post[0]?.body).toEqual({ reason: "tiket #31" });
    expect(await screen.findByText(/Akun Rina Pelamar ditangguhkan/)).toBeInTheDocument();
  });

  it("baris admin tidak punya tombol aksi", async () => {
    renderPengguna();
    const tabel = await screen.findByRole("table");
    const baris = within(tabel).getByText("Admin Uji").closest("tr") as HTMLElement;
    expect(within(baris).queryByRole("button")).not.toBeInTheDocument();
  });

  it("cari dikirim saat formulir dikirim, bukan per ketukan", async () => {
    const { jejak } = renderPengguna();
    const user = userEvent.setup();
    const kotak = await screen.findByRole("searchbox", { name: /Cari pengguna/ });
    await user.type(kotak, "rina");
    expect(jejak.filter((p) => p.path.includes("q="))).toHaveLength(0);
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(jejak.some((p) => p.path.includes("/admin/users?") && p.path.includes("q=rina"))).toBe(
        true,
      ),
    );
  });
});
