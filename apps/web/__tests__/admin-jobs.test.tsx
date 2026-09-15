// Kurasi lowongan (PR-057) — AC: "Buat→publish→close end-to-end", "Validasi
// akomodasi wajib sebelum publish (server+client)", "Duplikasi lowongan
// (copy as draft) tersedia". Alur browser nyata (klik sungguhan, axe) ada di
// `e2e/admin-jobs.spec.ts`; berkas ini menjaga cepat di jsdom: pemetaan
// nilai↔badan, validasi per kolom, filter status, dan aksi duplikasi.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { CompanyAdmin, JobAdmin } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

// jsdom tidak mengimplementasikan Pointer Events API yang dipakai Radix
// Select (`Pilihan`, @nawasena/ui) untuk membuka/menutup listbox-nya —
// `hasPointerCapture` dkk. tidak ada sama sekali di elemen jsdom, dan tanpa
// stub ini `userEvent.click` pada pemicu `Pilihan` melempar TypeError SEBELUM
// listbox-nya sempat terbuka. Ini satu-satunya berkas yang benar-benar
// membuka Pilihan lewat klik (bukan sekadar fokus) — pemakai lain (`profil.
// test.tsx`) sengaja menghindarinya, tetapi AC PR-057 "buat→publish→close"
// menuntut companyId benar-benar terpilih sebelum submit diuji.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const ADMIN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Admin Uji",
  email: null,
  phone: "+6281234567890",
  role: "admin",
  createdAt: "2026-01-15T20:00:00.000Z",
};

const PERUSAHAAN_ID = "01912345-89ab-7def-8123-4567890abc01";

function perusahaan(overrides: Partial<CompanyAdmin> = {}): CompanyAdmin {
  return {
    id: PERUSAHAAN_ID,
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

function lowongan(overrides: Partial<JobAdmin> = {}): JobAdmin {
  return {
    id: "01912345-89ab-7def-8123-4567890abd01",
    companyId: PERUSAHAAN_ID,
    title: "Staf Admin",
    description: "Deskripsi lowongan",
    requirements: null,
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    salaryMin: null,
    salaryMax: null,
    salaryVisible: true,
    accommodations: [],
    welcomedDisabilityTypes: [],
    source: "admin_curated",
    status: "draft",
    createdBy: null,
    publishedAt: null,
    expiresAt: null,
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

function klienPalsu(
  jejak: Permintaan[],
  daftarLowongan: JobAdmin[],
  daftarPerusahaan: CompanyAdmin[] = [perusahaan()],
): ApiClient {
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
        return Promise.resolve({ data: daftarPerusahaan }) as Promise<never>;
      }

      if (path === "/admin/jobs") {
        if (method === "POST") {
          const baru = lowongan({
            id: "01912345-89ab-7def-8123-4567890abd99",
            ...(options?.body as Partial<JobAdmin>),
          });
          daftarLowongan.push(baru);
          return Promise.resolve({ data: baru }) as Promise<never>;
        }
        return Promise.resolve({ data: daftarLowongan }) as Promise<never>;
      }

      const terbitkan = /^\/admin\/jobs\/([^/]+)\/publish$/.exec(path);
      if (terbitkan !== null) {
        const baris = daftarLowongan.find((j) => j.id === terbitkan[1]);
        if (baris === undefined) {
          return Promise.reject(
            Object.assign(new Error("tidak ditemukan"), { code: "LOWONGAN_TIDAK_DITEMUKAN" }),
          ) as Promise<never>;
        }
        if (baris.accommodations.length === 0) {
          return Promise.reject(
            Object.assign(new Error("akomodasi kosong"), { code: "AKOMODASI_LOWONGAN_KOSONG" }),
          ) as Promise<never>;
        }
        baris.status = "published";
        baris.publishedAt = "2026-01-16T03:00:00.000Z";
        return Promise.resolve({ data: { ...baris } }) as Promise<never>;
      }

      const tutup = /^\/admin\/jobs\/([^/]+)\/close$/.exec(path);
      if (tutup !== null) {
        const baris = daftarLowongan.find((j) => j.id === tutup[1]);
        if (baris === undefined) {
          return Promise.reject(
            Object.assign(new Error("tidak ditemukan"), { code: "LOWONGAN_TIDAK_DITEMUKAN" }),
          ) as Promise<never>;
        }
        baris.status = "closed";
        return Promise.resolve({ data: { ...baris } }) as Promise<never>;
      }

      const ubah = /^\/admin\/jobs\/([^/]+)$/.exec(path);
      if (ubah !== null) {
        const baris = daftarLowongan.find((j) => j.id === ubah[1]);
        if (baris === undefined) {
          return Promise.reject(
            Object.assign(new Error("tidak ditemukan"), { code: "LOWONGAN_TIDAK_DITEMUKAN" }),
          ) as Promise<never>;
        }
        Object.assign(baris, options?.body as Partial<JobAdmin>);
        return Promise.resolve({ data: { ...baris } }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderDi(jalur: string, daftarLowongan: JobAdmin[] = [], daftarPerusahaan?: CompanyAdmin[]) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });

  const hasil = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienPalsu(jejak, daftarLowongan, daftarPerusahaan)}
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, router, jejak, daftarLowongan };
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("daftar lowongan", () => {
  it("menampilkan baris dari server, termasuk badge status tekstual dan nama perusahaan", async () => {
    renderDi("/admin/jobs", [
      lowongan({ title: "Kasir Toko", status: "published" }),
      lowongan({ id: "id-2", title: "Staf Gudang", status: "draft" }),
    ]);

    expect(await screen.findByText("Kasir Toko")).toBeInTheDocument();
    expect(screen.getByText("Diterbitkan")).toBeInTheDocument();
    expect(screen.getByText("Draf")).toBeInTheDocument();
    expect(screen.getAllByText("PT Inklusif Fiktif").length).toBeGreaterThan(0);
  });

  it("daftar kosong → keadaan kosong yang menjelaskan", async () => {
    renderDi("/admin/jobs", []);

    expect(await screen.findByText("Belum ada lowongan")).toBeInTheDocument();
  });

  it("filter status menyaring baris yang tampil", async () => {
    renderDi("/admin/jobs", [
      lowongan({ id: "id-1", title: "Lowongan Draf", status: "draft" }),
      lowongan({ id: "id-2", title: "Lowongan Terbit", status: "published" }),
    ]);
    await screen.findByText("Lowongan Draf");

    await userEvent.click(screen.getByRole("combobox", { name: "Saring berdasarkan status" }));
    await userEvent.click(screen.getByRole("option", { name: "Diterbitkan" }));

    await waitFor(() => {
      expect(screen.queryByText("Lowongan Draf")).toBeNull();
    });
    expect(screen.getByText("Lowongan Terbit")).toBeInTheDocument();
  });

  it("tautan 'Ubah' punya aria-label yang menyebut judul lowongan", async () => {
    renderDi("/admin/jobs", [lowongan({ title: "Posisi Contoh Ubah" })]);
    await screen.findByText("Posisi Contoh Ubah");

    expect(screen.getByRole("link", { name: "Ubah Posisi Contoh Ubah" })).toBeInTheDocument();
  });

  it("AC duplikasi: klik 'Duplikat' membuat draft baru dan berpindah ke halaman Ubah-nya", async () => {
    const { router, jejak } = renderDi("/admin/jobs", [
      lowongan({ title: "Posisi Asli", accommodations: ["akses_kursi_roda"] }),
    ]);
    await screen.findByText("Posisi Asli");

    await userEvent.click(screen.getByRole("button", { name: "Duplikat Posisi Asli" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/admin/jobs/01912345-89ab-7def-8123-4567890abd99",
      );
    });
    const kirim = jejak.find((j) => j.method === "POST" && j.path === "/admin/jobs");
    expect((kirim?.body as { title: string; accommodations: string[] }).title).toBe("Posisi Asli");
    expect((kirim?.body as { accommodations: string[] }).accommodations).toEqual([
      "akses_kursi_roda",
    ]);
  });
});

describe("formulir — tambah (AC: buat→publish→close)", () => {
  it("judul kosong ditolak SEBELUM terkirim — pesan galat per kolom", async () => {
    const { jejak } = renderDi("/admin/jobs/baru");
    await screen.findByRole("button", { name: "Simpan" });

    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Judul lowongan wajib diisi")).toBeInTheDocument();
    expect(jejak.filter((j) => j.method === "POST")).toHaveLength(0);
  });

  it("companyId kosong ditolak SEBELUM terkirim", async () => {
    const { jejak } = renderDi("/admin/jobs/baru");
    await screen.findByRole("textbox", { name: /Judul lowongan/ });

    await userEvent.type(screen.getByRole("textbox", { name: /Judul lowongan/ }), "Posisi Baru");
    await userEvent.type(screen.getByRole("textbox", { name: /Deskripsi/ }), "Deskripsi posisi");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("ID tidak valid")).toBeInTheDocument();
    expect(jejak.filter((j) => j.method === "POST")).toHaveLength(0);
  });

  it("terisi lengkap → POST terkirim, berpindah ke halaman Ubah lowongan baru", async () => {
    const { router, jejak } = renderDi("/admin/jobs/baru", []);
    await screen.findByRole("textbox", { name: /Judul lowongan/ });

    await userEvent.click(screen.getByRole("combobox", { name: /Perusahaan/ }));
    await userEvent.click(screen.getByRole("option", { name: "PT Inklusif Fiktif" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Judul lowongan/ }), "Posisi Baru Fiktif");
    await userEvent.type(screen.getByRole("textbox", { name: /Deskripsi/ }), "Deskripsi posisi baru");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/admin/jobs/01912345-89ab-7def-8123-4567890abd99",
      );
    });
    const kirim = jejak.find((j) => j.method === "POST" && j.path === "/admin/jobs");
    expect((kirim?.body as { title: string }).title).toBe("Posisi Baru Fiktif");
    expect((kirim?.body as { companyId: string }).companyId).toBe(PERUSAHAAN_ID);
  });
});

describe("formulir — ubah", () => {
  it("kolom terisi nilai lowongan yang sudah ada", async () => {
    renderDi("/admin/jobs/id-1", [
      lowongan({ id: "id-1", title: "Posisi Lama", city: "Bandung" }),
    ]);

    expect(await screen.findByDisplayValue("Posisi Lama")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bandung")).toBeInTheDocument();
  });

  it("id tidak ada di daftar → pesan 'tidak ditemukan', bukan formulir kosong", async () => {
    renderDi("/admin/jobs/tidak-ada", [lowongan({ id: "id-lain" })]);

    expect(await screen.findByText("Lowongan itu tidak ditemukan.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Judul lowongan/ })).toBeNull();
  });

  it("pemilih perusahaan NONAKTIF di mode ubah — companyId tidak bisa diubah", async () => {
    renderDi("/admin/jobs/id-1", [lowongan({ id: "id-1" })]);
    await screen.findByDisplayValue("Staf Admin");

    expect(screen.getByRole("combobox", { name: /Perusahaan/ })).toBeDisabled();
  });

  it("menyimpan perubahan → PUT terkirim dengan nilai terbaru, TANPA companyId", async () => {
    const { jejak } = renderDi("/admin/jobs/id-1", [lowongan({ id: "id-1" })]);
    const judul = await screen.findByDisplayValue("Staf Admin");

    await userEvent.clear(judul);
    await userEvent.type(judul, "Staf Admin Senior");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(jejak.some((j) => j.method === "PUT")).toBe(true));
    const badan = jejak.find((j) => j.method === "PUT")?.body as {
      title: string;
      companyId?: string;
    };
    expect(badan.title).toBe("Staf Admin Senior");
    expect(badan.companyId).toBeUndefined();
    expect(await screen.findByText(/Perubahan pada Staf Admin Senior sudah tersimpan/)).toBeInTheDocument();
  });
});

describe("terbitkan (AC: validasi akomodasi wajib sebelum publish, client)", () => {
  it("akomodasi kosong → tombol Terbitkan nonaktif dengan keterangan, TIDAK mengirim apa pun", async () => {
    const { jejak } = renderDi("/admin/jobs/id-1", [
      lowongan({ id: "id-1", accommodations: [] }),
    ]);
    await screen.findByRole("button", { name: "Terbitkan lowongan ini" });

    expect(screen.getByRole("button", { name: "Terbitkan lowongan ini" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByText("Tambahkan minimal satu akomodasi sebelum bisa menerbitkan lowongan ini."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Terbitkan lowongan ini" }));
    expect(jejak.some((j) => j.path.endsWith("/publish"))).toBe(false);
  });

  it("akomodasi terisi → Terbitkan mengirim POST, status berubah, tombol Tutup muncul", async () => {
    renderDi("/admin/jobs/id-1", [
      lowongan({ id: "id-1", accommodations: ["akses_kursi_roda"] }),
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "Terbitkan lowongan ini" }));

    expect(await screen.findByText("Diterbitkan", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terbitkan lowongan ini" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tutup lowongan ini" })).toBeInTheDocument();
  });
});

describe("tutup (AC: konfirmasi close, berdampak pelamar)", () => {
  it("tombol Tutup memunculkan dialog konfirmasi, BELUM mengirim apa pun", async () => {
    const { jejak } = renderDi("/admin/jobs/id-1", [
      lowongan({ id: "id-1", status: "published" }),
    ]);
    await screen.findByRole("button", { name: "Tutup lowongan ini" });

    await userEvent.click(screen.getByRole("button", { name: "Tutup lowongan ini" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(jejak.some((j) => j.path.endsWith("/close"))).toBe(false);
  });

  it("konfirmasi 'Ya, tutup' → POST close, badge berubah, tombol Terbitkan TIDAK kembali", async () => {
    renderDi("/admin/jobs/id-1", [lowongan({ id: "id-1", status: "published" })]);
    await userEvent.click(await screen.findByRole("button", { name: "Tutup lowongan ini" }));
    await userEvent.click(screen.getByRole("button", { name: "Ya, tutup" }));

    expect(await screen.findByText("Ditutup", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terbitkan lowongan ini" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tutup lowongan ini" })).toBeNull();
  });

  it("membatalkan dialog TIDAK mengirim apa pun", async () => {
    const { jejak } = renderDi("/admin/jobs/id-1", [
      lowongan({ id: "id-1", status: "published" }),
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "Tutup lowongan ini" }));

    const tombolBatal = screen.getAllByRole("button", { name: "Batal" });
    await userEvent.click(tombolBatal[tombolBatal.length - 1]!);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(jejak.some((j) => j.path.endsWith("/close"))).toBe(false);
  });
});
