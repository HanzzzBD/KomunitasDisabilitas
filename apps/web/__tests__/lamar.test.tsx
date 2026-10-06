// Alur lamar di detail lowongan (PR-078). Alur browser nyata + axe ada di
// `e2e/lamar.spec.ts`; berkas ini menjaga cepat di jsdom:
//   - pilihan pengungkapan MULAI KOSONG dan lamaran tidak berangkat sebelum
//     dipilih (AC "Default = TIDAK diungkap; tidak ada pre-checked");
//   - "Ya" nonaktif beserta alasannya bila profil tidak berisi data, dan
//     pratinjau menampilkan persis yang akan disalin;
//   - tanpa CV → dua pintu yang membawa jalan pulang (`?tujuan=`);
//   - klik ganda = satu permintaan; kunci idempotensi dikirim;
//   - SUDAH_MELAMAR dibaca sebagai hasil, bukan kegagalan;
//   - belum masuk → tautan masuk yang kembali dengan `?lamar=1`.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import type { JobPublic, ResumeSummary, SensitiveProfile, UserRole } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi, type StatusSesi } from "../src/shared/sesi/store.js";

const JOB = "01912345-89ab-7def-8123-4567890abe01";
const CV_LAMA = "01912345-89ab-7def-8123-4567890acc01";
const CV_BARU = "01912345-89ab-7def-8123-4567890acc02";

const LOWONGAN: JobPublic = {
  id: JOB,
  companyId: "01912345-89ab-7def-8123-4567890abd20",
  title: "Staf Layanan Pelanggan",
  description: "Menjawab pertanyaan pelanggan.",
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
};

function cv(id: string, title: string, updatedAt: string): ResumeSummary {
  return {
    id,
    title,
    pdfUrl: null,
    createdVia: "manual",
    createdAt: updatedAt,
    updatedAt,
  };
}

const DUA_CV = [
  cv(CV_LAMA, "CV lama", "2026-09-01T00:00:00.000Z"),
  cv(CV_BARU, "CV terbaru", "2026-09-20T00:00:00.000Z"),
];

const SENSITIF: SensitiveProfile = {
  disabilityTypes: ["tuli"],
  accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: "Butuh juru bahasa saat rapat" },
};

interface Permintaan {
  path: string;
  method: string;
  body: unknown;
  headers: Readonly<Record<string, string>> | undefined;
}

interface OpsiKlien {
  role?: UserRole;
  resumes?: ResumeSummary[];
  sensitive?: SensitiveProfile | null;
  /** Lamaran yang sudah ada untuk lowongan ini (PR-079). */
  sudahAda?: Record<string, unknown>;
  /** Jawaban POST apply; bawaan = 201. */
  apply?: () => Promise<unknown>;
}

function klienPalsu(jejak: Permintaan[], opsi: OpsiKlien = {}): ApiClient {
  return {
    request: (
      path: string,
      options?: { method?: string; body?: unknown; headers?: Record<string, string> },
    ) => {
      const method = options?.method ?? "GET";
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path === "/me") {
        return Promise.resolve({ data: { role: opsi.role ?? "seeker" } }) as Promise<never>;
      }
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }
      jejak.push({ path, method, body: options?.body, headers: options?.headers });

      // PR-079 — "sudah melamar lowongan ini?". Bawaan: belum.
      if (path.startsWith("/me/applications?")) {
        return Promise.resolve({
          data: opsi.sudahAda === undefined ? [] : [opsi.sudahAda],
          meta: { nextCursor: null },
        }) as Promise<never>;
      }

      if (path === `/jobs/${JOB}`) return Promise.resolve({ data: LOWONGAN }) as Promise<never>;
      if (path.startsWith("/companies/")) {
        return Promise.reject(
          new ApiError({ code: "GALAT_SERVER", message: "x" }, 500),
        ) as Promise<never>;
      }
      if (path === "/me/resumes") {
        return Promise.resolve({ data: opsi.resumes ?? DUA_CV }) as Promise<never>;
      }
      if (path === "/me/profile") {
        return Promise.resolve({
          data: { sensitive: opsi.sensitive === undefined ? SENSITIF : opsi.sensitive },
        }) as Promise<never>;
      }
      if (path === `/jobs/${JOB}/apply`) {
        if (opsi.apply !== undefined) return opsi.apply() as Promise<never>;
        const body = options?.body as { resumeId: string; discloseDisability: boolean };
        return Promise.resolve({
          data: {
            id: "01912345-89ab-7def-8123-4567890aff01",
            jobId: JOB,
            resumeId: body.resumeId,
            discloseDisability: body.discloseDisability,
            status: "submitted",
            appliedAt: "2026-10-02T03:00:00.000Z",
          },
        }) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderDi(jalur = `/lowongan/${JOB}`, opsi: OpsiKlien = {}, status: StatusSesi = "masuk") {
  useStoreSesi.setState({ status });
  const jejak: Permintaan[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(jejak, opsi)}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { jejak, router };
}

const permintaanApply = (jejak: Permintaan[]) => jejak.filter((p) => p.path.endsWith("/apply"));

async function bukaDialog() {
  const user = userEvent.setup();
  // Route dan katalog dimuat lazy; tunggu boot sebelum menguji dialog.
  await user.click(
    await screen.findByRole("button", { name: "Lamar lowongan ini" }, { timeout: 5000 }),
  );
  const dialog = await screen.findByRole("dialog", { name: /Lamar: Staf Layanan Pelanggan/ });
  return { user, dialog };
}

afterEach(() => {
  cleanup();
  useStoreSesi.getState().keluar();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("dialog lamar — pengungkapan", () => {
  it("kedua pilihan mulai KOSONG; kirim tanpa memilih → galat, tidak ada permintaan", async () => {
    const { jejak } = renderDi();
    const { user, dialog } = await bukaDialog();

    const ya = await within(dialog).findByRole("radio", { name: /Ya, kirim data disabilitas/ });
    const tidak = within(dialog).getByRole("radio", { name: /Tidak, jangan kirim/ });
    await waitFor(() => expect(ya).toBeEnabled());
    expect(ya).not.toBeChecked();
    expect(tidak).not.toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Kirim lamaran" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Pilih salah satu: kirim data disabilitas, atau jangan kirim.",
    );
    // Fokus dibawa ke pilihan yang belum dijawab.
    expect(ya).toHaveFocus();
    expect(permintaanApply(jejak)).toHaveLength(0);
  });

  it("konsekuensi kedua pilihan terbaca sebagai deskripsi radio-nya", async () => {
    renderDi();
    const { dialog } = await bukaDialog();
    const ya = await within(dialog).findByRole("radio", { name: /Ya, kirim/ });
    const tidak = within(dialog).getByRole("radio", { name: /Tidak, jangan kirim/ });
    expect(ya).toHaveAccessibleDescription(/salinan ragam disabilitas/);
    expect(tidak).toHaveAccessibleDescription(/hanya menerima CV Anda/);
    // Nama = label saja: konsekuensi yang ikut masuk nama dibacakan DUA kali
    // oleh NVDA (nama lalu deskripsi) — temuan run verifikasi 2026-10-02.
    expect(ya).toHaveAccessibleName("Ya, kirim data disabilitas saya");
    expect(tidak).toHaveAccessibleName("Tidak, jangan kirim data disabilitas saya");
  });

  it("'Tidak' → berangkat discloseDisability=false + CV terbaru + Idempotency-Key; fokus ke hasil", async () => {
    const { jejak } = renderDi();
    const { user, dialog } = await bukaDialog();

    // CV bawaan = yang paling baru disunting.
    expect(await within(dialog).findByRole("radio", { name: /CV terbaru/ })).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: /Tidak, jangan kirim/ }));
    await user.click(within(dialog).getByRole("button", { name: "Kirim lamaran" }));

    const judul = await screen.findByRole("heading", { level: 3, name: "Lamaran terkirim" });
    await waitFor(() => expect(judul).toHaveFocus());
    expect(screen.getByText(/Data disabilitas Anda tidak dikirim/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const [kirim] = permintaanApply(jejak);
    expect(kirim?.body).toEqual({ resumeId: CV_BARU, discloseDisability: false });
    expect(kirim?.headers?.["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it("'Ya' → pratinjau isi yang akan disalin, lalu berangkat discloseDisability=true", async () => {
    const { jejak } = renderDi();
    const { user, dialog } = await bukaDialog();

    const ya = await within(dialog).findByRole("radio", { name: /Ya, kirim/ });
    await waitFor(() => expect(ya).toBeEnabled());
    expect(within(dialog).queryByText("Yang akan dikirim ke perusahaan")).not.toBeInTheDocument();
    await user.click(ya);

    const pratinjau = within(dialog).getByRole("region", {
      name: "Yang akan dikirim ke perusahaan",
    });
    expect(pratinjau).toHaveTextContent("Tuli");
    expect(pratinjau).toHaveTextContent("Butuh juru bahasa saat rapat");

    await user.click(within(dialog).getByRole("button", { name: "Kirim lamaran" }));
    await screen.findByRole("heading", { level: 3, name: "Lamaran terkirim" });
    expect(permintaanApply(jejak)[0]?.body).toEqual({
      resumeId: CV_BARU,
      discloseDisability: true,
    });
  });

  it("profil tanpa data disabilitas → 'Ya' nonaktif DENGAN alasan + tautan profil", async () => {
    renderDi(undefined, { sensitive: null });
    const { dialog } = await bukaDialog();

    const ya = await within(dialog).findByRole("radio", { name: /Ya, kirim/ });
    await waitFor(() => expect(ya).toBeDisabled());
    expect(ya).toHaveAccessibleDescription(/profil Anda belum berisi data disabilitas/);
    expect(
      within(dialog).getByRole("link", { name: "Lengkapi di halaman Profil" }),
    ).toHaveAttribute("href", "/profil");
    expect(within(dialog).getByRole("radio", { name: /Tidak, jangan kirim/ })).toBeEnabled();
  });
});

describe("dialog lamar — CV & klik ganda", () => {
  it("tanpa CV → dua pintu yang membawa jalan pulang ke lowongan ini", async () => {
    renderDi(undefined, { resumes: [] });
    const { dialog } = await bukaDialog();

    expect(
      await within(dialog).findByRole("heading", { name: "Anda belum punya CV" }),
    ).toBeInTheDocument();
    const ai = within(dialog).getByRole("link", { name: "Buat CV dengan bantuan AI" });
    expect(ai).toHaveAttribute(
      "href",
      `/cv/chat?tujuan=${encodeURIComponent(`/lowongan/${JOB}?lamar=1`)}`,
    );
    expect(within(dialog).getByRole("button", { name: "Buat CV dari profil saya" })).toBeVisible();
  });

  it("klik ganda saat mengirim → SATU permintaan", async () => {
    let lepas: (v: unknown) => void = () => {};
    const { jejak } = renderDi(undefined, {
      apply: () =>
        new Promise((r) => {
          lepas = r;
        }),
    });
    const { user, dialog } = await bukaDialog();
    await user.click(await within(dialog).findByRole("radio", { name: /Tidak, jangan kirim/ }));
    const kirim = within(dialog).getByRole("button", { name: "Kirim lamaran" });
    await user.click(kirim);
    await user.click(within(dialog).getByRole("button", { name: "Mengirim lamaran…" }));
    await user.dblClick(within(dialog).getByRole("button", { name: "Mengirim lamaran…" }));
    expect(permintaanApply(jejak)).toHaveLength(1);
    lepas({
      data: {
        id: "01912345-89ab-7def-8123-4567890aff01",
        jobId: JOB,
        resumeId: CV_BARU,
        discloseDisability: false,
        status: "submitted",
        appliedAt: "2026-10-02T03:00:00.000Z",
      },
    });
    await screen.findByRole("heading", { level: 3, name: "Lamaran terkirim" });
  });

  it("percobaan ulang dalam satu pembukaan memakai kunci idempotensi yang SAMA", async () => {
    let ke = 0;
    const { jejak } = renderDi(undefined, {
      apply: () => {
        ke += 1;
        return ke === 1
          ? Promise.reject(new ApiError({ code: "JARINGAN_GAGAL", message: "x" }, 0))
          : Promise.reject(
              new ApiError({ code: "SUDAH_MELAMAR", message: "Anda sudah melamar" }, 409),
            );
      },
    });
    const { user, dialog } = await bukaDialog();
    await user.click(await within(dialog).findByRole("radio", { name: /Tidak, jangan kirim/ }));
    await user.click(within(dialog).getByRole("button", { name: "Kirim lamaran" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Kirim lamaran" }));

    // SUDAH_MELAMAR = tujuan sudah tercapai, bukan kegagalan.
    expect(
      await screen.findByRole("heading", { level: 3, name: "Anda sudah melamar lowongan ini" }),
    ).toBeInTheDocument();
    const [a, b] = permintaanApply(jejak);
    expect(a?.headers?.["Idempotency-Key"]).toBe(b?.headers?.["Idempotency-Key"]);
  });
});

describe("bagian lamar — sesi & ?lamar=1", () => {
  it.each(["admin", "employer"] as const)(
    "%s bisa membaca lowongan tanpa dialog atau permintaan lamaran pribadi",
    async (role) => {
      useStoreSesi.getState().masuk(`header.${btoa(JSON.stringify({ role }))}.tanda`);
      const { jejak, router } = renderDi(`/lowongan/${JOB}?lamar=1`, { role });
      await screen.findByRole("heading", { name: LOWONGAN.title, level: 1 });
      expect(router.state.location.pathname).toBe(`/lowongan/${JOB}`);
      expect(screen.queryByRole("button", { name: "Lamar lowongan ini" })).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(jejak.some((p) => /^\/me\/(applications|resumes|profile)/.test(p.path))).toBe(false);
    },
  );

  it("belum masuk → tautan masuk yang kembali ke dialog lamar", async () => {
    renderDi(undefined, {}, "keluar");
    const tautan = await screen.findByRole("link", { name: "Masuk untuk melamar" });
    expect(tautan).toHaveAttribute(
      "href",
      `/masuk?tujuan=${encodeURIComponent(`/lowongan/${JOB}?lamar=1`)}`,
    );
    expect(screen.queryByRole("button", { name: "Lamar lowongan ini" })).not.toBeInTheDocument();
  });

  it("?lamar=1 membuka dialog sendiri, lalu parameternya dibuang", async () => {
    const { router } = renderDi(`/lowongan/${JOB}?lamar=1`);
    expect(
      await screen.findByRole("dialog", { name: /Lamar: Staf Layanan Pelanggan/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });
});

describe("bagian lamar — sudah pernah melamar (PR-079)", () => {
  it("lamaran yang sudah ada → status + tautan ke detailnya, TANPA tombol Lamar", async () => {
    const ID = "01912345-89ab-7def-8123-4567890aff09";
    const { jejak } = renderDi(undefined, {
      sudahAda: {
        id: ID,
        jobId: JOB,
        resumeId: null,
        discloseDisability: false,
        status: "interview",
        appliedAt: "2026-09-20T03:00:00.000Z",
        updatedAt: "2026-09-25T03:00:00.000Z",
        hiredConfirmedAt: null,
        job: { title: "Staf Layanan Pelanggan", companyName: "PT", aktif: true },
      },
    });
    expect(
      await screen.findByRole("heading", { level: 3, name: "Anda sudah melamar lowongan ini" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Undangan wawancara")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat lamaran saya" })).toHaveAttribute(
      "href",
      `/lamaran/${ID}`,
    );
    expect(screen.queryByRole("button", { name: "Lamar lowongan ini" })).not.toBeInTheDocument();
    expect(jejak.some((p) => p.path === `/me/applications?job_id=${JOB}&limit=1`)).toBe(true);
  });

  it("sesudah terkirim → tautan hasil ke detail lamaran yang baru", async () => {
    renderDi();
    const { user, dialog } = await bukaDialog();
    await user.click(await within(dialog).findByRole("radio", { name: /Tidak, jangan kirim/ }));
    await user.click(within(dialog).getByRole("button", { name: "Kirim lamaran" }));
    await screen.findByRole("heading", { level: 3, name: "Lamaran terkirim" });
    expect(screen.getByRole("link", { name: "Lihat lamaran ini" })).toHaveAttribute(
      "href",
      "/lamaran/01912345-89ab-7def-8123-4567890aff01",
    );
  });
});

describe("dialog lamar — kirim sebelum daftar CV tiba (temuan PR-082)", () => {
  it("Kirim ditahan (aria-disabled), tidak ada galat 'Pilih CV' palsu, lalu berhasil", async () => {
    let lepasCv: (v: unknown) => void = () => {};
    const jejak: Permintaan[] = [];
    const dasar = klienPalsu(jejak);
    const klien: ApiClient = {
      request: (path, opsi) =>
        path === "/me/resumes"
          ? (new Promise<unknown>((r) => {
              lepasCv = r;
            }) as Promise<never>)
          : dasar.request(path, opsi as never),
    };
    useStoreSesi.setState({ status: "masuk" });
    const router = createMemoryRouter(ruteApp, { initialEntries: [`/lowongan/${JOB}`] });
    render(
      <Providers queryClient={createQueryClient()} klienApi={klien}>
        <RouterProvider router={router} />
      </Providers>,
    );
    const { user, dialog } = await bukaDialog();
    await user.click(await within(dialog).findByRole("radio", { name: /Tidak, jangan kirim/ }));
    const kirim = within(dialog).getByRole("button", { name: "Kirim lamaran" });
    expect(kirim).toHaveAttribute("aria-disabled", "true");
    await user.click(kirim);
    expect(within(dialog).queryByText("Pilih CV yang akan dikirim.")).not.toBeInTheDocument();
    expect(permintaanApply(jejak)).toHaveLength(0);

    lepasCv({ data: DUA_CV });
    await waitFor(() => expect(kirim).toHaveAttribute("aria-disabled", "false"));
    await user.click(kirim);
    await screen.findByRole("heading", { level: 3, name: "Lamaran terkirim" });
  });
});
