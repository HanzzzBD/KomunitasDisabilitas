// Beranda seeker — feed AI Job Matching (PR-074).
//
// Dirender lewat `ruteApp` PRODUKSI di alamat "/" (pola `notifikasi.test.tsx`):
// yang diuji adalah halaman yang benar-benar tersambung ke alamatnya, termasuk
// pilihan landing ↔ feed ↔ halaman cari (flag).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import type { MatchItem, MatchesResponse } from "@nawasena/schemas";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi, type StatusSesi } from "../src/shared/sesi/store.js";

function memori(): PenyimpananA11y {
  const isi: Record<string, string> = {};
  return {
    getItem: (k) => isi[k] ?? null,
    setItem: (k, v) => {
      isi[k] = v;
    },
    removeItem: (k) => {
      delete isi[k];
    },
  };
}

const item = (n: number, o: Partial<MatchItem> = {}): MatchItem => ({
  job: {
    id: `01912345-89ab-7def-8123-${String(n).padStart(12, "0")}`,
    companyId: "01912345-89ab-7def-8123-4567890abc01",
    companyName: "PT Inklusif Fiktif",
    title: `Lowongan ${String(n)}`,
    employmentType: "full_time",
    workMode: "remote",
    city: "Bandung",
    province: "Jawa Barat",
    accommodations: ["jam_kerja_fleksibel"],
    publishedAt: "2026-09-01T00:00:00.000Z",
  },
  score: 0.73,
  explanation: "Cocok: bisa kerja dari rumah (remote), sesuai keahlian Excel.",
  explanationSource: "template",
  ...o,
});

const meta = (o: Partial<MatchesResponse["meta"]> = {}): MatchesResponse["meta"] => ({
  nextCursor: null,
  degraded: false,
  aiMenyusun: false,
  sisaRefresh: 2,
  diperbaruiPada: "2026-09-30T05:00:00.000Z",
  alasanKosong: null,
  ...o,
});

interface OpsiKlien {
  halaman1?: MatchesResponse;
  halaman2?: MatchesResponse;
  setelahTerbaru?: MatchesResponse;
  setelahRefresh?: MatchesResponse;
}

function klienPalsu(opsi: OpsiKlien) {
  const jejak: Array<{ path: string; method: string }> = [];
  let panggilanDaftar = 0;
  const klien: ApiClient = {
    request: (path: string, o?: { method?: string }) => {
      if (path === "/auth/refresh" || path === "/me/accessibility") {
        return new Promise(() => {}) as Promise<never>;
      }
      const method = o?.method ?? "GET";
      jejak.push({ path, method });
      if (path.startsWith("/me/notifications")) {
        return Promise.resolve({
          data: [],
          meta: { nextCursor: null, unreadCount: 0 },
        }) as Promise<never>;
      }
      if (path === "/me/profile") {
        return Promise.resolve({
          data: {
            headline: null,
            summary: null,
            city: "Bandung",
            province: "Jawa Barat",
            openToRemote: true,
            disclosureDefault: "ask_each_time",
            consentSensitiveAt: null,
            sensitive: null,
          },
        }) as Promise<never>;
      }
      if (path.startsWith("/me/matches/refresh")) {
        return Promise.resolve(opsi.setelahRefresh ?? opsi.halaman1) as Promise<never>;
      }
      if (path.startsWith("/me/matches")) {
        if (path.includes("cursor=")) return Promise.resolve(opsi.halaman2) as Promise<never>;
        panggilanDaftar += 1;
        const jawaban =
          panggilanDaftar > 1 && opsi.setelahTerbaru !== undefined
            ? opsi.setelahTerbaru
            : opsi.halaman1;
        return Promise.resolve(jawaban) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
  return { klien, jejak };
}

function renderBeranda(
  opsi: OpsiKlien,
  { status = "masuk", sederhana = false }: { status?: StatusSesi; sederhana?: boolean } = {},
) {
  useStoreSesi.setState({ status });
  const { klien, jejak } = klienPalsu(opsi);
  const a11y = createA11yStore({ storage: memori() });
  if (sederhana) a11y.getState().setPreferensi({ simpleLanguage: true });
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/"] });
  const hasil = render(
    <Providers queryClient={createQueryClient()} klienApi={klien} a11yStore={a11y}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, jejak, router };
}

const tungguFeed = (nama: string | RegExp = "Lowongan untuk Anda") =>
  screen.findByRole("heading", { level: 1, name: nama }, { timeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("alamat '/' memilih isinya dari sesi", () => {
  it("belum masuk → landing; tidak ada permintaan feed", async () => {
    const { jejak } = renderBeranda({ halaman1: { data: [], meta: meta() } }, { status: "keluar" });
    expect(
      await screen.findByRole("link", { name: /daftar/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(jejak.some((j) => j.path.startsWith("/me/matches"))).toBe(false);
  });

  it("sesi masih dipulihkan → tidak menebak (tanpa landing, tanpa feed)", async () => {
    renderBeranda({ halaman1: { data: [], meta: meta() } }, { status: "memulihkan" });
    expect(
      await screen.findByText(/memulihkan|memeriksa/i, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("flag VITE_MATCHING_FEED_ENABLED=false → halaman cari lowongan (rollback)", async () => {
    vi.stubEnv("VITE_MATCHING_FEED_ENABLED", "false");
    const { jejak } = renderBeranda({ halaman1: { data: [], meta: meta() } });
    await tungguFeed("Cari Lowongan");
    expect(jejak.some((j) => j.path.startsWith("/me/matches"))).toBe(false);
  });
});

describe("kartu — satu kesatuan bagi screen reader", () => {
  it("judul, skor (angka + label), alasan, info, akomodasi, lalu SATU tautan di akhir", async () => {
    renderBeranda({ halaman1: { data: [item(1)], meta: meta() } });
    await tungguFeed();
    const kartu = (await screen.findByRole("heading", { name: "Lowongan 1" })).closest("li");
    expect(kartu).not.toBeNull();
    const k = within(kartu!);
    // AC "Skor bukan warna-saja": angka DAN label tertulis.
    expect(k.getByText("Kecocokan 73% — sangat cocok")).toBeInTheDocument();
    expect(k.getByText(/sesuai keahlian Excel/)).toBeInTheDocument();
    expect(k.getByText("Kenapa cocok:")).toBeInTheDocument();
    expect(k.getByText("Jam kerja fleksibel")).toBeInTheDocument();
    const tautan = k.getAllByRole("link");
    expect(tautan).toHaveLength(1);
    expect(tautan[0]).toHaveAttribute("href", `/lowongan/${item(1).job.id}`);
    // Urutan dokumen: skor & alasan SEBELUM tautan.
    const teks = kartu!.textContent ?? "";
    expect(teks.indexOf("Kecocokan")).toBeLessThan(teks.indexOf("Lihat detail"));
  });

  it("alasan dari AI diberi catatan tertulis; mode teks sederhana menyembunyikan elemen sekunder", async () => {
    const ai = item(1, {
      explanationSource: "ai",
      explanation: "Cocok karena Anda menguasai Excel.",
    });
    const { container } = renderBeranda({ halaman1: { data: [ai], meta: meta() } });
    await tungguFeed();
    expect(await screen.findByText("Alasan disusun AI")).toBeInTheDocument();
    expect(container.querySelector("li svg[viewBox='0 0 100 4']")).not.toBeNull();
    cleanup();

    const s = renderBeranda({ halaman1: { data: [ai], meta: meta() } }, { sederhana: true });
    await tungguFeed("Lowongan yang cocok untuk Anda");
    expect(await screen.findByText("Sangat cocok (73%)")).toBeInTheDocument();
    expect(screen.queryByText(/ditulis AI/)).toBeNull();
    expect(s.container.querySelector("li svg[viewBox='0 0 100 4']")).toBeNull();
  });

  it("lolos axe", async () => {
    const { container } = renderBeranda({
      halaman1: { data: [item(1), item(2, { score: 0.4 })], meta: meta({ degraded: true }) },
    });
    await tungguFeed();
    await screen.findByText("Lowongan 2");
    await harusLolosAksesibilitas(container);
  });
});

describe("status AI", () => {
  it("degraded → banner informatif di role=status; fitur tetap lengkap", async () => {
    renderBeranda({ halaman1: { data: [item(1)], meta: meta({ degraded: true }) } });
    await tungguFeed();
    const banner = await screen.findByText(/Rekomendasi AI sedang tidak tersedia/);
    expect(banner.closest("[role='status']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Segarkan rekomendasi" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lowongan 1" })).toBeInTheDocument();
  });

  it("aiMenyusun → tombol manual; tidak ada yang berubah sendiri; klik → urutan baru + fokus ke daftar", async () => {
    const user = userEvent.setup();
    const { jejak } = renderBeranda({
      halaman1: { data: [item(1), item(2)], meta: meta({ aiMenyusun: true }) },
      setelahTerbaru: {
        data: [item(2, { explanationSource: "ai", explanation: "Cocok karena Excel." }), item(1)],
        meta: meta(),
      },
    });
    await tungguFeed();
    await screen.findByText(/sedang disusun/);
    // Tidak ada refetch otomatis.
    await new Promise((r) => setTimeout(r, 50));
    expect(jejak.filter((j) => j.path.startsWith("/me/matches")).length).toBe(1);

    await user.click(screen.getByRole("button", { name: "Tampilkan urutan terbaru" }));
    await waitFor(() => {
      expect(screen.queryByText(/sedang disusun/)).toBeNull();
    });
    const judul = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(judul).toEqual(["Lowongan 2", "Lowongan 1"]);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 2, name: "Daftar lowongan yang cocok" }),
    );
  });
});

describe("refresh berkuota", () => {
  it("menampilkan sisa; klik → POST refresh + pengumuman", async () => {
    const user = userEvent.setup();
    const { jejak } = renderBeranda({
      halaman1: { data: [item(1)], meta: meta({ sisaRefresh: 2 }) },
      setelahRefresh: { data: [item(3)], meta: meta({ sisaRefresh: 1, aiMenyusun: true }) },
    });
    await tungguFeed();
    expect(await screen.findByText("Bisa disegarkan 2 kali lagi hari ini.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Segarkan rekomendasi" }));
    expect(await screen.findByText("Rekomendasi diperbarui.")).toBeInTheDocument();
    expect(jejak.some((j) => j.path.startsWith("/me/matches/refresh") && j.method === "POST")).toBe(
      true,
    );
    expect(await screen.findByRole("heading", { name: "Lowongan 3" })).toBeInTheDocument();
    expect(screen.getByText("Bisa disegarkan 1 kali lagi hari ini.")).toBeInTheDocument();
  });

  it("habis → tombol aria-disabled berikut alasannya, tetap bisa difokus, klik tidak mengirim apa pun", async () => {
    const user = userEvent.setup();
    const { jejak } = renderBeranda({
      halaman1: { data: [item(1)], meta: meta({ sisaRefresh: 0 }) },
    });
    await tungguFeed();
    const tombol = await screen.findByRole("button", { name: "Segarkan rekomendasi" });
    expect(tombol).toHaveAttribute("aria-disabled", "true");
    expect(tombol).not.toBeDisabled();
    expect(tombol).toHaveAccessibleDescription(
      "Kesempatan menyegarkan hari ini sudah habis. Coba lagi besok.",
    );
    tombol.focus();
    await user.click(tombol);
    expect(document.activeElement).toBe(tombol);
    expect(jejak.some((j) => j.path.startsWith("/me/matches/refresh"))).toBe(false);
  });
});

describe("keadaan kosong, pagination, jembatan ke cari", () => {
  it("profil belum siap → ajakan lengkapi profil", async () => {
    renderBeranda({ halaman1: { data: [], meta: meta({ alasanKosong: "profil-belum-siap" }) } });
    await tungguFeed();
    expect(
      await screen.findByText("Lengkapi profil untuk mendapat rekomendasi"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lengkapi profil" })).toHaveAttribute(
      "href",
      "/profil",
    );
  });

  it("tanpa kecocokan → penjelasan + tautan cari berisi provinsi profil", async () => {
    renderBeranda({ halaman1: { data: [], meta: meta({ alasanKosong: "tanpa-kecocokan" }) } });
    await tungguFeed();
    expect(await screen.findByText("Belum ada lowongan yang cocok")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Cari lowongan lain" })).toHaveAttribute(
        "href",
        "/lowongan?province=Jawa+Barat",
      );
    });
  });

  it("'Muat lebih banyak' menambah halaman lewat cursor", async () => {
    const user = userEvent.setup();
    renderBeranda({
      halaman1: { data: [item(1)], meta: meta({ nextCursor: "c2" }) },
      halaman2: { data: [item(2)], meta: meta({ nextCursor: null }) },
    });
    await tungguFeed();
    await user.click(await screen.findByRole("button", { name: "Muat lebih banyak" }));
    expect(await screen.findByRole("heading", { name: "Lowongan 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lowongan 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Muat lebih banyak" })).toBeNull();
  });
});
