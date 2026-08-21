// Halaman profil karier (PR-040) — AC 1, 2, 3, 4, dan 5.
//
// Seluruhnya ditempuh lewat PERBUATAN PENGGUNA — mengetik, menekan Tab,
// menekan tombol — bukan lewat pemanggilan handler. Komponen yang handler-nya
// benar tetapi tidak pernah tersambung akan lolos dari test yang memanggil
// fungsinya langsung, dan itu persis jenis cacat yang paling mahal di formulir
// sepanjang ini: ia terlihat baik-baik saja sampai seseorang benar-benar
// memakainya.
//
// SATU HAL YANG DIUJI LEBIH KERAS DARIPADA SISANYA: gerbang consent. Tiga test
// di bawah tidak memeriksa "tampilannya benar", melainkan bahwa data disabilitas
// TIDAK BISA terkirim tanpa izin — diperiksa dari badan permintaan yang
// benar-benar dikirim, bukan dari keadaan komponen.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError, type ApiClient } from "@nawasena/api-client";
import { harusLolosAksesibilitas } from "@nawasena/a11y/pengujian";
import { createA11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import type { SeekerProfile } from "@nawasena/schemas";
import { ruteApp } from "../src/app/routes.js";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const PROFIL_AWAL: SeekerProfile = {
  headline: "Analis data",
  summary: null,
  city: "Yogyakarta",
  province: null,
  openToRemote: true,
  disclosureDefault: "ask_each_time",
  consentSensitiveAt: null,
  sensitive: null,
};

const PROFIL_BERIZIN: SeekerProfile = {
  ...PROFIL_AWAL,
  consentSensitiveAt: "2026-02-01T03:00:00.000Z",
  sensitive: {
    disabilityTypes: ["tuli"],
    accommodationNeeds: { tags: ["juru_bahasa_isyarat"], notes: "Perlu teks saat rapat" },
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

interface Permintaan {
  path: string;
  method: string;
  body: unknown;
}

interface OpsiKlien {
  /** Nyalakan mode bahasa sederhana (varian `id-simple`). */
  sederhana?: boolean;
  awal?: SeekerProfile;
  /** Buat PUT /me/profile gagal — dipakai menguji "satu bagian gagal". */
  gagalSimpan?: boolean;
}

function klienPalsu(jejak: Permintaan[], opsi: OpsiKlien = {}): ApiClient {
  const awal = opsi.awal ?? PROFIL_AWAL;

  return {
    request: (path: string, options?: { method?: string; body?: unknown }) => {
      const method = options?.method ?? "GET";
      // `/auth/refresh` sengaja TIDAK PERNAH selesai: status sesi sudah
      // ditetapkan langsung ke store, dan jawaban apa pun di sini hanya akan
      // menimpanya di tengah test.
      if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;

      jejak.push({ path, method, body: options?.body });

      if (path === "/me/profile") {
        if (method === "GET") return Promise.resolve({ data: awal }) as Promise<never>;
        if (opsi.gagalSimpan === true) {
          return Promise.reject(
            new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
          ) as Promise<never>;
        }
        // Meniru server: sakelar `consentSensitive` di PERMINTAAN diterjemahkan
        // menjadi `consentSensitiveAt` + `sensitive` di JAWABAN. Tanpa
        // penerjemahan itu, alur pencabutan tidak bisa diuji sama sekali.
        const kirim = (options?.body ?? {}) as Record<string, unknown>;
        if (kirim.consentSensitive === false) {
          return Promise.resolve({
            data: { ...awal, consentSensitiveAt: null, sensitive: null },
          }) as Promise<never>;
        }
        const punyaSensitif =
          kirim.disabilityTypes !== undefined || kirim.accommodationNeeds !== undefined;
        return Promise.resolve({
          data: {
            ...awal,
            ...kirim,
            consentSensitiveAt:
              kirim.consentSensitive === true ? "2026-02-01T03:00:00.000Z" : awal.consentSensitiveAt,
            sensitive: punyaSensitif
              ? {
                  disabilityTypes: kirim.disabilityTypes ?? [],
                  accommodationNeeds: kirim.accommodationNeeds ?? { tags: [], notes: null },
                }
              : awal.sensitive,
          },
        }) as Promise<never>;
      }

      if (/^\/me\/(experiences|educations|skills)$/.test(path)) {
        return Promise.resolve({ data: [] }) as Promise<never>;
      }

      return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
    },
  };
}

function renderProfil(opsi: OpsiKlien = {}) {
  useStoreSesi.setState({ status: "masuk" });
  const jejak: Permintaan[] = [];
  const a11y = createA11yStore({ storage: memori() });
  if (opsi.sederhana === true) a11y.getState().setPreferensi({ simpleLanguage: true });
  const router = createMemoryRouter(ruteApp, { initialEntries: ["/profil"] });

  const hasil = render(
    <Providers
      queryClient={createQueryClient()}
      klienApi={klienPalsu(jejak, opsi)}
      a11yStore={a11y}
    >
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...hasil, jejak };
}

/** Menunggu halaman benar-benar terbentuk — bukan sekadar kerangka kosongnya. */
async function tungguSiap(): Promise<void> {
  await screen.findByRole("heading", { name: "Profil karier saya", level: 1 }, { timeout: 5000 });
  await screen.findByRole("textbox", { name: /Judul profil/ }, { timeout: 5000 });
}

/** Kartu satu bagian, dicari lewat judulnya — halaman ini punya tiga. */
function bagian(judul: RegExp): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name: judul });
  // Induk LANGSUNG `<h2>` adalah kartunya (lihat `Kartu` di packages/ui).
  // Satu tingkat lebih jauh sudah menjadi wadah SEMUA bagian — dan penjaga
  // yang mencari "galat di bagian ini" di sana akan menemukan galat bagian
  // mana pun, lalu lulus atas hal yang tidak diperiksanya.
  const kartu = heading.parentElement;
  if (kartu === null || kartu === undefined) throw new Error(`kartu "${String(judul)}" tak ada`);
  return kartu;
}

/** PUT /me/profile terakhir — inilah yang benar-benar sampai ke server. */
function putTerakhir(jejak: Permintaan[]): Record<string, unknown> | undefined {
  const put = jejak.filter((j) => j.path === "/me/profile" && j.method === "PUT");
  return put.at(-1)?.body as Record<string, unknown> | undefined;
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "keluar" });
  vi.restoreAllMocks();
});

describe("AC 1 — profil dapat dilihat dan diedit", () => {
  it("nilai dari server muncul di kolomnya, bukan kolom kosong", async () => {
    renderProfil();
    await tungguSiap();

    expect(screen.getByRole("textbox", { name: /Judul profil/ })).toHaveValue("Analis data");
    expect(screen.getByRole("textbox", { name: /^Kota/ })).toHaveValue("Yogyakarta");
    expect(screen.getByRole("checkbox", { name: /bekerja jarak jauh/ })).toBeChecked();
  });

  it("perubahan dikirim sebagai PUT berisi yang diketik", async () => {
    const { jejak } = renderProfil();
    await tungguSiap();

    const judul = screen.getByRole("textbox", { name: /Judul profil/ });
    await userEvent.clear(judul);
    await userEvent.type(judul, "Admin data");
    await userEvent.click(
      within(bagian(/^Data dasar$/)).getByRole("button", { name: "Simpan bagian ini" }),
    );

    await waitFor(() => {
      expect(putTerakhir(jejak)).toMatchObject({ headline: "Admin data" });
    });
  });

  it("kolom yang DIKOSONGKAN ikut terkirim — supaya isian lama bisa dihapus", async () => {
    // Formulir yang menghilangkan kolom kosongnya membuat pengguna TIDAK BISA
    // menghapus judul profil yang terlanjur ia tulis: skema membedakan "tidak
    // disebut" (jangan sentuh) dari `null` (kosongkan).
    const { jejak } = renderProfil();
    await tungguSiap();

    await userEvent.clear(screen.getByRole("textbox", { name: /Judul profil/ }));
    await userEvent.click(
      within(bagian(/^Data dasar$/)).getByRole("button", { name: "Simpan bagian ini" }),
    );

    await waitFor(() => {
      expect(putTerakhir(jejak)).toHaveProperty("headline", null);
    });
  });
});

describe("AC 2 — simpan per bagian", () => {
  it("kegagalan bagian dasar TIDAK memunculkan galat di bagian sensitif", async () => {
    const { jejak } = renderProfil({ gagalSimpan: true });
    await tungguSiap();

    await userEvent.click(
      within(bagian(/^Data dasar$/)).getByRole("button", { name: "Simpan bagian ini" }),
    );

    const kartuDasar = bagian(/^Data dasar$/);
    await waitFor(() => {
      expect(within(kartuDasar).getByRole("alert")).toBeInTheDocument();
    });

    // Inilah inti AC-nya: bagian LAIN tidak ikut hangus.
    expect(within(bagian(/Disabilitas dan kebutuhan akomodasi/)).queryByRole("alert")).toBeNull();
    expect(within(bagian(/^Riwayat karier$/)).queryByRole("alert")).toBeNull();
    // Dan isian bagian lain masih utuh.
    expect(screen.getByRole("textbox", { name: /^Kota/ })).toHaveValue("Yogyakarta");
    expect(jejak.filter((j) => j.method === "PUT")).toHaveLength(1);
  });

  it("tiap bagian punya tombol simpannya sendiri", async () => {
    renderProfil();
    await tungguSiap();

    // Dua, bukan tiga: bagian karier menyimpan PER BARIS, jadi ia sengaja tidak
    // punya tombol simpan bagian.
    expect(screen.getAllByRole("button", { name: "Simpan bagian ini" })).toHaveLength(1);
    expect(
      within(bagian(/^Riwayat karier$/)).queryByRole("button", { name: "Simpan bagian ini" }),
    ).toBeNull();
  });

  it("keberhasilan diumumkan lewat live region, bukan hanya terlihat", async () => {
    renderProfil();
    await tungguSiap();

    const kartu = bagian(/^Data dasar$/);
    expect(within(kartu).getByRole("status")).toHaveTextContent("");

    await userEvent.click(within(kartu).getByRole("button", { name: "Simpan bagian ini" }));

    await waitFor(() => {
      expect(within(bagian(/^Data dasar$/)).getByRole("status")).toHaveTextContent(
        "Bagian Data dasar sudah disimpan.",
      );
    });
  });

  it("mengetik lagi MENGHAPUS pengumuman 'sudah disimpan'", async () => {
    // Pengumuman yang bertahan setelah isinya berubah menyatakan sesuatu yang
    // tidak lagi benar — dan pengguna screen reader tidak punya cara lain
    // mengetahui bahwa ada perubahan yang belum tersimpan.
    renderProfil();
    await tungguSiap();

    await userEvent.click(
      within(bagian(/^Data dasar$/)).getByRole("button", { name: "Simpan bagian ini" }),
    );
    await waitFor(() => {
      expect(within(bagian(/^Data dasar$/)).getByRole("status")).toHaveTextContent("sudah disimpan");
    });

    await userEvent.type(screen.getByRole("textbox", { name: /^Kota/ }), "x");

    await waitFor(() => {
      expect(within(bagian(/^Data dasar$/)).getByRole("status")).toHaveTextContent("");
    });
  });
});

describe("AC 3 — consent diberikan DAN dicabut dari UI", () => {
  it("kotak consent TIDAK tercentang saat halaman dibuka", async () => {
    renderProfil();
    await tungguSiap();

    expect(
      screen.getByRole("checkbox", { name: /mengizinkan Nawasena menyimpan data disabilitas/ }),
    ).not.toBeChecked();
  });

  it("tanpa consent, kolom disabilitas TIDAK ADA di DOM sama sekali", async () => {
    // Bukan sekadar "dinonaktifkan". Kolom yang ada tetapi mati masih bisa
    // dijelajahi screen reader, masih terbaca sebagai formulir yang siap diisi,
    // dan mengundang orang mengisinya lebih dulu — lalu izinnya menjadi
    // formalitas agar isiannya tidak terbuang.
    renderProfil();
    await tungguSiap();

    expect(screen.queryByRole("checkbox", { name: "Tuli atau kurang dengar" })).toBeNull();
    expect(screen.queryByRole("group", { name: /Ragam disabilitas Anda/ })).toBeNull();
  });

  it("mencentang consent memunculkan kolomnya; menyimpan mengirim consentSensitive", async () => {
    const { jejak } = renderProfil();
    await tungguSiap();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /mengizinkan Nawasena menyimpan data disabilitas/ }),
    );
    await userEvent.click(await screen.findByRole("checkbox", { name: "Tuli atau kurang dengar" }));
    await userEvent.click(
      within(bagian(/Disabilitas dan kebutuhan akomodasi/)).getByRole("button", {
        name: "Simpan bagian ini",
      }),
    );

    await waitFor(() => {
      expect(putTerakhir(jejak)).toMatchObject({
        consentSensitive: true,
        disabilityTypes: ["tuli"],
      });
    });
  });

  it("membuka centang consent MEMBUANG isian sensitif yang terlanjur ditulis", async () => {
    // Yang tersisa di layar setelah izin ditarik kembali tidak boleh berupa
    // data disabilitas yang siap terkirim pada penyimpanan berikutnya.
    renderProfil();
    await tungguSiap();

    const kotak = screen.getByRole("checkbox", {
      name: /mengizinkan Nawasena menyimpan data disabilitas/,
    });
    await userEvent.click(kotak);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Tuli atau kurang dengar" }));
    await userEvent.click(kotak);

    expect(screen.queryByRole("checkbox", { name: "Tuli atau kurang dengar" })).toBeNull();

    await userEvent.click(kotak);
    expect(await screen.findByRole("checkbox", { name: "Tuli atau kurang dengar" })).not.toBeChecked();
  });

  it("profil BERIZIN menampilkan datanya dan tanggal izinnya, tanpa kotak consent", async () => {
    renderProfil({ awal: PROFIL_BERIZIN });
    await tungguSiap();

    expect(await screen.findByRole("checkbox", { name: "Tuli atau kurang dengar" })).toBeChecked();
    expect(screen.getByText(/Anda memberi izin ini pada 1 Februari 2026/)).toBeInTheDocument();
    // Kotak consent SENGAJA tidak ada lagi: dua jalan menuju pencabutan berarti
    // salah satunya (yang tanpa peringatan) akan tertekan tidak sengaja.
    expect(
      screen.queryByRole("checkbox", { name: /mengizinkan Nawasena menyimpan/ }),
    ).toBeNull();
  });

  it("pencabutan mengirim consentSensitive:false TANPA data sensitif apa pun", async () => {
    // Skema menolak "cabut sambil menyimpan" — dan permintaan yang saling
    // meniadakan itu paling mungkin lahir dari state formulir.
    const { jejak } = renderProfil({ awal: PROFIL_BERIZIN });
    await tungguSiap();

    await userEvent.click(
      await screen.findByRole("button", { name: "Tarik izin dan hapus data ini" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Ya, hapus data saya",
      }),
    );

    await waitFor(() => {
      expect(putTerakhir(jejak)).toEqual({ consentSensitive: false });
    });
  });

  it("sesudah dicabut, data disabilitas hilang dari layar", async () => {
    renderProfil({ awal: PROFIL_BERIZIN });
    await tungguSiap();

    await userEvent.click(
      await screen.findByRole("button", { name: "Tarik izin dan hapus data ini" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Ya, hapus data saya",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "Tuli atau kurang dengar" })).toBeNull();
    });
    expect(
      screen.getByRole("checkbox", { name: /mengizinkan Nawasena menyimpan data disabilitas/ }),
    ).not.toBeChecked();
  });

  it("dialog pencabutan menyebut akibatnya, bukan sekadar 'Anda yakin?'", async () => {
    renderProfil({ awal: PROFIL_BERIZIN });
    await tungguSiap();

    await userEvent.click(
      await screen.findByRole("button", { name: "Tarik izin dan hapus data ini" }),
    );
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/akan dihapus/)).toBeInTheDocument();
    expect(within(dialog).getByText(/tidak menyimpan salinannya/i)).toBeInTheDocument();
  });
});

describe("AC 4 — keyboard-only", () => {
  it("consent dapat dicentang dan bagiannya disimpan tanpa tetikus", async () => {
    const { jejak } = renderProfil();
    await tungguSiap();

    const kotak = screen.getByRole("checkbox", {
      name: /mengizinkan Nawasena menyimpan data disabilitas/,
    });
    kotak.focus();
    await userEvent.keyboard(" ");
    expect(kotak).toBeChecked();

    const ragam = await screen.findByRole("checkbox", { name: "Netra atau penglihatan terbatas" });
    ragam.focus();
    await userEvent.keyboard(" ");

    const simpan = within(bagian(/Disabilitas dan kebutuhan akomodasi/)).getByRole("button", {
      name: "Simpan bagian ini",
    });
    simpan.focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(putTerakhir(jejak)).toMatchObject({ disabilityTypes: ["netra"] });
    });
  });

  it("tombol simpan dapat dicapai dengan Tab dari kolom terakhir bagiannya", async () => {
    renderProfil();
    await tungguSiap();

    const disclosure = screen.getByRole("combobox");
    disclosure.focus();

    // Beberapa Tab, bukan satu: yang diuji bukan jumlahnya melainkan bahwa
    // tombolnya BISA dicapai sama sekali — kendali yang terlewat dari urutan
    // Tab tidak akan pernah tersentuh pengguna yang tidak memakai tetikus.
    let sampai = false;
    for (let i = 0; i < 6 && !sampai; i += 1) {
      await userEvent.tab();
      sampai = document.activeElement?.textContent?.includes("Simpan bagian ini") === true;
    }
    expect(sampai, "tombol simpan tidak terjangkau lewat Tab").toBe(true);
  });
});

describe("AC 5 — bagian sensitif ditandai dan dijelaskan", () => {
  it("penandanya TEKS, bukan sekadar warna", async () => {
    // Penanda yang hanya berupa warna tidak ada sama sekali bagi pengguna
    // screen reader — dan merekalah yang paling perlu tahu bahwa bagian ini
    // berbeda perlakuannya.
    renderProfil();
    await tungguSiap();

    expect(within(bagian(/Disabilitas dan kebutuhan akomodasi/)).getByText("Data sensitif"))
      .toBeInTheDocument();
  });

  it("menyebut siapa yang bisa melihatnya SEBELUM meminta izin", async () => {
    renderProfil();
    await tungguSiap();

    expect(
      screen.getByText(/Perusahaan tidak bisa melihat data ini sampai Anda mengizinkannya/),
    ).toBeInTheDocument();
  });
});

describe("aksesibilitas halaman", () => {
  it("lolos axe tanpa consent", async () => {
    const { container } = renderProfil();
    await tungguSiap();
    await harusLolosAksesibilitas(container);
  });

  it("lolos axe dengan kolom sensitif terbuka", async () => {
    const { container } = renderProfil({ awal: PROFIL_BERIZIN });
    await tungguSiap();
    await screen.findByRole("checkbox", { name: "Tuli atau kurang dengar" });
    await harusLolosAksesibilitas(container);
  });
});

describe("mode teks sederhana (Testing Checklist PR-040)", () => {
  it("seluruh halaman berganti ke varian id-simple, bukan sebagian", async () => {
    // Halaman yang separuhnya berganti bahasa lebih membingungkan daripada
    // yang tidak berganti sama sekali: pengguna yang membutuhkan varian
    // sederhana justru harus membaca dua gaya kalimat sekaligus.
    renderProfil({ sederhana: true });

    await screen.findByRole(
      "heading",
      { name: "Profil kerja saya", level: 1 },
      { timeout: 5000 },
    );

    expect(screen.getByText(/Kami pakai ini untuk cari kerja yang cocok/)).toBeInTheDocument();
    // `findBy`, bukan `getBy`: judul halaman sudah terpasang sebelum profilnya
    // tiba, jadi kendali formulir baru lahir satu putaran render kemudian.
    expect(
      await screen.findByRole(
        "checkbox",
        { name: "Saya izinkan Nawasena simpan data disabilitas saya" },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Riwayat kerja dan sekolah" })).toBeInTheDocument();
  });
});
