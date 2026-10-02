// Operasional lamaran admin (PR-077b). Alur browser nyata + axe ada di
// `e2e/admin-lamaran.spec.ts`; berkas ini menjaga cepat di jsdom:
//   - saringan dikirim ke SERVER (bukan disaring di klien) + "Muat lebih banyak";
//   - data disabilitas TIDAK pernah tampil sebelum dibuka dengan alasan, dan
//     lamaran yang tidak mengungkap tidak menawarkan tombolnya sama sekali;
//   - pilihan status = tujuan sah mesin status (mundur tidak ditawarkan);
//   - alasan wajib sebelum PUT/POST berangkat.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { AdminApplication, AdminApplicationDetail } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

// Radix Select butuh Pointer Events API yang tidak ada di jsdom — alasan sama
// dengan `admin-jobs.test.tsx`.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const ADMIN = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Admin Uji",
  email: null,
  phone: "+6281234567890",
  role: "admin",
  createdAt: "2026-01-15T20:00:00.000Z",
};

const ID_A = "01912345-89ab-7def-8123-4567890aaa01";
const ID_B = "01912345-89ab-7def-8123-4567890aaa02";
const JOB = "01912345-89ab-7def-8123-4567890abd01";

function lamaran(over: Partial<AdminApplication> = {}): AdminApplication {
  return {
    id: ID_A,
    jobId: JOB,
    resumeId: null,
    discloseDisability: false,
    status: "submitted",
    appliedAt: "2026-10-01T03:00:00.000Z",
    updatedAt: "2026-10-01T03:00:00.000Z",
    hiredConfirmedAt: null,
    job: { title: "Staf Admin", companyName: "PT Uji", aktif: true },
    applicant: { userId: ADMIN.id, fullName: "Rina Pelamar" },
    ...over,
  };
}

function detail(over: Partial<AdminApplicationDetail> = {}): AdminApplicationDetail {
  return {
    ...lamaran(),
    statusHistory: [],
    applicant: { userId: ADMIN.id, fullName: "Rina Pelamar", phone: "+6281111", email: null },
    resume: null,
    ...over,
  };
}

interface Permintaan {
  path: string;
  method: string;
  body: unknown;
}

function klienPalsu(
  jejak: Permintaan[],
  opsi: { detail?: AdminApplicationDetail } = {},
): ApiClient {
  let d = opsi.detail ?? detail();
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

      if (path === "/admin/jobs") return Promise.resolve({ data: [] }) as Promise<never>;
      if (path.startsWith("/admin/applications?") || path === "/admin/applications") {
        const kedua = path.includes("cursor=hal2");
        return Promise.resolve({
          data: kedua
            ? [lamaran({ id: ID_B, applicant: { userId: ID_B, fullName: "Bayu Pelamar" } })]
            : [lamaran()],
          meta: { nextCursor: kedua ? null : "hal2" },
        }) as Promise<never>;
      }
      if (path.endsWith("/status")) {
        const body = options?.body as { status: AdminApplicationDetail["status"] };
        d = { ...d, status: body.status };
        return Promise.resolve({ data: d }) as Promise<never>;
      }
      if (path.endsWith("/disclosure")) {
        return Promise.resolve({
          data: {
            disabilityTypes: ["tuli"],
            accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: null },
            capturedAt: "2026-10-01T03:00:00.000Z",
          },
        }) as Promise<never>;
      }
      if (path.startsWith("/admin/applications/"))
        return Promise.resolve({ data: d }) as Promise<never>;
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderDi(jalur: string, opsi: { detail?: AdminApplicationDetail } = {}) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(jejak, opsi)}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { jejak, router };
}

afterEach(() => {
  cleanup();
});

describe("/admin/lamaran — daftar", () => {
  it("menampilkan baris + 'Muat lebih banyak' memuat halaman berikutnya dengan cursor", async () => {
    const { jejak } = renderDi("/admin/lamaran");
    const tabel = await screen.findByRole("table");
    expect(within(tabel).getByText("Rina Pelamar")).toBeInTheDocument();
    expect(within(tabel).getByText("Tidak diungkap")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Muat lebih banyak" }));
    expect(await within(tabel).findByText("Bayu Pelamar")).toBeInTheDocument();
    expect(jejak.some((j) => j.path.includes("cursor=hal2"))).toBe(true);
    // Halaman terakhir → tombolnya hilang, jumlah diumumkan.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Muat lebih banyak" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("2 lamaran ditampilkan.")).toBeInTheDocument();
  });

  it("saringan status dikirim ke SERVER sebagai query", async () => {
    const { jejak } = renderDi("/admin/lamaran");
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("combobox", { name: /Saring menurut status/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Undangan wawancara" }));
    await waitFor(() => {
      expect(jejak.some((j) => j.path.includes("status=interview"))).toBe(true);
    });
  });
});

describe("/admin/lamaran/:id — detail", () => {
  it("lamaran tidak diungkap → tidak ada tombol 'Tampilkan', pesan menghormati pilihan", async () => {
    renderDi(`/admin/lamaran/${ID_A}`);
    expect(await screen.findByText(/memilih tidak mengungkap/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tampilkan data yang diungkap" }),
    ).not.toBeInTheDocument();
  });

  it("pilihan status hanya tujuan sah: dari interview TIDAK menawarkan mundur", async () => {
    renderDi(`/admin/lamaran/${ID_A}`, { detail: detail({ status: "interview" }) });
    await userEvent.click(await screen.findByRole("combobox", { name: /Status baru/ }));
    const opsi = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(opsi).toEqual(["Penawaran kerja", "Diterima bekerja", "Belum berhasil"]);
  });

  it("status akhir → tidak ada formulir, penjelasan tampil", async () => {
    renderDi(`/admin/lamaran/${ID_A}`, { detail: detail({ status: "withdrawn" }) });
    expect(await screen.findByText(/sudah akhir/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Status baru/ })).not.toBeInTheDocument();
  });

  it("alasan wajib: Simpan tanpa alasan TIDAK mengirim PUT; dengan alasan → PUT + kabar", async () => {
    const { jejak } = renderDi(`/admin/lamaran/${ID_A}`);
    await userEvent.click(await screen.findByRole("combobox", { name: /Status baru/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Undangan wawancara" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan status" }));
    expect(await screen.findByText("Tulis alasan perubahan.")).toBeInTheDocument();
    expect(jejak.some((j) => j.method === "PUT")).toBe(false);

    await userEvent.type(
      screen.getByRole("textbox", { name: /Alasan perubahan/ }),
      "perusahaan mengundang",
    );
    await userEvent.click(screen.getByRole("button", { name: "Simpan status" }));
    expect(await screen.findByText(/Status diubah menjadi Undangan wawancara/)).toBeInTheDocument();
    expect(jejak.find((j) => j.method === "PUT")?.body).toEqual({
      status: "interview",
      reason: "perusahaan mengundang",
    });
  });

  it("data diungkap: tersembunyi bawaan, dibuka lewat dialog ber-alasan, lalu bisa disembunyikan", async () => {
    const { jejak } = renderDi(`/admin/lamaran/${ID_A}`, {
      detail: detail({ discloseDisability: true }),
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Tampilkan data yang diungkap" }),
    );
    expect(screen.queryByText("Juru bahasa isyarat", { exact: false })).not.toBeInTheDocument();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Buka data" }));
    expect(await within(dialog).findByText("Tulis alasan membuka data ini.")).toBeInTheDocument();
    expect(jejak.some((j) => j.path.endsWith("/disclosure"))).toBe(false);

    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Alasan membuka/ }),
      "tiket #9",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Buka data" }));
    expect(await screen.findByText("Data disabilitas ditampilkan.")).toBeInTheDocument();
    expect(jejak.find((j) => j.path.endsWith("/disclosure"))?.body).toEqual({ reason: "tiket #9" });

    await userEvent.click(screen.getByRole("button", { name: "Sembunyikan lagi" }));
    expect(
      screen.getByRole("button", { name: "Tampilkan data yang diungkap" }),
    ).toBeInTheDocument();
  });
});
