// Panel preferensi aksesibilitas (PR-036) — AC-4 (reset), AC-7 (ketujuh field
// tersimpan), AC-8 (keyboard & screen reader).
//
// DIRENDER LEWAT `ruteApp` PRODUKSI, bukan dengan merender komponennya
// langsung. Alasannya sama dengan `pengaturan.test.tsx`: panel yang sempurna
// tetapi tidak pernah tersambung ke alamatnya tidak menghasilkan apa pun bagi
// siapa pun, dan test yang merender komponennya sendiri tidak akan pernah
// melihat kelalaian itu.
//
// PERMINTAAN JARINGAN DICATAT, bukan cuma dihitung. AC-7 menuntut nilai yang
// BENAR sampai ke akun — bukan sekadar "ada permintaan terkirim". Cacat "yang
// tersimpan bukan yang dipilih" tidak menimbulkan satu pun gejala di layar.
//
// `GET /me/accessibility` SENGAJA DIBIARKAN MENGGANTUNG di sini. Penarikan
// preferensi dari akun punya berkasnya sendiri (`sambungkan-server.test.tsx`);
// membiarkannya menjawab di tengah berkas ini berarti store berubah dari dua
// arah sekaligus, dan kegagalannya akan bergantung pada urutan kedatangan.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { createA11yStore, type A11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { ACCESSIBILITY_DEFAULTS } from "@nawasena/schemas";
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

function klienPalsu(jejak: Jejak[], gagal: boolean): ApiClient {
  return {
    request: (path: string, opsi?: { method?: string; body?: unknown }) => {
      // Pemulihan sesi dibiarkan menggantung: statusnya dipasang test sendiri,
      // dan jawaban apa pun akan menimpanya.
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;

      if (path === "/me/accessibility") {
        const method = opsi?.method ?? "GET";
        if (method === "GET") return new Promise(() => {}) as Promise<never>;

        jejak.push({ method, body: opsi?.body });
        if (gagal) {
          return Promise.reject(
            new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
          ) as Promise<never>;
        }
        return Promise.resolve({
          data: { ...ACCESSIBILITY_DEFAULTS, ...(opsi?.body as object) },
        }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

interface Tertunda {
  resolve: (nilai: unknown) => void;
}

/**
 * Klien yang mencatat tiap PUT segera (`jejak`), tetapi MENAHAN jawabannya
 * sampai `lepaskan(i)` dipanggil test — satu-satunya cara membuktikan urutan
 * KEDATANGAN, bukan urutan pengiriman, saat reset ditekan sementara PUT
 * sebelumnya masih di jalan (edge case tertulis di rencana test PR-036).
 */
function klienTertunda(jejak: Jejak[]): { klien: ApiClient; lepaskan: (i: number) => void } {
  const tertunda: Tertunda[] = [];
  const klien: ApiClient = {
    request: (path: string, opsi?: { method?: string; body?: unknown }) => {
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
      if (path === "/me/accessibility") {
        const method = opsi?.method ?? "GET";
        if (method === "GET") return new Promise(() => {}) as Promise<never>;
        jejak.push({ method, body: opsi?.body });
        return new Promise((resolve) => {
          tertunda.push({ resolve: resolve as (nilai: unknown) => void });
        }) as Promise<never>;
      }
      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
  return { klien, lepaskan: (i: number) => tertunda[i]?.resolve({ data: ACCESSIBILITY_DEFAULTS }) };
}

interface OpsiRender {
  gagal?: boolean;
  /**
   * Perangkat meminta kontras tinggi.
   *
   * Dipasang lewat `matchMedia`, BUKAN lewat `setSinyalOS`: `hubungkanKeDom`
   * membaca ulang sinyal OS saat dipasang dan akan menimpa apa pun yang
   * dititipkan langsung ke store. Test yang menitipkannya lewat store lulus
   * hari ini dan diam-diam berhenti memeriksa apa pun.
   */
  kontrasPerangkat?: boolean;
}

/** Menyalakan `(prefers-contrast: more)` untuk satu test. */
function palsukanKontrasPerangkat() {
  const asli = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((kueri: string) => {
    const mql = asli(kueri);
    return kueri === "(prefers-contrast: more)"
      ? ({ ...mql, media: kueri, matches: true } as MediaQueryList)
      : mql;
  });
}

function renderPanel({ gagal = false, kontrasPerangkat = false }: OpsiRender = {}) {
  useStoreSesi.setState({ status: "masuk" });
  if (kontrasPerangkat) palsukanKontrasPerangkat();

  const a11y: A11yStore = createA11yStore({ storage: memori() });

  const jejak: Jejak[] = [];
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/pengaturan/aksesibilitas"] });
  const hasil = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienPalsu(jejak, gagal)}
      a11yStore={a11y}
    >
      <RouterProvider router={router} />
    </Providers>,
  );

  return { ...hasil, jejak, a11y };
}

/** Panelnya dimuat lazy; tenggat dilonggarkan seperti di `pengaturan.test.tsx`. */
async function tungguPanel() {
  await screen.findByRole("heading", { level: 2, name: "Aksesibilitas" }, { timeout: 5000 });
  await screen.findByRole("slider", {}, { timeout: 5000 });
}

const saklar = (nama: string) => screen.getByRole("checkbox", { name: nama });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useStoreSesi.setState({ status: "memulihkan" });
  const el = document.documentElement;
  el.removeAttribute("style");
  for (const a of ["data-contrast", "data-motion", "data-lang-mode"]) el.removeAttribute(a);
});

describe("AC-7 — ketujuh field berlaku seketika DAN dikirim ke akun", () => {
  // Enam sakelar, satu penggeser. Ditulis sebagai tabel supaya field yang
  // ditambahkan ke skema tanpa kendali di layar terlihat sebagai baris yang
  // hilang, bukan sebagai ketiadaan yang tidak pernah dihitung siapa pun.
  const SAKLAR = [
    ["highContrast", "Kontras tinggi"],
    ["reduceMotion", "Kurangi animasi"],
    ["simpleLanguage", "Teks sederhana"],
    ["largeTouchTargets", "Tombol lebih besar"],
    ["prefersSignLanguage", "Utamakan konten BISINDO"],
    ["screenReaderHint", "Saya memakai pembaca layar"],
  ] as const;

  it.each(SAKLAR)(
    "%s: sakelarnya menulis store DAN mengirim PUT berisi field itu",
    async (kunci, label) => {
      const { jejak, a11y } = renderPanel();
      await tungguPanel();

      await userEvent.click(saklar(label));

      // (a) Sisi pengguna: berlaku SEKARANG, tanpa menunggu jawaban server.
      expect(a11y.getState().pilihanPengguna[kunci]).toBe(true);
      // (b) Sisi akun: badan permintaannya HANYA field itu — bukan profil utuh.
      //     Mengirim seluruh profil pada tiap sentuhan berarti menimpa field yang
      //     baru saja diubah pengguna dari perangkat lain.
      await waitFor(() => expect(jejak).toHaveLength(1));
      expect(jejak[0]).toEqual({ method: "PUT", body: { [kunci]: true } });
    },
  );

  it("textScale: penggesernya mengirim angka, bukan teks", async () => {
    // `e.target.value` selalu string. Angka yang lolos sebagai string ditolak
    // skema `.strict()` di klien — tetapi hanya bila memang diubah tipenya.
    const { jejak, a11y } = renderPanel();
    await tungguPanel();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "150" } });

    expect(a11y.getState().pilihanPengguna.textScale).toBe(150);
    await waitFor(() => expect(jejak).toHaveLength(1));
    expect(jejak[0]).toEqual({ method: "PUT", body: { textScale: 150 } });
  });

  it("nilai penggeser diumumkan bersatuan, bukan sebagai angka telanjang", async () => {
    renderPanel();
    await tungguPanel();

    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "100 persen");
  });
});

describe("AC-4 — kembali ke bawaan", () => {
  it("menghapus KETUJUH pilihan, bukan hanya yang terlihat berubah", async () => {
    const { a11y } = renderPanel();
    await tungguPanel();

    // SENGAJA BUKAN "Teks sederhana": sakelar itu mengganti bahasa seluruh
    // layar, termasuk label tombol yang hendak ditekan test ini.
    await userEvent.click(saklar("Kontras tinggi"));
    await userEvent.click(saklar("Tombol lebih besar"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "175" } });

    await userEvent.click(screen.getByRole("button", { name: "Kembalikan ke setelan bawaan" }));

    expect(a11y.getState().pilihanPengguna).toEqual({});
  });

  it("MENGHAPUS pilihan, tidak menulis bawaan — sinyal perangkat muncul kembali", async () => {
    // Inti keputusan AC-4. Menulis `ACCESSIBILITY_DEFAULTS` akan MEMATIKAN
    // kontras tinggi yang diminta perangkat, lalu memblokir sinyalnya selamanya
    // (`hapusPilihan` di store menjelaskan mengapa). Yaitu tombol "kembali ke
    // bawaan" yang membuang setelan aksesibilitas milik pengguna.
    const { a11y, jejak } = renderPanel({ kontrasPerangkat: true });
    await tungguPanel();

    await userEvent.click(saklar("Kontras tinggi")); // dimatikan pengguna
    expect(a11y.getState().efektif().highContrast).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Kembalikan ke setelan bawaan" }));

    expect(a11y.getState().efektif().highContrast).toBe(true);
    // Yang dikirim ke akun tetap profil UTUH — kontraknya tidak punya konsep
    // "belum dipilih" — dan isinya keadaan SESUDAH penghapusan.
    await waitFor(() => expect(jejak).toHaveLength(2));
    expect(jejak[1]).toEqual({
      method: "PUT",
      body: { ...ACCESSIBILITY_DEFAULTS, highContrast: true },
    });
  });

  it("menyebutkan mengapa sebuah sakelar tetap menyala sesudah direset", async () => {
    // Tanpa kalimat ini, tombol reset tampak rusak bagi pengguna yang
    // perangkatnya menyalakan kontras tinggi.
    renderPanel({ kontrasPerangkat: true });
    await tungguPanel();

    // Diperiksa lewat DESKRIPSI yang dihitung pohon aksesibilitas, bukan lewat
    // teks yang kebetulan ada di halaman: kalimat yang tampil tetapi tidak
    // tersambung ke sakelarnya tidak akan pernah dibacakan bersama sakelar itu.
    expect(
      screen.getByRole("checkbox", {
        name: "Kontras tinggi",
        description: /mengikuti setelan perangkat Anda/i,
      }),
    ).toBeInTheDocument();
  });

  it("PUT terakhir sesudah reset berisi PERSIS efektif() — bukan cuma store yang kosong", async () => {
    // Cakupan sengaja BEDA dari test "sinyal perangkat" di atas: di sana
    // `kontrasPerangkat` membuat PUT-nya punya satu field bukan-bawaan. Di sini
    // TIDAK ADA sinyal perangkat sama sekali, jadi badan PUT-nya harus PERSIS
    // `ACCESSIBILITY_DEFAULTS` — buktinya bahwa reset mengirim efektif() APA
    // ADANYA, bukan sekadar objek yang kebetulan kosong pada satu field.
    const { jejak, a11y } = renderPanel();
    await tungguPanel();

    await userEvent.click(saklar("Kontras tinggi"));
    await userEvent.click(saklar("Tombol lebih besar"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "175" } });
    await waitFor(() => expect(jejak).toHaveLength(3));

    await userEvent.click(screen.getByRole("button", { name: "Kembalikan ke setelan bawaan" }));

    await waitFor(() => expect(jejak).toHaveLength(4));
    expect(jejak[3]).toEqual({ method: "PUT", body: ACCESSIBILITY_DEFAULTS });
    expect(a11y.getState().efektif()).toEqual(ACCESSIBILITY_DEFAULTS);
  });

  it("reset ditekan SAAT PUT sakelar lain masih di jalan — PUT reset menunggu, lalu mendarat TERAKHIR", async () => {
    // Edge case tertulis di rencana test PR-036: "reset's PUT must land last".
    // Klien biasa (`klienPalsu`) menjawab seketika, sehingga tidak pernah ada
    // PUT yang benar-benar "masih di jalan" saat reset ditekan — antrean
    // (`antrean` di panel.tsx) tidak pernah teruji SEBAGAI antrean, hanya
    // sebagai kode yang kebetulan tidak pernah bertabrakan.
    useStoreSesi.setState({ status: "masuk" });
    const a11y: A11yStore = createA11yStore({ storage: memori() });
    const jejak: Jejak[] = [];
    const { klien, lepaskan } = klienTertunda(jejak);

    const router = createMemoryRouter(ruteApp, { initialEntries: ["/pengaturan/aksesibilitas"] });
    render(
      <Providers queryClient={createQueryClient()} klienApi={klien} a11yStore={a11y}>
        <RouterProvider router={router} />
      </Providers>,
    );
    await tungguPanel();

    await userEvent.click(saklar("Kontras tinggi"));
    // PUT pertama SUDAH terkirim (tercatat), tetapi jawabannya masih ditahan.
    await waitFor(() => expect(jejak).toHaveLength(1));
    expect(jejak[0]).toEqual({ method: "PUT", body: { highContrast: true } });

    await userEvent.click(screen.getByRole("button", { name: "Kembalikan ke setelan bawaan" }));
    // Resetnya SUDAH terjadi secara lokal — layar sudah berubah...
    expect(a11y.getState().pilihanPengguna).toEqual({});
    // ...tetapi PUT keduanya BELUM berangkat: antrean menunggu jawaban
    // pertama, persis maksud "menunggu giliran, bukan debounce" di panel.tsx.
    expect(jejak).toHaveLength(1);

    lepaskan(0);

    await waitFor(() => expect(jejak).toHaveLength(2));
    expect(jejak[1]).toEqual({ method: "PUT", body: ACCESSIBILITY_DEFAULTS });
  });

  it("keterangan itu HILANG begitu pengguna memilih sendiri", async () => {
    // Kalau ia menetap, panel mengklaim "mengikuti perangkat" pada sakelar yang
    // justru sedang menimpa perangkat — kebalikan dari keadaan sebenarnya.
    renderPanel({ kontrasPerangkat: true });
    await tungguPanel();

    await userEvent.click(saklar("Kontras tinggi"));

    // Dicari lewat DESKRIPSI sakelar itu, bukan lewat teks di halaman: kalimat
    // yang sama sah muncul pada sakelar LAIN yang memang masih mengikuti
    // perangkat, dan kueri per teks akan menuduh yang tidak bersalah.
    expect(
      screen.queryByRole("checkbox", {
        name: "Kontras tinggi",
        description: /mengikuti setelan perangkat Anda/i,
      }),
    ).toBeNull();
  });
});

describe("umpan balik simpan otomatis", () => {
  it("mengumumkan tersimpan lewat live region yang sopan", async () => {
    // Tidak ada tombol "Simpan" di panel ini, jadi kalimat inilah SATU-SATUNYA
    // cara pengguna screen reader tahu pilihannya sampai ke akun.
    renderPanel();
    await tungguPanel();

    await userEvent.click(saklar("Kontras tinggi"));

    // Dicari lewat KALIMATNYA lalu diperiksa perannya, bukan lewat
    // `getByRole("status")`: penggeser membawa `<output>`, yang perannya juga
    // "status", sehingga kueri per peran menemukan dua elemen sekaligus.
    await waitFor(() =>
      expect(screen.getByText("Pilihan Anda sudah tersimpan ke akun.")).toHaveAttribute(
        "role",
        "status",
      ),
    );
  });

  it("kegagalan TIDAK mengembalikan sakelarnya", async () => {
    // Layar yang berubah sendiri karena jaringan buruk jauh lebih membingungkan
    // daripada satu nilai yang belum tersalin ke akun — dan pilihannya memang
    // sudah berlaku di perangkat ini.
    const { a11y } = renderPanel({ gagal: true });
    await tungguPanel();

    await userEvent.click(saklar("Kontras tinggi"));

    const peringatan = await screen.findByRole("alert");
    expect(peringatan).toHaveTextContent("Pilihan Anda belum bisa dikirim ke akun Anda.");
    expect(peringatan).toHaveTextContent("tetap berlaku di perangkat ini");
    expect(saklar("Kontras tinggi")).toBeChecked();
    expect(a11y.getState().efektif().highContrast).toBe(true);
  });
});

describe("AC-8 — keyboard & screen reader", () => {
  it("penggeser, keenam sakelar, dan tombol reset berurutan dalam satu jalur Tab", async () => {
    // Ditempuh sebagai PERBUATAN. Kendali yang benar tetapi dilewati urutan
    // fokus — atau yang ditaruh sesudah tombol reset — punya markup yang tampak
    // baik-baik saja.
    renderPanel();
    await tungguPanel();

    screen.getByRole("slider").focus();
    const dilalui: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      await userEvent.tab();
      dilalui.push(document.activeElement?.tagName.toLowerCase() ?? "?");
    }

    expect(dilalui).toEqual(["input", "input", "input", "input", "input", "input", "button"]);
  });

  it("tiap sakelar membawa penjelasannya sendiri, bukan label telanjang", async () => {
    renderPanel();
    await tungguPanel();

    expect(
      screen.getByRole("checkbox", {
        name: "Kontras tinggi",
        description: /Warna dibuat lebih tegas/,
      }),
    ).toBeInTheDocument();
  });

  it("lolos axe", async () => {
    const { container } = renderPanel();
    await tungguPanel();

    await harusLolosAksesibilitas(container);
  });

  it("keadaan gagal ikut lolos axe", async () => {
    const { container } = renderPanel({ gagal: true });
    await tungguPanel();

    await userEvent.click(saklar("Kontras tinggi"));
    await screen.findByRole("alert");

    await harusLolosAksesibilitas(container);
  });
});

describe("penjaga tidak lulus secara hampa", () => {
  it("klien palsu benar-benar menerima PUT", async () => {
    const { jejak } = renderPanel();
    await tungguPanel();

    await userEvent.click(saklar("Kurangi animasi"));

    await waitFor(() => expect(jejak.length).toBeGreaterThan(0));
  });
});
