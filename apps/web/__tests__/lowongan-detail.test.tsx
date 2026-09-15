// Detail lowongan publik (PR-059, FR-4.4) — AC "H1 jabatan; section: ringkasan,
// deskripsi, akomodasi, perusahaan", "gaji bila visible", "tidak ditemukan".
// Alur browser nyata (axe, kembali ke daftar, 320px) ada di
// `e2e/lowongan-detail.spec.ts`; berkas ini menjaga cepat di jsdom.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import type { CompanyPublic, JobPublic } from "@nawasena/schemas";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const LOWONGAN_ID = "01912345-89ab-7def-8123-4567890abe01";
const PERUSAHAAN_ID = "01912345-89ab-7def-8123-4567890abd20";

function lowongan(overrides: Partial<JobPublic> = {}): JobPublic {
  return {
    id: LOWONGAN_ID,
    companyId: PERUSAHAAN_ID,
    title: "Staf Layanan Pelanggan",
    description: "Menjawab pertanyaan pelanggan.\n\nBekerja dalam tim kecil.",
    requirements: null,
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    salaryMin: null,
    salaryMax: null,
    accommodations: [],
    welcomedDisabilityTypes: [],
    publishedAt: "2026-01-12T00:00:00.000Z",
    expiresAt: null,
    ...overrides,
  };
}

function perusahaan(overrides: Partial<CompanyPublic> = {}): CompanyPublic {
  return {
    id: PERUSAHAAN_ID,
    name: "PT Inklusif Fiktif",
    description: null,
    website: null,
    city: "Jakarta",
    inclusivityStatus: "verified",
    accommodationsAvailable: ["ramah_screen_reader"],
    verifiedAt: "2026-01-16T03:00:00.000Z",
    ...overrides,
  };
}

function klienPalsu(job: JobPublic | null, company: CompanyPublic | null): ApiClient {
  return {
    request: (path: string) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }

      const jobMatch = /^\/jobs\/([^/]+)$/.exec(path);
      if (jobMatch !== null) {
        if (job === null || jobMatch[1] !== job.id) {
          return Promise.reject(
            new ApiError(
              { code: "LOWONGAN_TIDAK_DITEMUKAN", message: "Lowongan tidak ditemukan" },
              404,
            ),
          ) as Promise<never>;
        }
        return Promise.resolve({ data: job }) as Promise<never>;
      }

      const companyMatch = /^\/companies\/([^/]+)$/.exec(path);
      if (companyMatch !== null) {
        if (company === null) {
          return Promise.reject(
            new ApiError({ code: "GALAT_SERVER", message: "Galat" }, 500),
          ) as Promise<never>;
        }
        return Promise.resolve({ data: company }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderDetail(job: JobPublic | null, company: CompanyPublic | null = perusahaan()) {
  useStoreSesi.setState({ status: "memulihkan" });
  const router = createMemoryRouter(ruteApp, { initialEntries: [`/lowongan/${LOWONGAN_ID}`] });

  return render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(job, company)}>
      <RouterProvider router={router} />
    </Providers>,
  );
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("detail lowongan publik", () => {
  it("judul lowongan adalah h1, lalu h2 per bagian tanpa melompati tingkat", async () => {
    renderDetail(lowongan({ requirements: "Lulus SMA." }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Staf Layanan Pelanggan" }),
    ).toBeInTheDocument();
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent);
    expect(h2).toEqual([
      "Ringkasan lowongan",
      "Deskripsi pekerjaan",
      "Persyaratan",
      "Akomodasi untuk posisi ini",
      "Terbuka untuk",
      "Tentang perusahaan",
      "Cara melamar",
    ]);
    expect(
      await screen.findByRole("heading", { level: 3, name: "PT Inklusif Fiktif" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 4, name: "Akomodasi di perusahaan ini" }),
    ).toBeInTheDocument();
  });

  it("tanpa persyaratan → bagian Persyaratan tidak dirender", async () => {
    renderDetail(lowongan({ requirements: null }));
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByRole("heading", { name: "Persyaratan" })).toBeNull();
  });

  it("ringkasan memuat jenis, mode, lokasi, dan tanggal terbit (WIB)", async () => {
    renderDetail(lowongan());
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByText("Jenis pekerjaan")).toBeInTheDocument();
    expect(screen.getByText("Jakarta, DKI Jakarta")).toBeInTheDocument();
    const terbit = document.querySelector('time[datetime="2026-01-12T00:00:00.000Z"]');
    expect(terbit?.textContent).toBe("12 Januari 2026");
  });

  it("gaji tampil bila server mengirimkannya", async () => {
    renderDetail(lowongan({ salaryMin: 5_000_000, salaryMax: 8_000_000 }));
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByText("Gaji")).toBeInTheDocument();
    expect(screen.getByText(/5\.000\.000 – .*8\.000\.000 per bulan/)).toBeInTheDocument();
  });

  it("gaji disembunyikan (null dari server) → baris Gaji tidak ada sama sekali", async () => {
    renderDetail(lowongan({ salaryMin: null, salaryMax: null }));
    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText("Gaji")).toBeNull();
    expect(screen.queryByText(/Rp/)).toBeNull();
  });

  it("deskripsi dirender sebagai TEKS — markup di dalamnya tidak menjadi elemen", async () => {
    renderDetail(lowongan({ description: "<b>tebal</b><img src=x onerror=alert(1)>" }));
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByText("<b>tebal</b><img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("article b")).toBeNull();
    expect(document.querySelector("article img")).toBeNull();
  });

  it("akomodasi lowongan berlabel teks; tanpa ragam → kalimat 'semua disambut'", async () => {
    renderDetail(lowongan({ accommodations: ["akses_kursi_roda"], welcomedDisabilityTypes: [] }));
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByText("Akses kursi roda")).toBeInTheDocument();
    expect(screen.getByText(/semua pelamar disambut/)).toBeInTheDocument();
  });

  it("ragam disabilitas yang disambut tampil sebagai daftar", async () => {
    renderDetail(lowongan({ welcomedDisabilityTypes: ["tuli", "netra"] }));
    const judul = await screen.findByRole("heading", { level: 2, name: "Terbuka untuk" });

    const bagian = judul.closest("section");
    expect(bagian).not.toBeNull();
    expect(within(bagian as HTMLElement).getAllByRole("listitem")).toHaveLength(2);
  });

  it("blok perusahaan: badge tekstual + tautan ke profil publik", async () => {
    renderDetail(lowongan());

    const tautan = await screen.findByRole("link", {
      name: "Lihat profil lengkap PT Inklusif Fiktif",
    });
    expect(tautan).toHaveAttribute("href", `/companies/${PERUSAHAAN_ID}`);
    expect(screen.getByText("Terverifikasi")).toBeInTheDocument();
  });

  it("perusahaan gagal dimuat → lowongan tetap tampil, blok perusahaan menjelaskan", async () => {
    renderDetail(lowongan(), null);

    // Timeout diperpanjang: galat 5xx di-retry 2× dengan jeda 1s + 2s
    // (`createQueryClient`, SDD §4.1) sebelum blok perusahaan menyerah.
    expect(
      await screen.findByText("Informasi perusahaan belum bisa ditampilkan.", undefined, {
        timeout: 6000,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Staf Layanan Pelanggan" }),
    ).toBeInTheDocument();
  });

  it("tanpa tombol 'Lamar' palsu — slot CTA hanya blok info", async () => {
    renderDetail(lowongan());
    await screen.findByRole("heading", { level: 2, name: "Cara melamar" });

    expect(screen.queryByRole("button", { name: /lamar/i })).toBeNull();
  });

  it("dibuka langsung (bukan dari daftar) → 'Kembali ke daftar' tautan biasa ke /lowongan", async () => {
    renderDetail(lowongan());
    await screen.findByRole("heading", { level: 1 });

    expect(screen.getByRole("link", { name: "Kembali ke daftar lowongan" })).toHaveAttribute(
      "href",
      "/lowongan",
    );
  });

  it("lowongan tidak ada → h1 'tidak ditemukan', bukan layar galat generik", async () => {
    renderDetail(null);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Lowongan tidak ditemukan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke daftar lowongan" })).toBeInTheDocument();
  });
});
