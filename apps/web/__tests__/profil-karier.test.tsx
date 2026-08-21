// Bagian riwayat karier di halaman profil (PR-040) — AC 1, 2, dan 5.
//
// DIPISAH DARI `profil.test.tsx` karena yang diuji berbeda jenisnya: di sana
// keadaan satu formulir, di sini SIKLUS HIDUP baris — lahir, berubah, hilang —
// beserta pesan galat per kolomnya. Menggabungkan keduanya menghasilkan satu
// berkas yang gagalnya tidak menunjuk apa pun.
//
// KENAPA PESAN GALAT DIUJI DI SINI, BUKAN DI BAGIAN DASAR. Seluruh kolom bagian
// dasar opsional dan dibatasi `maxLength`, jadi tidak ada cara bagi pengguna
// memasukkan nilai yang ditolak skema — kolom yang tidak bisa salah tidak bisa
// membuktikan pesan galatnya muncul. Kolom karier bisa: judul yang wajib,
// tanggal yang harus berbentuk, tahun yang harus masuk akal.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import type { Education, Experience, SeekerProfile, Skill } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const PROFIL: SeekerProfile = {
  headline: null,
  summary: null,
  city: null,
  province: null,
  openToRemote: false,
  disclosureDefault: "ask_each_time",
  consentSensitiveAt: null,
  sensitive: null,
};

const PENGALAMAN: Experience = {
  id: "01912345-89ab-7def-8123-4567890abc01",
  title: "Analis Data",
  company: "PT Contoh",
  startDate: "2020-01-15",
  endDate: null,
  description: null,
};

interface Permintaan {
  path: string;
  method: string;
  body: unknown;
}

interface Isi {
  experiences?: Experience[];
  educations?: Education[];
  skills?: Skill[];
}

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

function klienPalsu(jejak: Permintaan[], isi: Isi): ApiClient {
  return {
    request: (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;

      jejak.push({ path, method, body: options?.body });

      if (path === "/me/profile") return Promise.resolve({ data: PROFIL }) as Promise<never>;

      const daftar = /^\/me\/(experiences|educations|skills)$/.exec(path);
      if (daftar !== null) {
        if (method === "GET") {
          const nama = daftar[1] as keyof Isi;
          return Promise.resolve({ data: isi[nama] ?? [] }) as Promise<never>;
        }
        return Promise.resolve({
          data: { id: "01912345-89ab-7def-8123-4567890abc99", ...(options?.body as object) },
        }) as Promise<never>;
      }

      if (/^\/me\/(experiences|educations|skills)\/[^/]+$/.test(path)) {
        if (method === "DELETE") return Promise.resolve(undefined) as Promise<never>;
        return Promise.resolve({
          data: { id: path.split("/").pop(), ...(options?.body as object) },
        }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderProfil(isi: Isi = {}) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/profil"] });

  const hasil = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienPalsu(jejak, isi)}
      a11yStore={createA11yStore({ storage: memori() })}
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, jejak };
}

async function tungguSiap(): Promise<void> {
  await screen.findByRole("heading", { name: "Profil karier saya", level: 1 }, { timeout: 5000 });
  await screen.findByRole("button", { name: "Tambah pengalaman kerja" }, { timeout: 5000 });
}

/** Formulir baris, dicari lewat nama aksesibelnya — halaman ini punya tiga daftar. */
function form(nama: string): HTMLElement {
  return screen.getByRole("form", { name: nama });
}

function permintaanKe(jejak: Permintaan[], path: string, method: string): Permintaan[] {
  return jejak.filter((j) => j.path === path && j.method === method);
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "keluar" });
});

describe("AC 1 — baris karier dapat ditambah, diubah, dihapus", () => {
  it("daftar kosong menyebutkan keadaannya, bukan diam saja", async () => {
    renderProfil();
    await tungguSiap();

    expect(
      await screen.findByText("Anda belum menambahkan pengalaman kerja."),
    ).toBeInTheDocument();
    expect(screen.getByText("Anda belum menambahkan riwayat pendidikan.")).toBeInTheDocument();
    expect(screen.getByText("Anda belum menambahkan keahlian.")).toBeInTheDocument();
  });

  it("menambah pengalaman mengirim POST berisi yang diketik", async () => {
    const { jejak } = renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pengalaman kerja" }));
    const formulir = form("Tambah pengalaman kerja");
    await userEvent.type(within(formulir).getByRole("textbox", { name: /Nama posisi/ }), "Kasir");
    await userEvent.type(
      within(formulir).getByRole("textbox", { name: /Nama perusahaan/ }),
      "Toko Maju",
    );
    await userEvent.click(within(formulir).getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      expect(permintaanKe(jejak, "/me/experiences", "POST")).toHaveLength(1);
    });
    expect(permintaanKe(jejak, "/me/experiences", "POST")[0]?.body).toMatchObject({
      title: "Kasir",
      company: "Toko Maju",
    });
  });

  it("kolom opsional yang dibiarkan kosong dikirim sebagai null, bukan string kosong", async () => {
    // `""` bukan nilai yang sah bagi `dateOnlySchema` — ia akan ditolak sebagai
    // "Tanggal harus ditulis YYYY-MM-DD" pada baris yang justru tidak mengisi
    // tanggal sama sekali.
    const { jejak } = renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pengalaman kerja" }));
    const formulir = form("Tambah pengalaman kerja");
    await userEvent.type(within(formulir).getByRole("textbox", { name: /Nama posisi/ }), "Kasir");
    await userEvent.click(within(formulir).getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      expect(permintaanKe(jejak, "/me/experiences", "POST")).toHaveLength(1);
    });
    expect(permintaanKe(jejak, "/me/experiences", "POST")[0]?.body).toMatchObject({
      startDate: null,
      endDate: null,
      company: null,
      description: null,
    });
  });

  it("mengubah baris yang ada mengirim PUT ke id-nya", async () => {
    const { jejak } = renderProfil({ experiences: [PENGALAMAN] });
    await tungguSiap();

    await userEvent.click(await screen.findByRole("button", { name: "Ubah Analis Data" }));
    const formulir = form("Ubah Analis Data");
    const judul = within(formulir).getByRole("textbox", { name: /Nama posisi/ });
    expect(judul).toHaveValue("Analis Data");

    await userEvent.clear(judul);
    await userEvent.type(judul, "Analis Data Senior");
    await userEvent.click(within(formulir).getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      expect(permintaanKe(jejak, `/me/experiences/${PENGALAMAN.id}`, "PUT")).toHaveLength(1);
    });
    expect(permintaanKe(jejak, `/me/experiences/${PENGALAMAN.id}`, "PUT")[0]?.body).toMatchObject({
      title: "Analis Data Senior",
    });
  });

  it("menghapus baris mengirim DELETE dan mengumumkannya", async () => {
    const { jejak } = renderProfil({ experiences: [PENGALAMAN] });
    await tungguSiap();

    await userEvent.click(await screen.findByRole("button", { name: "Hapus Analis Data" }));

    await waitFor(() => {
      expect(permintaanKe(jejak, `/me/experiences/${PENGALAMAN.id}`, "DELETE")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Analis Data sudah dihapus.")).toBeInTheDocument();
    });
  });

  it("tombol baris MENYEBUT barisnya, bukan 'Ubah' dan 'Hapus' telanjang", async () => {
    // Tanpa nama yang menyebut barisnya, screen reader membacakan "Hapus,
    // Hapus, Hapus" — dan yang terhapus menjadi baris yang salah.
    renderProfil({ experiences: [PENGALAMAN] });
    await tungguSiap();

    expect(await screen.findByRole("button", { name: "Hapus Analis Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ubah Analis Data" })).toBeInTheDocument();
  });

  it("membatalkan formulir tidak mengirim apa pun", async () => {
    const { jejak } = renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah keahlian" }));
    await userEvent.type(
      within(form("Tambah keahlian")).getByRole("textbox", { name: /Nama keahlian/ }),
      "Mengetik cepat",
    );
    await userEvent.click(within(form("Tambah keahlian")).getByRole("button", { name: "Batal" }));

    expect(permintaanKe(jejak, "/me/skills", "POST")).toHaveLength(0);
    expect(screen.queryByRole("form", { name: "Tambah keahlian" })).toBeNull();
  });
});

describe("AC 5 — pesan galat per kolom, bahasa sederhana", () => {
  it("judul kosong → pesan DI BAWAH kolomnya, dan tidak ada permintaan terkirim", async () => {
    const { jejak } = renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pengalaman kerja" }));
    await userEvent.click(
      within(form("Tambah pengalaman kerja")).getByRole("button", { name: "Simpan" }),
    );

    expect(await screen.findByText("Nama posisi tidak boleh kosong")).toBeInTheDocument();
    // Ditolak SEBELUM dikirim: permintaan yang sudah pasti ditolak server tidak
    // perlu menunggu jaringan untuk memberi tahu pengguna apa yang salah.
    expect(permintaanKe(jejak, "/me/experiences", "POST")).toHaveLength(0);
  });

  it("pesan galat tersambung ke kolomnya lewat aria, bukan sekadar berdiri dekat", async () => {
    renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pengalaman kerja" }));
    await userEvent.click(
      within(form("Tambah pengalaman kerja")).getByRole("button", { name: "Simpan" }),
    );

    const kolom = await screen.findByRole("textbox", { name: /Nama posisi/ });
    await waitFor(() => {
      expect(kolom).toHaveAttribute("aria-invalid", "true");
    });
    const idGalat = kolom.getAttribute("aria-describedby")?.split(" ") ?? [];
    const teks = idGalat
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(teks).toContain("Nama posisi tidak boleh kosong");
  });

  it("tanggal salah bentuk → pesannya di kolom tanggal, bukan di kolom judul", async () => {
    renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pengalaman kerja" }));
    const formulir = form("Tambah pengalaman kerja");
    await userEvent.type(within(formulir).getByRole("textbox", { name: /Nama posisi/ }), "Kasir");
    await userEvent.type(
      within(formulir).getByRole("textbox", { name: /Mulai bekerja/ }),
      "15 Januari 2020",
    );
    await userEvent.click(within(formulir).getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Tanggal harus ditulis YYYY-MM-DD")).toBeInTheDocument();
    expect(screen.queryByText("Nama posisi tidak boleh kosong")).toBeNull();
  });

  it("tanggal yang tidak ada di kalender ikut ditolak", async () => {
    // `2026-02-31` LOLOS pemeriksaan bentuk dan tetap salah. Skema memeriksanya
    // dengan round-trip (PR-038); test ini yang memastikan pesan itu benar-benar
    // sampai ke layar.
    renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pengalaman kerja" }));
    const formulir = form("Tambah pengalaman kerja");
    await userEvent.type(within(formulir).getByRole("textbox", { name: /Nama posisi/ }), "Kasir");
    await userEvent.type(
      within(formulir).getByRole("textbox", { name: /Mulai bekerja/ }),
      "2026-02-31",
    );
    await userEvent.click(within(formulir).getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Tanggal itu tidak ada di kalender")).toBeInTheDocument();
  });

  it("tahun lulus di luar batas → pesannya menyebut batasnya", async () => {
    renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pendidikan" }));
    const formulir = form("Tambah pendidikan");
    await userEvent.type(
      within(formulir).getByRole("textbox", { name: /Nama sekolah atau kampus/ }),
      "SMA Negeri 1",
    );
    await userEvent.type(within(formulir).getByRole("textbox", { name: /Tahun lulus/ }), "1800");
    await userEvent.click(within(formulir).getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Tahun minimal 1950")).toBeInTheDocument();
  });

  it("memperbaiki isian menghapus pesan galatnya", async () => {
    // Pesan yang bertahan setelah kolomnya diperbaiki membuat pengguna mencari
    // kesalahan yang sudah tidak ada.
    renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah keahlian" }));
    await userEvent.click(within(form("Tambah keahlian")).getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Nama keahlian tidak boleh kosong")).toBeInTheDocument();

    await userEvent.type(
      within(form("Tambah keahlian")).getByRole("textbox", { name: /Nama keahlian/ }),
      "Mengetik cepat",
    );
    await userEvent.click(within(form("Tambah keahlian")).getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      expect(screen.queryByText("Nama keahlian tidak boleh kosong")).toBeNull();
    });
  });
});

describe("AC 2 — satu daftar gagal tidak menghanguskan daftar lain", () => {
  it("galat di pengalaman tidak muncul di daftar keahlian", async () => {
    renderProfil();
    await tungguSiap();

    await userEvent.click(screen.getByRole("button", { name: "Tambah pengalaman kerja" }));
    await userEvent.click(
      within(form("Tambah pengalaman kerja")).getByRole("button", { name: "Simpan" }),
    );
    await screen.findByText("Nama posisi tidak boleh kosong");

    // Daftar keahlian masih menawarkan tombol tambahnya, tanpa satu pun galat.
    const keahlian = screen.getByRole("region", { name: "Keahlian" });
    expect(within(keahlian).queryByRole("alert")).toBeNull();
    expect(within(keahlian).getByRole("button", { name: "Tambah keahlian" })).toBeInTheDocument();
  });
});
