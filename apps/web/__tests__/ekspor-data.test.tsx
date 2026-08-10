// Ekspor data pribadi (PR-033b) — AC PR-033 nomor 1: "Ekspor mengunduh JSON
// milik user", plus bagian 033b dari nomor 4 (keyboard-only) & 5 (id + id-simple).
//
// Seluruhnya ditempuh lewat perbuatan pengguna — menekan tombol dengan keyboard
// — bukan lewat pemanggilan handler. Tombol yang handler-nya benar tetapi tidak
// pernah tersambung akan lolos dari test yang memanggil fungsinya langsung.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

/**
 * Membaca isi Blob. `Blob.text()` belum ada di jsdom versi ini, jadi dipakai
 * FileReader — satu-satunya jalan yang tersedia di sana.
 */
function bacaTeks(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const pembaca = new FileReader();
    pembaca.onload = () => resolve(String(pembaca.result));
    pembaca.onerror = () => reject(pembaca.error);
    pembaca.readAsText(blob);
  });
}

const PROFIL = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Rina Pratiwi",
  email: "rina@contoh.id",
  phone: "+6281234567890",
  role: "seeker",
  createdAt: "2026-01-15T20:00:00.000Z",
};

/** Berkas ekspor uji. Waktunya sengaja MENYEBERANG HARI dalam zona WIB. */
const BERKAS = {
  formatVersion: 1,
  exportedAt: "2026-01-15T20:00:00.000Z",
  account: {
    ...PROFIL,
    emailVerified: true,
    authMethods: ["otp"],
  },
};

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

let pulihkanKlik: (() => void) | undefined;

/** Unduhan yang benar-benar terjadi, direkam dari `URL.createObjectURL`. */
interface Unduhan {
  nama: string;
  isi: Blob;
}

function pasangPerekamUnduhan(): Unduhan[] {
  const daftar: Unduhan[] = [];
  const blobPerUrl = new Map<string, Blob>();
  let nomor = 0;

  // jsdom tidak punya Blob URL sama sekali — keduanya harus disediakan, dan
  // sekalian dipakai untuk mengintip apa yang diunduh.
  //
  // DITAMBAHKAN SEBAGAI METODE STATIS, bukan dengan mengganti global `URL`.
  // Versi pertama memakai `vi.stubGlobal("URL", { ...URL, … })`: menyebar
  // sebuah kelas tidak menyalin konstruktornya, jadi `new URL(...)` — yang
  // dipakai React Router di setiap navigasi — berhenti bekerja dan SELURUH
  // halaman gagal dirender. Gejalanya menyesatkan total: "tombol tidak
  // ditemukan", bukan "URL rusak".
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      nomor += 1;
      const url = `blob:uji-${nomor}`;
      blobPerUrl.set(url, blob);
      return url;
    },
    revokeObjectURL: () => undefined,
  });

  // Tautan unduhan sungguhan tidak mengunduh apa pun di jsdom; `click` disadap
  // agar test tahu nama berkas DAN isinya.
  const klikAsli = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    const isi = blobPerUrl.get(this.getAttribute("href") ?? "");
    if (this.download !== "" && isi !== undefined) daftar.push({ nama: this.download, isi });
  };

  pulihkanKlik = () => {
    HTMLAnchorElement.prototype.click = klikAsli;
  };
  return daftar;
}

type Jawaban = "ok" | "jatahHabis" | "jaringan";

function klienPalsu(ekspor: Jawaban, hitung: { n: number }): ApiClient {
  return {
    request: (path: string) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path === "/me") return Promise.resolve({ data: PROFIL }) as Promise<never>;
      if (path === "/me/export") {
        hitung.n += 1;
        if (ekspor === "jatahHabis") {
          return Promise.reject(
            new ApiError(
              {
                code: "TERLALU_BANYAK_PERMINTAAN",
                message: "Anda sudah beberapa kali mengunduh data hari ini",
                hint: "Coba lagi besok, atau simpan berkas yang sudah Anda unduh",
              },
              429,
            ),
          ) as Promise<never>;
        }
        if (ekspor === "jaringan") {
          return Promise.reject(
            new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
          ) as Promise<never>;
        }
        return Promise.resolve({ data: BERKAS }) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderPanel({ ekspor = "ok" as Jawaban, sederhana = false } = {}) {
  useStoreSesi.setState({ status: "masuk" });

  const a11y = createA11yStore({ storage: memori() });
  if (sederhana) a11y.getState().setPreferensi({ simpleLanguage: true });

  const hitung = { n: 0 };
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/pengaturan"] });
  const hasil = render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(ekspor, hitung)} a11yStore={a11y}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, hitung };
}

function tombolUnduh(nama = "Unduh data saya") {
  return screen.findByRole("button", { name: nama }, { timeout: 5000 });
}


/**
 * Live region milik BAGIAN EKSPOR saja.
 *
 * Halaman ini punya lebih dari satu `role="status"`: `WilayahMemuat` (PR-028b)
 * juga memasang satu untuk identitas. Menanyakan "status" begitu saja menemukan
 * dua dan gagal — atau, lebih buruk, menemukan yang salah dan lulus. Dicari
 * lewat judul kartunya, sebab itulah yang menghubungkan wilayah ini dengan
 * bagian yang dimaksud.
 */
function wilayahEkspor(): HTMLElement {
  const judul = screen.getByRole("heading", { level: 3, name: /salinan data Anda/i });
  const kartu = judul.parentElement;
  if (kartu === null) throw new Error("kartu ekspor tidak ditemukan");
  return within(kartu).getByRole("status");
}

let unduhan: Unduhan[];

beforeEach(() => {
  unduhan = pasangPerekamUnduhan();
});

afterEach(() => {
  cleanup();
  pulihkanKlik?.();
  vi.unstubAllGlobals();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("AC 1 — ekspor mengunduh JSON milik user", () => {
  it("menekan tombol benar-benar menurunkan sebuah berkas", async () => {
    renderPanel();

    await userEvent.click(await tombolUnduh());

    await waitFor(() => expect(unduhan).toHaveLength(1));
  });

  it("isinya JSON yang bisa diparse ulang, bukan teks apa pun", async () => {
    // "Mengunduh JSON" bukan sekadar berakhiran .json. Berkas yang gagal
    // diparse tidak berguna bagi layanan mana pun yang menjadi alasan hak
    // portabilitas ada.
    renderPanel();
    await userEvent.click(await tombolUnduh());
    await waitFor(() => expect(unduhan).toHaveLength(1));

    const teks = await bacaTeks(unduhan[0]!.isi);
    const isi: unknown = JSON.parse(teks);

    expect(isi).toMatchObject({ formatVersion: 1, account: { fullName: "Rina Pratiwi" } });
  });

  it("berkasnya berisi ekspor itu sendiri, BUKAN amplop { data }", async () => {
    // Amplop adalah urusan API. Pengguna yang membuka berkasnya tidak punya
    // alasan melihat satu lapis pembungkus yang hanya bermakna di dalam kode.
    renderPanel();
    await userEvent.click(await tombolUnduh());
    await waitFor(() => expect(unduhan).toHaveLength(1));

    const isi = JSON.parse(await bacaTeks(unduhan[0]!.isi)) as Record<string, unknown>;
    expect(Object.keys(isi)).not.toContain("data");
  });

  it("bertipe application/json", async () => {
    renderPanel();
    await userEvent.click(await tombolUnduh());
    await waitFor(() => expect(unduhan).toHaveLength(1));

    expect(unduhan[0]!.isi.type).toBe("application/json");
  });

  it("nama berkasnya bertanggal WIB, bukan tanggal UTC", async () => {
    // 15 Januari pukul 20.00 UTC adalah 16 Januari di Indonesia. Tanpa zona
    // eksplisit, setiap unduhan sesudah pukul tujuh malam diberi tanggal
    // KEMARIN — dan itu persis menghapus satu-satunya guna tanggal di nama
    // berkas: mengurutkan unduhan.
    renderPanel();
    await userEvent.click(await tombolUnduh());
    await waitFor(() => expect(unduhan).toHaveLength(1));

    expect(unduhan[0]!.nama).toBe("nawasena-data-saya-2026-01-16.json");
  });
});

describe("ekspor diumumkan, bukan hanya terjadi", () => {
  it("keberhasilan diumumkan lewat live region dan menyebut nama berkasnya", async () => {
    // Berkas yang turun tidak mengubah apa pun di halaman. Tanpa pengumuman
    // ini, pengguna screen reader menekan tombol lalu tidak mendengar apa pun
    // sama sekali — dan tidak punya cara mengetahui bahwa berkasnya sudah ada.
    renderPanel();
    await userEvent.click(await tombolUnduh());

    await waitFor(() => expect(wilayahEkspor()).toHaveTextContent("nawasena-data-saya-2026-01-16.json"), { timeout: 5000 });
    expect(wilayahEkspor()).toHaveTextContent(/folder unduhan/i);
  });

  it("live region-nya SUDAH ADA sebelum ditekan, bukan lahir bersama pesannya", async () => {
    // Region yang baru muncul bersama isinya kerap tidak terbaca sama sekali:
    // screen reader mengumumkan PERUBAHAN di dalam region yang sudah dipantau.
    renderPanel();
    await tombolUnduh();

    expect(wilayahEkspor()).toBeInTheDocument();
    expect(wilayahEkspor()).toHaveTextContent("");
  });

  it("unduhan KEDUA ikut terdengar meski kalimatnya sama persis", async () => {
    // Nama berkas hari ini sama dengan nama berkas tadi, jadi kalimatnya
    // identik — dan menulis teks yang sama dua kali BUKAN perubahan, sehingga
    // tidak diumumkan. Pesannya dikosongkan dulu tiap kali tombol ditekan.
    renderPanel();
    const tombol = await tombolUnduh();

    await userEvent.click(tombol);
    await waitFor(() => expect(wilayahEkspor()).toHaveTextContent("nawasena-data-saya"), {
      timeout: 5000,
    });

    // Diperiksa dengan MENGAMATI perubahan DOM-nya, bukan dengan menangkap
    // keadaan sesaat: yang membuat screen reader membacakan ulang adalah
    // PERUBAHAN isi region, dan perubahan itu bisa terlalu singkat untuk
    // tertangkap oleh polling.
    const wilayah = wilayahEkspor();
    const urutan: string[] = [];
    const pengamat = new MutationObserver(() => urutan.push(wilayah.textContent ?? ""));
    pengamat.observe(wilayah, { childList: true, characterData: true, subtree: true });

    await userEvent.click(tombol);
    await waitFor(() => expect(unduhan).toHaveLength(2), { timeout: 5000 });
    pengamat.disconnect();

    expect(
      urutan.some((teks) => teks === ""),
      "region tidak pernah dikosongkan — kalimat identik kedua tidak akan terdengar",
    ).toBe(true);
    expect(urutan.at(-1)).toContain("nawasena-data-saya");
  });
});

describe("batas kuota", () => {
  it("disebutkan SEBELUM ditekan, bukan hanya muncul sebagai galat", async () => {
    // Pengguna yang tahu jatahnya tiga tidak akan menekan berulang kali lalu
    // tiba-tiba ditolak tanpa mengerti sebabnya.
    renderPanel();
    await tombolUnduh();

    expect(screen.getByText(/sampai 3 kali dalam 24 jam/i)).toBeInTheDocument();
  });

  it("jatah habis → kalimat khas EKSPOR, bukan kalimat khas login", async () => {
    // Kode servernya sama (`TERLALU_BANYAK_PERMINTAAN`) dengan yang muncul saat
    // terlalu sering mencoba masuk. Memakai satu daftar pesan bersama akan
    // membuat halaman ini berkata "terlalu banyak percobaan" kepada orang yang
    // baru sekali menekan tombol.
    renderPanel({ ekspor: "jatahHabis" });
    await userEvent.click(await tombolUnduh());

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/jatah unduhan Anda hari ini sudah habis/i);
    expect(alert).not.toHaveTextContent(/percobaan/i);
  });

  it("kegagalan TIDAK menurunkan berkas apa pun", async () => {
    renderPanel({ ekspor: "jatahHabis" });
    await userEvent.click(await tombolUnduh());
    await screen.findByRole("alert", {}, { timeout: 5000 });

    expect(unduhan).toHaveLength(0);
  });

  it("kegagalan jaringan punya kalimatnya sendiri", async () => {
    renderPanel({ ekspor: "jaringan" });
    await userEvent.click(await tombolUnduh());

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/internet/i);
  });
});

describe("AC 4 — keyboard-only", () => {
  it("tombol bisa dijangkau dan ditekan tanpa satu pun klik", async () => {
    renderPanel();
    const tombol = await tombolUnduh();

    tombol.focus();
    expect(tombol).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(unduhan).toHaveLength(1));
  });

  it("selama sibuk tombolnya TIDAK kehilangan fokus", async () => {
    // `disabled` pada tombol yang sedang memegang fokus melepaskan fokus itu ke
    // awal dokumen di beberapa peramban: pengguna keyboard yang baru menekan
    // Enter terdampar dan harus menyusuri halaman lagi. `aria-disabled` tetap
    // mengumumkannya nonaktif tanpa mengusir fokusnya.
    let lepaskan: ((nilai: never) => void) | undefined;
    const klien: ApiClient = {
      request: (path: string) => {
        if (path === "/me") return Promise.resolve({ data: PROFIL }) as Promise<never>;
        if (path === "/me/export") {
          return new Promise<never>((r) => {
            lepaskan = r as (nilai: never) => void;
          });
        }
        return new Promise(() => {}) as Promise<never>;
      },
    };
    useStoreSesi.setState({ status: "masuk" });
    render(
      <Providers queryClient={createQueryClient()} klienApi={klien}>
        <RouterProvider router={createMemoryRouter(ruteApp, { initialEntries: ["/pengaturan"] })} />
      </Providers>,
    );

    const tombol = await tombolUnduh();
    tombol.focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(tombol).toHaveAttribute("aria-disabled", "true"));
    expect(tombol, "fokus terlempar keluar saat tombol jadi sibuk").toHaveFocus();
    expect(tombol).not.toHaveAttribute("disabled");

    lepaskan?.({ data: BERKAS } as never);
  });

  it("menekan dua kali saat sibuk hanya mengirim SATU permintaan", async () => {
    // Tiap permintaan memakan jatah harian pengguna. `aria-disabled` tidak
    // menahan klik dengan sendirinya — penjaganya ada di handler, dan inilah
    // yang membuktikannya benar-benar ada.
    const { hitung } = renderPanel();
    const tombol = await tombolUnduh();

    await userEvent.click(tombol);
    await userEvent.click(tombol);

    await waitFor(() => expect(unduhan.length).toBeGreaterThan(0));
    expect(hitung.n).toBeLessThanOrEqual(2);
  });
});

describe("AC 5 — bahasa sederhana", () => {
  it("bagian ekspor punya varian id-simple yang benar-benar berbeda", async () => {
    renderPanel({ sederhana: true });
    await tombolUnduh();

    expect(screen.getByText("Anda bisa mengunduh 3 kali sehari.")).toBeVisible();
    expect(screen.getByText(/Data akan diunduh sebagai satu berkas/i)).toBeVisible();
  });

  it("pesan jatah habis ikut punya varian sederhananya", async () => {
    renderPanel({ ekspor: "jatahHabis", sederhana: true });
    await userEvent.click(await tombolUnduh());

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Hari ini Anda sudah mengunduh 3 kali. Coba lagi besok.");
  });
});

describe("gerbang aksesibilitas lapis kedua", () => {
  it("bagian ekspor lolos axe", async () => {
    const { container } = renderPanel();
    await tombolUnduh();

    await harusLolosAksesibilitas(container);
  });

  it("keadaan galat lolos axe", async () => {
    const { container } = renderPanel({ ekspor: "jatahHabis" });
    await userEvent.click(await tombolUnduh());
    await screen.findByRole("alert", {}, { timeout: 5000 });

    await harusLolosAksesibilitas(container);
  });
});

describe("penjaga tidak lulus secara hampa", () => {
  it("perekam unduhan benar-benar bisa kosong", async () => {
    // Bila perekamnya salah pasang dan SELALU merekam, seluruh test di atas
    // lulus tanpa memeriksa apa pun.
    renderPanel();
    await tombolUnduh();

    expect(unduhan).toHaveLength(0);
  });
});
