// Kerangka pengaturan (PR-033a) — Scope PR-033 "Settings layout + navigasi" dan
// "Slot panel aksesibilitas", plus bagian 033a dari AC 4 (keyboard-only) & 5
// (id + id-simple).
//
// Dijalankan lewat `ruteApp` PRODUKSI, bukan daftar route yang dirakit di test.
// Daftar kedua bebas menyimpang: ia bisa lupa `Terlindungi`, lupa route indeks,
// atau memakai alamat yang tidak pernah ada — dan test-nya tetap hijau sambil
// memeriksa aplikasi yang tidak pernah dikirim ke siapa pun.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi, type StatusSesi } from "../src/shared/sesi/store.js";

/** Bentuknya mengikuti `meSchema` (PR-020) — termasuk field yang boleh null. */
interface ProfilUji {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  createdAt: string;
}

const PROFIL: ProfilUji = {
  id: "01912345-89ab-7def-8123-456789abcdef",
  fullName: "Rina Pratiwi",
  email: "rina@contoh.id",
  phone: "+6281234567890",
  role: "seeker",
  createdAt: "2026-01-15T20:00:00.000Z",
};

interface OpsiRender {
  jalur?: string;
  status?: StatusSesi;
  /** Jawaban `GET /me`; `"gagal"` membuat permintaannya ditolak. */
  me?: Partial<ProfilUji> | "gagal";
  /**
   * Mode bahasa sederhana dinyalakan lewat PREFERENSI, bukan lewat
   * `modeBahasaAwal`. Sejak PR-026c prop itu hanya nilai sementara: begitu
   * store preferensi terbaca, `SambungkanBahasa` mengambil alih dan
   * mengembalikannya ke `id`. Test yang memakai prop itu akan lulus hari ini
   * dan diam-diam berhenti memeriksa apa pun.
   */
  sederhana?: boolean;
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

/**
 * Klien yang HANYA menjawab jalur yang dipakai halaman ini.
 *
 * `/auth/refresh` sengaja tidak pernah dijawab: pemulihan sesi berjalan sejak
 * `Providers` dipasang (PR-030a), dan membiarkannya menggantung membuat status
 * sesi sepenuhnya ditentukan test — bukan oleh balapan antara pemulihan dan
 * render pertama.
 */
function klienPalsu(me: OpsiRender["me"], hitung: { n: number }): ApiClient {
  return {
    request: (path: string) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path === "/me") {
        hitung.n += 1;
        return me === "gagal"
          ? (Promise.reject(new Error("gagal")) as Promise<never>)
          : (Promise.resolve({ data: { ...PROFIL, ...me } }) as Promise<never>);
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderPengaturan(opsi: OpsiRender = {}) {
  const { jalur = "/pengaturan", status = "masuk", me = {}, sederhana = false } = opsi;
  useStoreSesi.setState({ status });

  const a11y = createA11yStore({ storage: memori() });
  if (sederhana) a11y.getState().setPreferensi({ simpleLanguage: true });

  const hitung = { n: 0 };
  const router = createMemoryRouter(ruteApp, { initialEntries: [jalur] });
  const hasil = render(
    <Providers queryClient={createQueryClient()} klienApi={klienPalsu(me, hitung)} a11yStore={a11y}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, router, hitung };
}

/**
 * Route dimuat lazy, dan chunk-nya bisa tiba setelah tenggat bawaan 1 detik
 * saat seluruh berkas test berjalan berbarengan. Tenggatnya dilonggarkan di
 * sini, bukan di seluruh suite: yang lambat adalah pemuatan modul, bukan
 * aplikasinya.
 */
function tungguJudul(nama: string | RegExp) {
  return screen.findByRole("heading", { level: 2, name: nama }, { timeout: 5000 });
}

/**
 * Menunggu DATANYA, bukan hanya judulnya.
 *
 * Judul panel berada DI LUAR `WilayahMemuat`, jadi ia muncul sementara isinya
 * masih kerangka. Menanyakan isi sesudah judul saja berarti membaca halaman
 * pada saat yang salah — dan test yang memeriksanya akan gagal karena
 * waktunya, bukan karena halamannya.
 */
async function tungguAkunTerisi() {
  await tungguJudul(/Akun/);
  await screen.findAllByRole("definition", {}, { timeout: 5000 });
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
});

describe("penjagaan route", () => {
  it("tanpa sesi, isi pengaturan TIDAK pernah terlihat", async () => {
    // Route terlindungi PERTAMA di aplikasi ini. `Terlindungi` sudah teruji
    // sendiri sejak PR-030a, tetapi guard yang tidak dipasang di route mana pun
    // belum pernah membuktikan diri di jalur nyata — dan lupa memasangnya tidak
    // menimbulkan gejala apa pun sampai seseorang membuka alamatnya tanpa sesi.
    const { router } = renderPengaturan({ status: "keluar" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"), { timeout: 5000 });
    expect(screen.queryByRole("heading", { name: "Pengaturan" })).toBeNull();
  });

  it("tujuan awal ikut terbawa, sehingga pengguna kembali ke sini setelah masuk", async () => {
    const { router } = renderPengaturan({ jalur: "/pengaturan/aksesibilitas", status: "keluar" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"), { timeout: 5000 });
    expect(router.state.location.search).toBe("?tujuan=%2Fpengaturan%2Faksesibilitas");
  });

  it("penjagaan berlaku untuk SETIAP panel, bukan hanya indeksnya", async () => {
    // Penjaganya dipasang di komponen induk justru supaya panel yang lahir
    // kelak ikut terjaga tanpa perlu diingat. Diuji atas panel yang BUKAN
    // indeks: di sanalah kelalaian seperti itu akan muncul.
    const { router } = renderPengaturan({ jalur: "/pengaturan/aksesibilitas", status: "keluar" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/masuk"), { timeout: 5000 });
    expect(screen.queryByRole("heading", { name: "Aksesibilitas" })).toBeNull();
  });
});

describe("kerangka & navigasi", () => {
  it("judul halaman tingkat satu, dan panelnya tingkat dua", async () => {
    renderPengaturan();
    await tungguJudul("Akun & Data Saya");

    // Kerangka memiliki <h1>; panel bersarang di bawahnya sebagai <h2>. Urutan
    // tingkat inilah peta halaman bagi pengguna screen reader — tingkat yang
    // melompat membuat peta itu berbohong.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pengaturan");
  });

  it("navigasi punya NAMA, bukan sekadar landmark 'navigation'", async () => {
    renderPengaturan();
    await tungguJudul("Akun & Data Saya");

    const nav = screen.getByRole("navigation", { name: "Bagian pengaturan" });
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
  });

  it("panel yang sedang dibuka ditandai TEPAT SATU aria-current", async () => {
    // Tanpa `end` pada tautan indeks, "/pengaturan" tampak aktif di SETIAP
    // panel — karena tiap alamat panel diawali "/pengaturan" — dan pengguna
    // screen reader menerima dua jawaban berbeda atas "saya di mana".
    renderPengaturan({ jalur: "/pengaturan/aksesibilitas" });
    await tungguJudul("Aksesibilitas");

    const aktif = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(aktif).toHaveLength(1);
    expect(aktif[0]).toHaveTextContent("Aksesibilitas");
  });

  it("berpindah panel bisa dilakukan sepenuhnya dengan keyboard", async () => {
    // AC PR-033 nomor 4. Ditempuh sebagai PERBUATAN — Tab lalu Enter — bukan
    // dengan memeriksa href: tautan yang benar tetapi tertutup elemen lain,
    // atau yang dilewati urutan fokus, punya href yang tampak baik-baik saja.
    const { router } = renderPengaturan();
    await tungguJudul("Akun & Data Saya");

    const tautan = screen.getByRole("link", { name: "Aksesibilitas" });
    tautan.focus();
    expect(tautan).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(router.state.location.pathname).toBe("/pengaturan/aksesibilitas"), {
      timeout: 5000,
    });
    expect(await tungguJudul("Aksesibilitas")).toBeInTheDocument();
  });

  it("alamat indeks BERISI, bukan mengalihkan ke alamat lain", async () => {
    // Indeks yang mengalihkan membuat alamat yang dibagikan orang selalu
    // berakhir di alamat lain, dan tombol kembali sesudahnya terasa rusak.
    const { router } = renderPengaturan();
    await tungguJudul("Akun & Data Saya");

    expect(router.state.location.pathname).toBe("/pengaturan");
  });
});

describe("panel akun — data yang kami simpan", () => {
  it("menampilkan identitas dari /me sebagai pasangan label→nilai", async () => {
    renderPengaturan();
    await tungguAkunTerisi();

    // `<dl>`: hubungan label→nilai adalah seluruh isi bagian ini. Diperiksa
    // lewat istilah/definisinya, bukan lewat teks yang kebetulan muncul.
    const istilah = screen.getAllByRole("term").map((n) => n.textContent);
    expect(istilah).toEqual(["Nama", "Email", "Nomor HP", "Bergabung sejak"]);

    expect(screen.getByText("Rina Pratiwi")).toBeInTheDocument();
    expect(screen.getByText("rina@contoh.id")).toBeInTheDocument();
    expect(screen.getByText("+6281234567890")).toBeInTheDocument();
  });

  it("tanggal bergabung ditulis dalam zona WIB, bukan zona mesin", async () => {
    // Waktu ujinya sengaja MENYEBERANG HARI: 15 Januari pukul 20.00 UTC adalah
    // 16 Januari pukul 03.00 WIB. Tanpa `timeZone` eksplisit, mesin yang
    // berjalan di UTC — termasuk runner CI — menampilkan 15 Januari, dan
    // penjaga ini merah di sana. Tanggal yang meleset di halaman "data yang
    // kami simpan tentang Anda" membuat pengguna mempertanyakan data lainnya.
    renderPengaturan();
    await tungguAkunTerisi();

    expect(screen.getByText("16 Januari 2026")).toBeInTheDocument();
  });

  it("nama yang belum diisi disebut 'Belum diisi', bukan dibiarkan kosong", async () => {
    // Akun hasil login OTP lahir tanpa nama. Baris berlabel tanpa nilai tidak
    // bisa dibedakan dari cacat oleh pengguna screen reader — ia mendengar
    // "Nama" lalu langsung "Email".
    renderPengaturan({ me: { fullName: "  " } });
    await tungguAkunTerisi();

    const nama = screen.getAllByRole("definition")[0];
    expect(nama).toHaveTextContent("Belum diisi");
  });

  it("email kosong dibedakan dari email yang gagal dimuat", async () => {
    renderPengaturan({ me: { email: null } });
    await tungguAkunTerisi();

    expect(screen.getAllByText("Belum diisi")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("selama dimuat, wilayahnya ditandai sibuk dan sebabnya diumumkan", async () => {
    renderPengaturan();

    // `aria-busy` menahan pembacaan perubahan DI DALAM wilayahnya, jadi
    // pengumumannya harus berada di luar (PR-028b). Yang diperiksa di sini
    // adalah bahwa keduanya hadir sebelum data tiba.
    expect(await screen.findByText("Memuat data akun Anda…")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("kegagalan diumumkan sebagai alert dan menawarkan coba lagi", async () => {
    renderPengaturan({ me: "gagal" });

    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Data akun Anda belum bisa ditampilkan.");
    // Menyebut bahwa ini bukan kesalahan pengguna: yang mengira dirinya salah
    // akan berhenti mencoba.
    expect(alert).toHaveTextContent(/bukan kesalahan Anda/i);
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });

  it("tombol coba lagi BENAR-BENAR meminta ulang, bukan sekadar ada", async () => {
    const { hitung } = renderPengaturan({ me: "gagal" });
    await screen.findByRole("alert", {}, { timeout: 5000 });
    const sebelum = hitung.n;

    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    await waitFor(() => expect(hitung.n).toBeGreaterThan(sebelum));
  });
});

describe("panel aksesibilitas — slot PR-036", () => {
  it("mengakui bahwa kendalinya belum ada, alih-alih diam", async () => {
    renderPengaturan({ jalur: "/pengaturan/aksesibilitas" });
    await tungguJudul("Aksesibilitas");

    const slot = screen.getByRole("status");
    expect(slot).toHaveTextContent("Pengaturan aksesibilitas belum tersedia");
  });

  it("menyebut bahwa setelan perangkat SUDAH diikuti", async () => {
    // Kalimat inilah isi sesungguhnya dari slot ini. Preferensi sistem sudah
    // bekerja sejak PR-026; slot yang hanya berkata "belum tersedia" membuat
    // pengguna yang sudah menyetel perangkatnya menyangka setelannya diabaikan,
    // lalu berhenti memakainya.
    renderPengaturan({ jalur: "/pengaturan/aksesibilitas" });
    await tungguJudul("Aksesibilitas");

    expect(screen.getByRole("status")).toHaveTextContent(/setelan aksesibilitas perangkat Anda/i);
  });

  it("tidak menawarkan satu pun kendali palsu", async () => {
    // Kendali mati (tombol `disabled`, sakelar yang tidak menyimpan apa pun)
    // lebih buruk daripada ketiadaan: pengguna menekannya, tidak terjadi apa
    // pun, dan menyimpulkan aplikasinya rusak.
    renderPengaturan({ jalur: "/pengaturan/aksesibilitas" });
    await tungguJudul("Aksesibilitas");

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});

describe("judul dokumen", () => {
  it("menyebut panel yang sedang dibuka, bukan hanya 'Pengaturan'", async () => {
    // Judul tab yang sama untuk setiap panel membuat pengguna dengan belasan
    // tab terbuka tidak bisa membedakannya sama sekali.
    renderPengaturan({ jalur: "/pengaturan/aksesibilitas" });
    await tungguJudul("Aksesibilitas");

    await waitFor(() => expect(document.title).toBe("Aksesibilitas · Nawasena"));
  });
});

describe("bahasa sederhana (AC 5)", () => {
  it("panel akun punya varian id-simple yang benar-benar berbeda", async () => {
    renderPengaturan({ sederhana: true });
    await tungguJudul("Akun saya");

    expect(screen.getByText("Halaman ini menunjukkan data Anda yang kami simpan.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Akun saya" })).toBeInTheDocument();
  });

  it("slot aksesibilitas ikut punya varian sederhananya", async () => {
    renderPengaturan({ jalur: "/pengaturan/aksesibilitas", sederhana: true });
    await tungguJudul("Aksesibilitas");

    expect(screen.getByRole("status")).toHaveTextContent("Pengaturan ini belum bisa dipakai");
  });
});

describe("gerbang aksesibilitas lapis kedua", () => {
  // Lapis ketiga (kontras, target sentuh) ada di e2e/aksesibilitas.spec.ts —
  // kedua halaman ini terdaftar di registry dengan penanda `butuhSesi`.

  it("panel akun lolos axe", async () => {
    const { container } = renderPengaturan();
    await tungguJudul("Akun & Data Saya");

    await harusLolosAksesibilitas(container);
  });

  it("panel aksesibilitas lolos axe", async () => {
    const { container } = renderPengaturan({ jalur: "/pengaturan/aksesibilitas" });
    await tungguJudul("Aksesibilitas");

    await harusLolosAksesibilitas(container);
  });

  it("keadaan gagal lolos axe", async () => {
    // Keadaan kegagalan paling jarang terlihat saat mengembangkan, dan muncul
    // tepat ketika pengguna paling butuh bisa membacanya.
    const { container } = renderPengaturan({ me: "gagal" });
    await screen.findByRole("alert", {}, { timeout: 5000 });

    await harusLolosAksesibilitas(container);
  });
});

describe("penjaga tidak lulus secara hampa", () => {
  it("klien palsu benar-benar dipanggil untuk /me", async () => {
    const { hitung } = renderPengaturan();
    await tungguJudul("Akun & Data Saya");

    expect(hitung.n).toBeGreaterThan(0);
  });

  it("jalur tak terduga membuat test merah, bukan diam", () => {
    // Klien palsu yang menjawab apa saja akan menyembunyikan permintaan yang
    // tidak seharusnya terjadi.
    const klien = klienPalsu({}, { n: 0 });
    return expect(klien.request("/jalur-asing")).rejects.toThrow(/tak terduga/);
  });
});
