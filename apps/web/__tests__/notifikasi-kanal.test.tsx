// Panel kanal notifikasi (PR-049b) — AC-3 di sisi layar.
//
// DIRENDER LEWAT `ruteApp` PRODUKSI, bukan dengan merender komponennya
// langsung. Alasannya sama dengan `aksesibilitas-panel.test.tsx`: panel yang
// sempurna tetapi tidak pernah tersambung ke alamatnya tidak menghasilkan apa
// pun bagi siapa pun, dan test yang merender komponennya sendiri tidak akan
// pernah melihat kelalaian itu.
//
// YANG PALING PENTING DI SINI, dan yang membedakannya dari panel aksesibilitas:
// panel ini TIDAK mengubah apa pun yang terlihat. Akibat pilihannya baru muncul
// berhari-hari kemudian di kotak masuk seseorang, jadi satu-satunya umpan balik
// yang ada adalah kalimat status dan posisi sakelarnya sendiri. Sakelar yang
// bergerak duluan lalu kembali saat gagal akan membuat pengguna mengira ia
// sudah berhenti menerima email padahal belum.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

interface Jejak {
  method: string;
  body: unknown;
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

interface OpsiKlien {
  awal?: { email: boolean | null; push: boolean | null };
  gagalTulis?: boolean;
  gagalBaca?: boolean;
}

function klienPalsu(jejak: Jejak[], opsi: OpsiKlien): ApiClient {
  const awal = opsi.awal ?? { email: null, push: null };
  return {
    request: (path: string, o?: { method?: string; body?: unknown }) => {
      // Pemulihan sesi dibiarkan menggantung: statusnya dipasang test sendiri.
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      // `GET /me/accessibility` sengaja menggantung — penarikan preferensi
      // aksesibilitas punya berkasnya sendiri, dan membiarkannya menjawab di
      // sini berarti store berubah dari dua arah sekaligus.
      if (path === "/me/accessibility") return new Promise(() => {}) as Promise<never>;

      if (path === "/me/notification-prefs") {
        const method = o?.method ?? "GET";
        if (method === "GET") {
          if (opsi.gagalBaca === true) {
            return Promise.reject(
              new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
            ) as Promise<never>;
          }
          return Promise.resolve({ data: awal }) as Promise<never>;
        }

        jejak.push({ method, body: o?.body });
        if (opsi.gagalTulis === true) {
          return Promise.reject(
            new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
          ) as Promise<never>;
        }
        return Promise.resolve({
          data: { ...awal, ...(o?.body as object) },
        }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderPanel(opsi: OpsiKlien = {}) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Jejak[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/pengaturan/notifikasi"] });
  const hasil = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienPalsu(jejak, opsi)}
      a11yStore={createA11yStore({ storage: memori() })}
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, jejak };
}

/** Panelnya dimuat lazy; tenggat dilonggarkan seperti di `pengaturan.test.tsx`. */
async function tungguPanel() {
  await screen.findByRole("heading", { level: 2, name: "Notifikasi" }, { timeout: 5000 });
}

const saklar = (nama: string) => screen.getByRole("checkbox", { name: nama });

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("bawaan tiap kanal terbaca di layar", () => {
  it("belum pernah memilih → email MATI, push HIDUP", async () => {
    // Bawaan dihitung `kanalBerlaku()` dari @nawasena/schemas — fungsi yang
    // SAMA dengan yang dipakai server sebelum mengantre. Dua salinan aturan ini
    // berarti tombol yang menyala sementara kabarnya tidak dikirim.
    renderPanel();
    await tungguPanel();

    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).not.toBeChecked();
    });
    expect(saklar("Kirim ke layar ponsel saya")).toBeChecked();
  });

  it("pilihan yang tersimpan menang atas bawaan", async () => {
    renderPanel({ awal: { email: true, push: false } });
    await tungguPanel();

    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).toBeChecked();
    });
    expect(saklar("Kirim ke layar ponsel saya")).not.toBeChecked();
  });
});

describe("menyalakan dan mematikan kanal", () => {
  it("menekan sakelar mengirim PUT berisi kanal ITU saja", async () => {
    // Badan yang membawa kanal lain akan menimpa pilihan yang tidak disentuh
    // pengguna — dan tidak ada satu pun gejala di layar bila itu terjadi.
    const { jejak } = renderPanel();
    await tungguPanel();
    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).not.toBeChecked();
    });

    await userEvent.click(saklar("Kirim ke email saya"));

    await waitFor(() => {
      expect(jejak).toEqual([{ method: "PUT", body: { email: true } }]);
    });
  });

  it("sakelarnya mengikuti jawaban server, bukan klik", async () => {
    const { jejak } = renderPanel({ awal: { email: true, push: null } });
    await tungguPanel();
    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).toBeChecked();
    });

    await userEvent.click(saklar("Kirim ke email saya"));

    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).not.toBeChecked();
    });
    expect(jejak).toEqual([{ method: "PUT", body: { email: false } }]);
  });

  it("keberhasilan DIUMUMKAN, bukan hanya terjadi", async () => {
    // Panel ini tidak mengubah apa pun yang terlihat selain sakelarnya sendiri,
    // jadi kalimat ini adalah satu-satunya konfirmasi bagi pengguna pembaca
    // layar bahwa pilihannya benar-benar sampai ke akun.
    renderPanel();
    await tungguPanel();
    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).not.toBeChecked();
    });

    await userEvent.click(saklar("Kirim ke email saya"));

    await screen.findByText("Pilihan Anda sudah tersimpan ke akun.");
  });
});

describe("kegagalan dikatakan apa adanya", () => {
  it("PUT gagal → sakelar TIDAK berubah, dan pengguna diberi tahu", async () => {
    // Berbeda dari panel aksesibilitas: di sana pilihan pengguna tetap berlaku
    // di perangkatnya meski gagal terkirim. Kanal notifikasi hanya hidup di
    // akun, jadi gagal berarti benar-benar belum berubah.
    renderPanel({ gagalTulis: true });
    await tungguPanel();
    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).not.toBeChecked();
    });

    await userEvent.click(saklar("Kirim ke email saya"));

    const peringatan = await screen.findByRole("alert");
    expect(peringatan).toHaveTextContent("Pilihan Anda belum berubah.");
    expect(saklar("Kirim ke email saya")).not.toBeChecked();
  });

  it("GET gagal → sakelar menampilkan bawaan, dan itu DIKATAKAN", async () => {
    // Kesalahpahaman yang paling mahal di halaman ini: pengguna melihat sakelar
    // bawaan, mengira itu pilihannya, lalu tidak mengubah apa pun.
    renderPanel({ gagalBaca: true });
    await tungguPanel();

    // Tenggat dilonggarkan karena `queryClient` produksi MENCOBA ULANG dua kali
    // dengan backoff 1 dtk + 2 dtk (SDD §4.1). Itu perilaku yang benar dan
    // sengaja tidak dimatikan di sini: test yang mematikan retry akan lulus
    // atas klien yang bukan klien produksi.
    const peringatan = await screen.findByRole("alert", {}, { timeout: 8000 });
    expect(peringatan).toHaveTextContent("bukan pilihan Anda");
  });
});

describe("aksesibilitas panel", () => {
  it("lolos axe", async () => {
    const { container } = renderPanel();
    await tungguPanel();
    await waitFor(() => {
      expect(saklar("Kirim ke email saya")).not.toBeChecked();
    });

    await harusLolosAksesibilitas(container);
  });

  it("kedua sakelar punya nama yang bisa dibacakan, bukan hanya terlihat", async () => {
    renderPanel();
    await tungguPanel();

    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });
    expect(saklar("Kirim ke email saya")).toBeInTheDocument();
    expect(saklar("Kirim ke layar ponsel saya")).toBeInTheDocument();
  });
});
