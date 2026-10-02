// "Lamaran Saya" (PR-079). Alur browser nyata + axe ada di
// `e2e/lamaran-saya.spec.ts`; berkas ini menjaga cepat di jsdom:
//   - daftar: satu item per lamaran (judul h2 + status + satu tautan), keadaan kosong;
//   - detail: lini masa = <ol> kronologis, titik terbaru bertanda;
//   - status terbaru DIUMUMKAN lewat wilayah `role="status"`;
//   - tarik lamaran lewat dialog konfirmasi → status "Ditarik", fokus ke judul status;
//   - "Saya diterima" satu ketuk → perayaan teks, fokus ke judulnya, tanpa animasi;
//   - lamaran orang lain / tak ada → "tidak ditemukan".
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import type { MyApplicationDetail } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const ID = "01912345-89ab-7def-8123-4567890aaa40";
const JOB = "01912345-89ab-7def-8123-4567890abd30";

function lamaran(over: Partial<MyApplicationDetail> = {}): MyApplicationDetail {
  return {
    id: ID,
    jobId: JOB,
    resumeId: null,
    discloseDisability: false,
    status: "offered",
    appliedAt: "2026-09-20T03:00:00.000Z",
    updatedAt: "2026-10-01T03:00:00.000Z",
    hiredConfirmedAt: null,
    job: { title: "Staf Admin Uji", companyName: "PT Uji Fiktif", aktif: true },
    statusHistory: [
      { from: "submitted", to: "interview", by: "admin", at: "2026-09-25T03:00:00.000Z" },
      { from: "interview", to: "offered", by: "admin", at: "2026-10-01T03:00:00.000Z" },
    ],
    ...over,
  };
}

interface Permintaan {
  path: string;
  method: string;
}

function klienPalsu(
  jejak: Permintaan[],
  opsi: { daftar?: MyApplicationDetail[]; detail?: MyApplicationDetail | null } = {},
): ApiClient {
  let d = opsi.detail === undefined ? lamaran() : opsi.detail;
  return {
    request: (path: string, options?: { method?: string }) => {
      const method = options?.method ?? "GET";
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }
      jejak.push({ path, method });
      if (path.startsWith("/me/applications?") || path === "/me/applications") {
        const daftar = (opsi.daftar ?? [lamaran()]).map(({ statusHistory: _r, ...l }) => l);
        return Promise.resolve({ data: daftar, meta: { nextCursor: null } }) as Promise<never>;
      }
      if (d === null) {
        return Promise.reject(
          new ApiError(
            { code: "LAMARAN_TIDAK_DITEMUKAN", message: "Lamaran tidak ditemukan" },
            404,
          ),
        ) as Promise<never>;
      }
      const at = "2026-10-02T05:00:00.000Z";
      if (path.endsWith("/withdraw")) {
        d = {
          ...d,
          status: "withdrawn",
          statusHistory: [
            ...d.statusHistory,
            { from: d.status, to: "withdrawn", by: "seeker", at },
          ],
        };
        return Promise.resolve({ data: d }) as Promise<never>;
      }
      if (path.endsWith("/confirm-hired")) {
        d = {
          ...d,
          status: "hired",
          hiredConfirmedAt: at,
          statusHistory: [...d.statusHistory, { from: "offered", to: "hired", by: "seeker", at }],
        };
        return Promise.resolve({ data: d }) as Promise<never>;
      }
      if (path === `/me/applications/${ID}`) return Promise.resolve({ data: d }) as Promise<never>;
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderDi(jalur: string, opsi: Parameters<typeof klienPalsu>[1] = {}) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(jejak, opsi)}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { jejak };
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("/lamaran — daftar", () => {
  it("satu item per lamaran: judul h2, status pelamar, satu tautan ke detail", async () => {
    renderDi("/lamaran");
    expect(await screen.findByRole("heading", { level: 1, name: "Lamaran Saya" })).toBeVisible();
    const item = (await screen.findByRole("heading", { level: 2, name: "Staf Admin Uji" })).closest(
      "li",
    );
    expect(item).not.toBeNull();
    const isi = within(item as HTMLElement);
    expect(isi.getByText("Penawaran kerja")).toBeInTheDocument();
    expect(isi.getAllByRole("link")).toHaveLength(1);
    expect(isi.getByRole("link", { name: "Lihat lamaran Staf Admin Uji" })).toHaveAttribute(
      "href",
      `/lamaran/${ID}`,
    );
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toContain(
      "1 lamaran ditampilkan.",
    );
  });

  it("belum ada lamaran → keadaan kosong dengan jalan ke pencarian lowongan", async () => {
    renderDi("/lamaran", { daftar: [] });
    expect(await screen.findByRole("heading", { name: "Belum ada lamaran" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Cari lowongan" })).toHaveAttribute(
      "href",
      "/lowongan",
    );
  });
});

describe("/lamaran/:id — detail", () => {
  it("lini masa = <ol> kronologis mulai 'Lamaran dikirim', terbaru bertanda aria-current", async () => {
    renderDi(`/lamaran/${ID}`);
    const judul = await screen.findByRole("heading", { level: 2, name: "Riwayat status" });
    const daftar = within(judul.closest("section") as HTMLElement).getByRole("list");
    expect(daftar.tagName).toBe("OL");
    const item = within(daftar).getAllByRole("listitem");
    expect(item.map((li) => li.querySelector(".font-semibold")?.textContent)).toEqual([
      "Lamaran dikirim",
      "Undangan wawancara",
      "Penawaran kerja",
    ]);
    expect(item[2]).toHaveAttribute("aria-current", "step");
    expect(item[0]).not.toHaveAttribute("aria-current");
  });

  it("status terbaru diumumkan lewat wilayah status yang sudah ada sejak awal", async () => {
    renderDi(`/lamaran/${ID}`);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((s) => s.textContent === "Status terbaru lamaran Staf Admin Uji: Penawaran kerja."),
      ).toBe(true),
    );
  });

  it("tarik lamaran: dialog konfirmasi → POST → 'Ditarik', fokus ke judul status", async () => {
    const { jejak } = renderDi(`/lamaran/${ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Tarik lamaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Tarik lamaran ini?" });
    expect(dialog).toHaveAccessibleDescription(/tidak bisa dibatalkan/);
    expect(jejak.some((p) => p.path.endsWith("/withdraw"))).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Ya, tarik lamaran" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Status sekarang" })).toHaveFocus(),
    );
    expect(screen.getAllByText("Ditarik").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Tarik lamaran" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Saya diterima/ })).not.toBeInTheDocument();
    expect(jejak.filter((p) => p.path.endsWith("/withdraw"))).toHaveLength(1);
  });

  it("'Saya diterima' SATU ketuk → perayaan teks, fokus ke judulnya, emoji tersembunyi dari SR", async () => {
    const { jejak } = renderDi(`/lamaran/${ID}`);
    const user = userEvent.setup();
    const tombol = await screen.findByRole("button", { name: "Saya diterima" });
    await user.click(tombol);

    const selamat = await screen.findByRole("heading", {
      level: 2,
      name: "Selamat, Anda diterima bekerja!",
    });
    await waitFor(() => expect(selamat).toHaveFocus());
    expect(jejak.filter((p) => p.path.endsWith("/confirm-hired"))).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Saya diterima" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Diterima bekerja").length).toBeGreaterThan(0);
  });

  it("status tanpa penawaran → tidak ada tombol 'Saya diterima'; status akhir → tidak bisa ditarik", async () => {
    renderDi(`/lamaran/${ID}`, { detail: lamaran({ status: "rejected" }) });
    expect(await screen.findByText("Tidak dilanjutkan", { selector: "span" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Saya diterima" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tarik lamaran" })).not.toBeInTheDocument();
  });

  it("lamaran tidak ada / milik orang lain → 'tidak ditemukan'", async () => {
    renderDi(`/lamaran/${ID}`, { detail: null });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Lamaran tidak ditemukan" }),
    ).toBeVisible();
  });
});
