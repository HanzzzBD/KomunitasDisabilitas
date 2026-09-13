// Profil publik perusahaan (PR-054, Gap G5) — AC: "Semua ikon akomodasi
// berlabel teks", "Badge verified vs self-claimed dibedakan tekstual",
// "Daftar lowongan aktif tertaut ke detail", "Struktur heading benar".
// Alur browser nyata (axe) ada di `e2e/companies-public.spec.ts`; berkas ini
// menjaga cepat di jsdom: isi profil, badge, akomodasi, lowongan, dan
// keadaan galat/kosong/tidak-ditemukan.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import type { CompanyPublic, JobPublicSummary } from "@nawasena/schemas";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const PERUSAHAAN_ID = "01912345-89ab-7def-8123-4567890abd20";

function perusahaan(overrides: Partial<CompanyPublic> = {}): CompanyPublic {
  return {
    id: PERUSAHAAN_ID,
    name: "PT Inklusif Fiktif",
    description: null,
    website: null,
    city: "Jakarta",
    inclusivityStatus: "unverified",
    accommodationsAvailable: [],
    verifiedAt: null,
    ...overrides,
  };
}

function lowongan(overrides: Partial<JobPublicSummary> = {}): JobPublicSummary {
  return {
    id: "01912345-89ab-7def-8123-4567890abd21",
    title: "Staf Admin",
    employmentType: "full_time",
    workMode: "onsite",
    city: "Jakarta",
    province: "DKI Jakarta",
    publishedAt: "2026-01-10T00:00:00.000Z",
    ...overrides,
  };
}

function klienPalsu(profil: CompanyPublic | null, lowonganAktif: JobPublicSummary[]): ApiClient {
  return {
    request: (path: string) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }

      const jobsMatch = /^\/companies\/([^/]+)\/jobs$/.exec(path);
      if (jobsMatch !== null) {
        return Promise.resolve({
          data: jobsMatch[1] === PERUSAHAAN_ID ? lowonganAktif : [],
        }) as Promise<never>;
      }

      const profilMatch = /^\/companies\/([^/]+)$/.exec(path);
      if (profilMatch !== null) {
        if (profil === null || profilMatch[1] !== profil.id) {
          return Promise.reject(
            new ApiError(
              { code: "PERUSAHAAN_TIDAK_DITEMUKAN", message: "Perusahaan tidak ditemukan" },
              404,
            ),
          ) as Promise<never>;
        }
        return Promise.resolve({ data: profil }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderDi(
  jalur: string,
  profil: CompanyPublic | null,
  lowonganAktif: JobPublicSummary[] = [],
) {
  useStoreSesi.setState({ status: "memulihkan" });
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });

  return render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(profil, lowonganAktif)}>
      <RouterProvider router={router} />
    </Providers>,
  );
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("profil publik perusahaan", () => {
  it("menampilkan nama sebagai h1, dan badge status verified secara tekstual", async () => {
    renderDi(`/companies/${PERUSAHAAN_ID}`, perusahaan({ inclusivityStatus: "verified" }));

    expect(await screen.findByRole("heading", { level: 1, name: "PT Inklusif Fiktif" })).toBeInTheDocument();
    expect(screen.getByText("Terverifikasi")).toBeInTheDocument();
  });

  it("status self-claimed dibedakan TEKSTUAL dari verified (bukan warna saja)", async () => {
    renderDi(`/companies/${PERUSAHAAN_ID}`, perusahaan({ inclusivityStatus: "self_claimed" }));

    expect(await screen.findByText("Klaim mandiri")).toBeInTheDocument();
    expect(screen.queryByText("Terverifikasi")).toBeNull();
  });

  it("struktur heading: h1 lalu h2 Akomodasi dan h2 Lowongan aktif", async () => {
    renderDi(`/companies/${PERUSAHAAN_ID}`, perusahaan());
    await screen.findByRole("heading", { level: 1 });

    const h2 = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent);
    expect(h2).toEqual(["Akomodasi yang tersedia", "Lowongan aktif"]);
  });

  it("setiap akomodasi tampil dengan LABEL TEKS (bukan hanya ikon)", async () => {
    renderDi(
      `/companies/${PERUSAHAAN_ID}`,
      perusahaan({ accommodationsAvailable: ["akses_kursi_roda", "ramah_screen_reader"] }),
    );

    expect(await screen.findByText("Akses kursi roda")).toBeInTheDocument();
    expect(screen.getByText("Perangkat lunak ramah pembaca layar")).toBeInTheDocument();
  });

  it("tanpa akomodasi → kalimat penjelasan, bukan daftar kosong senyap", async () => {
    renderDi(`/companies/${PERUSAHAAN_ID}`, perusahaan({ accommodationsAvailable: [] }));

    expect(
      await screen.findByText("Perusahaan ini belum mencantumkan akomodasi apa pun."),
    ).toBeInTheDocument();
  });

  it("lowongan aktif tertaut ke /lowongan/:id (AC: daftar lowongan tertaut ke detail)", async () => {
    renderDi(`/companies/${PERUSAHAAN_ID}`, perusahaan(), [lowongan()]);

    const tautan = await screen.findByRole("link", { name: /Lihat detail lowongan Staf Admin/ });
    expect(tautan).toHaveAttribute("href", "/lowongan/01912345-89ab-7def-8123-4567890abd21");
  });

  it("tanpa lowongan aktif → keadaan kosong yang menjelaskan", async () => {
    renderDi(`/companies/${PERUSAHAAN_ID}`, perusahaan(), []);

    expect(await screen.findByText("Belum ada lowongan aktif")).toBeInTheDocument();
  });

  it("perusahaan tidak ada → pesan 'tidak ditemukan', bukan layar galat generik", async () => {
    renderDi("/companies/01912345-89ab-7def-8123-4567890abdff", null);

    expect(await screen.findByText("Perusahaan tidak ditemukan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke beranda" })).toBeInTheDocument();
  });
});
