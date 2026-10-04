// "Sederhanakan" teks lowongan (PR-087) — AC "hasil diumumkan SR saat
// menggantikan konten; toggle kembali ke asli" dan "degraded → tombol hilang +
// penjelasan; konten asli tetap". Alur browser nyata + axe ada di
// `e2e/lowongan-detail.spec.ts`.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { AiSimplifyTextResult } from "@nawasena/schemas";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";
import { TeksSederhanakan } from "../src/features/job-feed/sederhanakan.js";

const JOB = "01912345-89ab-7def-8123-4567890abe01";
const ASLI = "Kami mencari kandidat yang mampu melakukan dokumentasi operasional.";
const SEDERHANA = "Anda akan mengurus dokumen kantor.";

function klienPalsu(jawab: () => Promise<AiSimplifyTextResult>) {
  const permintaan: unknown[] = [];
  const klien: ApiClient = {
    request: (path: string, opsi?: { body?: unknown }) => {
      if (path === "/ai/simplify-text") {
        permintaan.push(opsi?.body);
        return jawab().then((data) => ({ data })) as Promise<never>;
      }
      return new Promise(() => {}) as Promise<never>;
    },
  };
  return { klien, permintaan };
}

function tampilkan(klien: ApiClient, status: "masuk" | "keluar" = "masuk") {
  useStoreSesi.setState({ status });
  const router = createMemoryRouter(
    [
      {
        path: "/lowongan/:id",
        element: (
          <TeksSederhanakan
            klien={klien}
            jobId={JOB}
            bagian="deskripsi"
            namaBagian="Deskripsi pekerjaan"
            teksAsli={ASLI}
          />
        ),
      },
    ],
    { initialEntries: [`/lowongan/${JOB}`] },
  );
  return render(
    <Providers queryClient={createQueryClient()} klienApi={klien}>
      <RouterProvider router={router} />
    </Providers>,
  );
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("TeksSederhanakan", () => {
  it("tombol → versi sederhana berlabel AI, diumumkan; toggle ke asli dan kembali TANPA permintaan kedua", async () => {
    const pengguna = userEvent.setup();
    const { klien, permintaan } = klienPalsu(() =>
      Promise.resolve({ teks: SEDERHANA, alasan: null }),
    );
    tampilkan(klien);

    const tombol = screen.getByRole("button", { name: "Sederhanakan teks ini" });
    expect(tombol).toHaveAccessibleDescription(/Ditulis ulang oleh AI/);
    expect(screen.getByText(ASLI)).toBeInTheDocument();

    await pengguna.click(tombol);

    expect(await screen.findByText(SEDERHANA)).toBeInTheDocument();
    expect(screen.queryByText(ASLI)).toBeNull();
    expect(screen.getByText(/Disederhanakan oleh AI/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Deskripsi pekerjaan: versi sederhana dari AI kini ditampilkan.",
    );
    expect(permintaan).toEqual([{ sumber: "lowongan", id: JOB, bagian: "deskripsi" }]);

    // Tombol yang SAMA — fokus tidak hilang saat konten berganti.
    const alih = screen.getByRole("button", { name: "Tampilkan teks asli" });
    expect(alih).toBe(tombol);
    expect(alih).toHaveFocus();

    await pengguna.click(alih);
    expect(screen.getByText(ASLI)).toBeInTheDocument();
    expect(screen.queryByText(/Disederhanakan oleh AI/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Deskripsi pekerjaan: teks asli kini ditampilkan.",
    );

    await pengguna.click(screen.getByRole("button", { name: "Tampilkan versi sederhana" }));
    expect(screen.getByText(SEDERHANA)).toBeInTheDocument();
    expect(permintaan).toHaveLength(1);
  });

  it("degradasi kuota → tombol hilang, penjelasan 'coba lagi besok' difokus, teks asli tetap", async () => {
    const pengguna = userEvent.setup();
    const { klien } = klienPalsu(() => Promise.resolve({ teks: null, alasan: "kuota_habis" }));
    tampilkan(klien);

    await pengguna.click(screen.getByRole("button", { name: "Sederhanakan teks ini" }));

    const penjelasan = await screen.findByText(/sudah habis\. Coba lagi besok/);
    await waitFor(() => expect(penjelasan).toHaveFocus());
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(ASLI)).toBeInTheDocument();
    // Dibacakan lewat FOKUS, bukan juga lewat wilayah status (dua kali).
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("degradasi selain kuota TIDAK menyuruh menunggu besok", async () => {
    const pengguna = userEvent.setup();
    const { klien } = klienPalsu(() =>
      Promise.resolve({ teks: null, alasan: "ai_tidak_tersedia" }),
    );
    tampilkan(klien);

    await pengguna.click(screen.getByRole("button", { name: "Sederhanakan teks ini" }));
    const penjelasan = await screen.findByText(/belum bisa dibuat untuk teks ini/);
    expect(penjelasan).not.toHaveTextContent(/besok/);
  });

  it("galat jaringan → alert, tombol tetap untuk mencoba lagi, teks asli tetap", async () => {
    const pengguna = userEvent.setup();
    const { klien } = klienPalsu(() => Promise.reject(new Error("jaringan putus")));
    tampilkan(klien);

    await pengguna.click(screen.getByRole("button", { name: "Sederhanakan teks ini" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Periksa koneksi/);
    expect(screen.getByRole("button", { name: "Sederhanakan teks ini" })).toBeInTheDocument();
    expect(screen.getByText(ASLI)).toBeInTheDocument();
  });

  it("belum masuk → tautan masuk yang kembali ke lowongan ini, tanpa tombol", () => {
    const { klien, permintaan } = klienPalsu(() =>
      Promise.resolve({ teks: SEDERHANA, alasan: null }),
    );
    tampilkan(klien, "keluar");

    const tautan = screen.getByRole("link", { name: "Masuk untuk menyederhanakan teks ini" });
    expect(tautan.getAttribute("href")).toContain(encodeURIComponent(`/lowongan/${JOB}`));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(ASLI)).toBeInTheDocument();
    expect(permintaan).toHaveLength(0);
  });
});
