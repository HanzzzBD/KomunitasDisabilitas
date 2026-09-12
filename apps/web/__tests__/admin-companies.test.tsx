// Kurasi perusahaan (PR-053) — AC: "Buat→edit→verifikasi end-to-end", "Editor
// taksonomi valid (nilai liar tak terkirim)", "Badge status jelas + tekstual",
// "Error BE tampil per-field". Alur browser nyata (klik sungguhan, axe) ada di
// `e2e/admin-companies.spec.ts`; berkas ini menjaga cepat di jsdom: pemetaan
// nilai↔badan, validasi per kolom, dan pengurutan tabel.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { CompanyAdmin } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const ADMIN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Admin Uji",
  email: null,
  phone: "+6281234567890",
  role: "admin",
  createdAt: "2026-01-15T20:00:00.000Z",
};

function perusahaan(overrides: Partial<CompanyAdmin> = {}): CompanyAdmin {
  return {
    id: "01912345-89ab-7def-8123-4567890abd01",
    name: "PT Inklusif Fiktif",
    description: null,
    website: null,
    city: "Jakarta",
    inclusivityStatus: "unverified",
    accommodationsAvailable: [],
    verifiedBy: null,
    verifiedAt: null,
    createdAt: "2026-01-15T20:00:00.000Z",
    updatedAt: "2026-01-15T20:00:00.000Z",
    ...overrides,
  };
}

interface Permintaan {
  path: string;
  method: string;
  body: unknown;
}

function klienPalsu(jejak: Permintaan[], daftar: CompanyAdmin[]): ApiClient {
  return {
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

      if (path === "/admin/companies") {
        if (method === "POST") {
          const baru = perusahaan({
            id: "01912345-89ab-7def-8123-4567890abd99",
            ...(options?.body as Partial<CompanyAdmin>),
          });
          daftar.push(baru);
          return Promise.resolve({ data: baru }) as Promise<never>;
        }
        return Promise.resolve({ data: daftar }) as Promise<never>;
      }

      const verifikasi = /^\/admin\/companies\/([^/]+)\/verify$/.exec(path);
      if (verifikasi !== null) {
        const baris = daftar.find((p) => p.id === verifikasi[1]);
        if (baris === undefined) {
          return Promise.reject(
            Object.assign(new Error("tidak ditemukan"), { code: "PERUSAHAAN_TIDAK_DITEMUKAN" }),
          ) as Promise<never>;
        }
        baris.inclusivityStatus = "verified";
        baris.verifiedBy = ADMIN.id;
        baris.verifiedAt = "2026-01-16T03:00:00.000Z";
        return Promise.resolve({ data: { ...baris } }) as Promise<never>;
      }

      const ubah = /^\/admin\/companies\/([^/]+)$/.exec(path);
      if (ubah !== null) {
        const baris = daftar.find((p) => p.id === ubah[1]);
        if (baris === undefined) {
          return Promise.reject(
            Object.assign(new Error("tidak ditemukan"), { code: "PERUSAHAAN_TIDAK_DITEMUKAN" }),
          ) as Promise<never>;
        }
        Object.assign(baris, options?.body as Partial<CompanyAdmin>);
        return Promise.resolve({ data: { ...baris } }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderDi(jalur: string, daftar: CompanyAdmin[] = []) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });

  const hasil = render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(jejak, daftar)}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, router, jejak, daftar };
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("daftar perusahaan", () => {
  it("menampilkan baris dari server, termasuk badge status tekstual", async () => {
    renderDi("/admin/companies", [
      perusahaan({ name: "PT Verified", inclusivityStatus: "verified" }),
      perusahaan({ id: "id-2", name: "PT Belum", inclusivityStatus: "unverified" }),
    ]);

    expect(await screen.findByText("PT Verified")).toBeInTheDocument();
    expect(screen.getByText("Terverifikasi")).toBeInTheDocument();
    expect(screen.getByText("Belum diverifikasi")).toBeInTheDocument();
  });

  it("daftar kosong → keadaan kosong yang menjelaskan", async () => {
    renderDi("/admin/companies", []);

    expect(await screen.findByText("Belum ada perusahaan")).toBeInTheDocument();
  });

  it("mengklik header kolom mengurutkan baris (AC: AdminTable dipakai sungguhan)", async () => {
    renderDi("/admin/companies", [
      perusahaan({ id: "a", name: "Zebra Corp" }),
      perusahaan({ id: "b", name: "Awal Corp" }),
    ]);
    await screen.findByText("Zebra Corp");

    await userEvent.click(screen.getByRole("button", { name: "Nama" }));

    const baris = screen.getAllByRole("row").slice(1); // baris 0 = header
    expect(within(baris[0]!).getByText("Awal Corp")).toBeInTheDocument();
  });

  it("tautan 'Ubah' punya aria-label yang menyebut nama perusahaan", async () => {
    renderDi("/admin/companies", [perusahaan({ name: "PT Contoh Ubah" })]);
    await screen.findByText("PT Contoh Ubah");

    expect(screen.getByRole("link", { name: "Ubah PT Contoh Ubah" })).toBeInTheDocument();
  });
});

describe("formulir — tambah (AC: buat→edit→verifikasi)", () => {
  it("nama kosong ditolak SEBELUM terkirim — pesan galat per kolom", async () => {
    const { jejak } = renderDi("/admin/companies/baru");
    await screen.findByRole("button", { name: "Simpan" });

    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Nama perusahaan wajib diisi")).toBeInTheDocument();
    expect(jejak.filter((j) => j.method === "POST")).toHaveLength(0);
  });

  it("nama terisi → POST terkirim, berpindah ke halaman Ubah perusahaan baru", async () => {
    const { router, jejak } = renderDi("/admin/companies/baru", []);
    // `findBy`, bukan `getBy`: route induk ("Admin") dan route form
    // ("companies/baru") lazy TERPISAH — h1 shell bisa muncul sebelum chunk
    // formulir selesai dimuat.
    await screen.findByRole("textbox", { name: /Nama perusahaan/ });

    await userEvent.type(screen.getByRole("textbox", { name: /Nama perusahaan/ }), "PT Baru Fiktif");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/admin/companies/01912345-89ab-7def-8123-4567890abd99",
      );
    });
    const kirim = jejak.find((j) => j.method === "POST");
    expect((kirim?.body as { name: string }).name).toBe("PT Baru Fiktif");
  });

  it("kotak akomodasi yang dicentang ikut terkirim, yang tidak dicentang tidak", async () => {
    const { jejak } = renderDi("/admin/companies/baru", []);
    await screen.findByRole("textbox", { name: /Nama perusahaan/ });

    await userEvent.type(screen.getByRole("textbox", { name: /Nama perusahaan/ }), "PT Akomodasi");
    await userEvent.click(screen.getByText("Akses kursi roda"));
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(jejak.some((j) => j.method === "POST")).toBe(true));
    const badan = jejak.find((j) => j.method === "POST")?.body as {
      accommodationsAvailable: string[];
    };
    expect(badan.accommodationsAvailable).toEqual(["akses_kursi_roda"]);
  });
});

describe("formulir — ubah", () => {
  it("kolom terisi nilai perusahaan yang sudah ada", async () => {
    renderDi("/admin/companies/id-1", [
      perusahaan({ id: "id-1", name: "PT Lama", city: "Bandung" }),
    ]);

    expect(await screen.findByDisplayValue("PT Lama")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bandung")).toBeInTheDocument();
  });

  it("id tidak ada di daftar → pesan 'tidak ditemukan', bukan formulir kosong", async () => {
    renderDi("/admin/companies/tidak-ada", [perusahaan({ id: "id-lain" })]);

    expect(await screen.findByText("Perusahaan itu tidak ditemukan.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Nama perusahaan/ })).toBeNull();
  });

  it("menyimpan perubahan → PUT terkirim dengan nilai terbaru", async () => {
    const { jejak } = renderDi("/admin/companies/id-1", [
      perusahaan({ id: "id-1", name: "PT Lama" }),
    ]);
    const nama = await screen.findByDisplayValue("PT Lama");

    await userEvent.clear(nama);
    await userEvent.type(nama, "PT Baru Namanya");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(jejak.some((j) => j.method === "PUT")).toBe(true));
    const badan = jejak.find((j) => j.method === "PUT")?.body as { name: string };
    expect(badan.name).toBe("PT Baru Namanya");
    expect(await screen.findByText(/Perubahan pada PT Baru Namanya sudah tersimpan/)).toBeInTheDocument();
  });
});

describe("verifikasi (AC: badge status jelas + konfirmasi eksplisit)", () => {
  it("tombol Verifikasi memunculkan dialog konfirmasi, BELUM mengirim apa pun", async () => {
    const { jejak } = renderDi("/admin/companies/id-1", [
      perusahaan({ id: "id-1", name: "PT Verifikasi" }),
    ]);
    await screen.findByRole("button", { name: "Verifikasi perusahaan ini" });

    await userEvent.click(screen.getByRole("button", { name: "Verifikasi perusahaan ini" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(jejak.some((j) => j.path.endsWith("/verify"))).toBe(false);
  });

  it("konfirmasi 'Ya, verifikasi' → POST verify, badge berubah, tombol hilang", async () => {
    renderDi("/admin/companies/id-1", [perusahaan({ id: "id-1", name: "PT Verifikasi" })]);
    await userEvent.click(
      await screen.findByRole("button", { name: "Verifikasi perusahaan ini" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Ya, verifikasi" }));

    expect(await screen.findByText("Terverifikasi", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verifikasi perusahaan ini" })).toBeNull();
  });

  it("membatalkan dialog TIDAK mengirim apa pun", async () => {
    const { jejak } = renderDi("/admin/companies/id-1", [
      perusahaan({ id: "id-1", name: "PT Verifikasi" }),
    ]);
    await userEvent.click(
      await screen.findByRole("button", { name: "Verifikasi perusahaan ini" }),
    );

    // DUA tombol bernama "Batal" di dalam dialog: tombol tutup (×, pojok) DAN
    // tombol aksi di footer — keduanya sah-sah saja punya nama sama secara
    // aksesibilitas (keduanya membatalkan). Yang diuji di sini adalah bahwa
    // MEMBATALKAN lewat SALAH SATU tidak mengirim apa pun, jadi index mana pun
    // valid; dipilih index terakhir (tombol footer, aksi yang paling jelas).
    const tombolBatal = screen.getAllByRole("button", { name: "Batal" });
    await userEvent.click(tombolBatal[tombolBatal.length - 1]!);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(jejak.some((j) => j.path.endsWith("/verify"))).toBe(false);
  });
});
