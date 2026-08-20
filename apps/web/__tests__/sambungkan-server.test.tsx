// Preferensi ditarik dari akun saat masuk (PR-036) — AC-6: "nilai lokal pada
// cat pertama, nilai server menang sesudahnya, tanpa kedipan".
//
// DUA LAPIS, dan pembagiannya disengaja:
//
//   1. `gabungkanDariServer` diuji sebagai FUNGSI MURNI. Yang ditanganinya
//      adalah perlombaan — pengguna menggeser sakelar sementara permintaannya
//      masih di jalan — dan perlombaan yang diuji lewat komponen menuntut
//      pengendalian waktu sampai ke milidetik. Sebagai data masuk → data
//      keluar, tiap keadaannya bisa disebut namanya.
//   2. Penyambungannya diuji lewat `Providers` PRODUKSI dengan permintaan yang
//      ditahan tangan. Fungsi yang benar tetapi tidak pernah dipanggil tidak
//      mengubah apa pun di layar siapa pun.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  ACCESSIBILITY_DEFAULTS,
  ACCESSIBILITY_KEYS,
  ACCESSIBILITY_PROFILE_KOSONG,
  type AccessibilityProfile,
} from "@nawasena/schemas";
import { createA11yStore, type A11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { accessibilityKeys, ApiError, type ApiClient } from "@nawasena/api-client";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { gabungkanDariServer } from "../src/app/penyedia-a11y.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const DARI_SERVER: AccessibilityProfile = {
  ...ACCESSIBILITY_PROFILE_KOSONG,
  textScale: 120,
  highContrast: true,
};

/** Ketujuhnya benar-benar dipilih pengguna — tidak satu pun `null`. */
const SEMUA_DIPILIH: AccessibilityProfile = {
  textScale: 120,
  highContrast: true,
  reduceMotion: true,
  simpleLanguage: true,
  prefersSignLanguage: true,
  largeTouchTargets: true,
  screenReaderHint: true,
};

describe("gabungkanDariServer — aturan per field", () => {
  it("field yang tidak tersentuh mengambil nilai akun", () => {
    const hasil = gabungkanDariServer(DARI_SERVER, {}, {});

    expect(hasil.textScale).toBe(120);
    expect(hasil.highContrast).toBe(true);
  });

  it("field yang DIUBAH pengguna di tengah jalan tetap memakai nilai lokal", () => {
    // Pengguna sudah MELIHAT perubahannya berlaku, dan PUT-nya sudah berangkat.
    // Menimpanya dengan jawaban yang berangkat lebih dulu berarti layar berubah
    // sendiri kembali ke nilai yang barusan ia tinggalkan.
    const hasil = gabungkanDariServer(DARI_SERVER, { textScale: 150 }, { textScale: 175 });

    expect(hasil.textScale).toBeUndefined();
    // Tetangganya yang tidak disentuh TETAP diperbarui — penolakannya per
    // field, bukan per profil.
    expect(hasil.highContrast).toBe(true);
  });

  it("nilai lokal yang KEBETULAN sama dengan saat berangkat tetap diperbarui", () => {
    // "Tersentuh" berarti berubah, bukan pernah ada. Field yang sudah bernilai
    // sama sejak awal tidak sedang diperebutkan siapa pun.
    const hasil = gabungkanDariServer(DARI_SERVER, { textScale: 150 }, { textScale: 150 });

    expect(hasil.textScale).toBe(120);
  });

  it("mencakup KETUJUH field, bukan sebagian", () => {
    // Field yang terlewat tidak pernah tersinkron antar-perangkat, dan
    // ketiadaannya tidak menimbulkan satu pun gejala di perangkat yang sedang
    // dipakai.
    expect(Object.keys(gabungkanDariServer(SEMUA_DIPILIH, {}, {})).sort()).toEqual(
      [...ACCESSIBILITY_KEYS].sort(),
    );
  });
});

// ---------------------------------------------------------------------------

// `null` DARI AKUN BERARTI "BELUM DIATUR" — dan itu satu-satunya aturan yang
// diperlukan sekarang.
//
// Blok ini menggantikan "penjaga sinyal OS" yang lama. Penjaga itu menebak:
// selama server tidak bisa menyatakan "belum memilih", nilai yang KEBETULAN sama
// dengan bawaan dibiarkan kalah oleh sinyal OS yang bertentangan. Tebakan itu
// menutup kasus umum tetapi menyisakan dua celah yang tidak bisa ditutup dari
// sisi klien mana pun. Sejak migrasi 09 profil akun menyatakan ketiadaan pilihan
// apa adanya, jadi tebakan itu DIHAPUS, bukan dilonggarkan — dan kedua celahnya
// ikut hilang. Dua test terakhir di bawah ini yang menjepitnya.
describe("gabungkanDariServer — semantik null", () => {
  it("field null TIDAK ditulis, sehingga sinyal OS tetap terjangkau", () => {
    const hasil = gabungkanDariServer(DARI_SERVER, {}, {});

    // BUKAN sekadar `toBeUndefined()`: kunci yang HADIR dengan nilai `undefined`
    // juga lolos pemeriksaan itu, padahal `setPreferensi` men-spread objek ini
    // apa adanya. Yang harus dibuktikan adalah OMISI kuncinya.
    expect(hasil.reduceMotion).toBeUndefined();
    expect("reduceMotion" in hasil).toBe(false);
    // Field yang memang dipilih tetap tersinkron — aturannya per field.
    expect(hasil.textScale).toBe(120);
  });

  // CELAH LAMA (a) — cabang "tulis bila tidak ada pertentangan" dulu MEMAKU
  // field yang tak pernah dipilih siapa pun, sehingga perubahan setelan OS
  // sesudah masuk tidak lagi berlaku untuknya.
  it("akun kosong tidak memaku satu field pun", () => {
    const hasil = gabungkanDariServer(ACCESSIBILITY_PROFILE_KOSONG, {}, {});

    expect(Object.keys(hasil)).toEqual([]);
  });

  // CELAH LAMA (b) — `false` yang benar-benar dipilih pengguna dulu tidak bisa
  // dibedakan dari bawaan, jadi ia kalah oleh sinyal OS yang bertentangan dan
  // reset `true → false` di perangkat A tidak pernah mendarat di perangkat B.
  it("false yang DIPILIH pengguna tetap ditulis, bukan disamakan dengan belum-diatur", () => {
    const dariServer: AccessibilityProfile = { ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: false };
    const hasil = gabungkanDariServer(dariServer, {}, {});

    expect(hasil.highContrast).toBe(false);
    expect("highContrast" in hasil).toBe(true);
  });

  it("nilai yang kebetulan sama dengan bawaan tetap tersinkron (AC-1 reset)", () => {
    const dariServer: AccessibilityProfile = {
      ...ACCESSIBILITY_PROFILE_KOSONG,
      textScale: ACCESSIBILITY_DEFAULTS.textScale,
    };
    const hasil = gabungkanDariServer(dariServer, {}, {});

    expect(hasil.textScale).toBe(ACCESSIBILITY_DEFAULTS.textScale);
  });
});

// ---------------------------------------------------------------------------

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

/** Membaca store yang SAMA dengan yang dipasang ke `Providers`. */
function Pengintip({ store }: { store: A11yStore }) {
  const pilihan = store((s) => s.pilihanPengguna);
  return <p data-testid="skala">{pilihan.textScale ?? "-"}</p>;
}

interface Tertahan {
  klien: ApiClient;
  /** Jumlah `GET /me/accessibility` yang benar-benar berangkat. */
  jumlah: () => number;
  jawab: (nilai: AccessibilityProfile) => void;
}

/** Klien yang MENAHAN jawaban preferensi sampai test melepaskannya. */
function klienTertahan(): Tertahan {
  let lepaskan: ((nilai: never) => void) | null = null;
  let jumlah = 0;

  return {
    klien: {
      request: (path: string) => {
        if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
        if (path === "/me/accessibility") {
          jumlah += 1;
          return new Promise<never>((resolve) => {
            lepaskan = resolve;
          });
        }
        return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
      },
    },
    jumlah: () => jumlah,
    jawab: (nilai) => {
      // `ApiClient.request` bertipe `Promise<never>` di permukaannya (bentuk
      // jawabannya ditentukan skema pemanggil, bukan klien), jadi nilai jawaban
      // palsu harus dilewatkan apa adanya.
      lepaskan?.({ data: nilai } as never);
    },
  };
}

/**
 * Menyalakan `(prefers-reduced-motion: reduce)` untuk satu test.
 *
 * Lewat `matchMedia`, BUKAN `setSinyalOS`: `hubungkanKeDom` membaca ulang sinyal
 * OS saat dipasang dan akan menimpa apa pun yang dititipkan langsung ke store.
 */
function palsukanKurangiGerakPerangkat() {
  const asli = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((kueri: string) => {
    const mql = asli(kueri);
    return kueri === "(prefers-reduced-motion: reduce)"
      ? ({ ...mql, media: kueri, matches: true } as MediaQueryList)
      : mql;
  });
}

function renderProbe(status: "masuk" | "keluar") {
  useStoreSesi.setState({ status });

  const store = createA11yStore({ storage: memori() });
  store.getState().setPreferensi({ textScale: 150 });

  const tertahan = klienTertahan();
  const klien = createQueryClient();
  const hasil = render(
    <Providers queryClient={klien} klienApi={tertahan.klien} a11yStore={store}>
      <Pengintip store={store} />
    </Providers>,
  );

  return { ...hasil, store, tertahan, klien };
}

afterEach(() => {
  cleanup();
  useStoreSesi.setState({ status: "memulihkan" });
  vi.restoreAllMocks();
});

describe("penyambungan ke akun", () => {
  it("cat pertama memakai nilai LOKAL, jawaban akun menyusul menimpanya", async () => {
    const { tertahan } = renderProbe("masuk");

    // Sebelum jawabannya tiba, layar memakai nilai perangkat ini — bukan
    // bawaan. Inilah yang membuat tidak ada kedipan: tidak pernah ada saat
    // ketika layar menampilkan sesuatu yang bukan pilihan pengguna.
    expect(screen.getByTestId("skala")).toHaveTextContent("150");

    tertahan.jawab(DARI_SERVER);

    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("120"));
  });

  it("perubahan lokal SELAMA permintaan berjalan tidak tertimpa", async () => {
    const { store, tertahan } = renderProbe("masuk");

    store.getState().setPreferensi({ textScale: 175 });
    tertahan.jawab(DARI_SERVER);

    await waitFor(() => expect(store.getState().pilihanPengguna.highContrast).toBe(true));
    expect(screen.getByTestId("skala")).toHaveTextContent("175");
  });

  it("permintaan ULANG tidak menggabungkan untuk kedua kalinya", async () => {
    // Query ini dijalankan ulang tanpa diminta pengguna: `refetchOnReconnect`
    // bawaan TanStack v5, dan "Coba lagi" pada banner luring yang memanggil
    // `invalidateQueries()` tanpa pandang bulu. Penggabungan kedua akan
    // menimbang ulang sakelar yang PUT-nya belum mendarat dan mengembalikannya
    // ke nilai akun yang belum memuatnya — layar berubah sendiri.
    const { store, tertahan, klien } = renderProbe("masuk");

    tertahan.jawab(DARI_SERVER);
    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("120"));

    // Suntingan pengguna yang belum mendarat di akun. `act` karena store ini
    // menggerakkan render nyata — tanpanya React memperingatkan pembaruan di
    // luar act, dan peringatannya menutupi peringatan yang berarti.
    act(() => {
      store.getState().setPreferensi({ textScale: 175 });
    });

    void klien.invalidateQueries();
    await waitFor(() => expect(tertahan.jumlah()).toBe(2));

    // Jawaban kedua membawa keadaan akun yang BERBEDA — hanya jawaban berbeda
    // yang bisa menimpa apa pun (`structuralSharing` menahan yang identik).
    tertahan.jawab({ ...DARI_SERVER, textScale: 90, largeTouchTargets: true });
    await waitFor(() =>
      // `null`: sesi test memakai token yang bukan JWT, jadi `idPenggunaSaatIni()`
      // mengembalikan null dan key-nya jatuh ke laci "anonim" — sama seperti
      // yang dipakai komponennya.
      expect(klien.getQueryState(accessibilityKeys.me(null))?.fetchStatus).toBe("idle"),
    );

    expect(store.getState().pilihanPengguna.textScale).toBe(175);
    // Field yang tak tersentuh pun TIDAK ikut digabungkan lagi: penggabungan
    // berjalan sekali per masuk, jadi perubahan dari perangkat lain baru
    // terlihat pada masuk atau muat ulang berikutnya — persis janji AC-1.
    // `undefined`, bukan `false`: jawaban pertama membawa `null` untuk field ini
    // ("belum diatur"), dan yang belum diatur memang tidak ditulis sama sekali.
    expect(store.getState().pilihanPengguna.largeTouchTargets).toBeUndefined();
  });

  it("akun yang belum mengatur apa pun TIDAK memadamkan akomodasi dari perangkat", async () => {
    // INI CACAT ASLI PR-036, dijepit di pohon nyata.
    //
    // Pengguna yang perangkatnya meminta kurangi-animasi, lalu masuk dengan akun
    // yang belum pernah mengatur preferensi apa pun. Sebelum migrasi 09 server
    // menjawab tujuh bawaan — termasuk `reduceMotion: false` — dan klien
    // menuliskannya sebagai pilihan, sehingga animasi menyala kembali diam-diam
    // tepat pada saat ia masuk. Sekarang jawabannya `null`, tidak ada yang
    // ditulis, dan akomodasinya bertahan.
    palsukanKurangiGerakPerangkat();
    const { store, tertahan } = renderProbe("masuk");

    tertahan.jawab(ACCESSIBILITY_PROFILE_KOSONG);
    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("150"));

    expect(store.getState().efektif().reduceMotion).toBe(true);
    expect("reduceMotion" in store.getState().pilihanPengguna).toBe(false);
  });

  it("false yang BENAR-BENAR dipilih di akun tetap menang atas sinyal perangkat", async () => {
    // Sisi lain dari test di atas, dan pasangannya yang membuat keduanya
    // bermakna: pengguna yang sengaja mematikan kurangi-animasi meski
    // perangkatnya memintanya berhak atas pilihannya sendiri di perangkat mana
    // pun. Dulu keduanya tidak bisa dibedakan sama sekali.
    palsukanKurangiGerakPerangkat();
    const { store, tertahan } = renderProbe("masuk");

    tertahan.jawab({ ...ACCESSIBILITY_PROFILE_KOSONG, reduceMotion: false });
    await waitFor(() => expect(store.getState().pilihanPengguna.reduceMotion).toBe(false));

    expect(store.getState().efektif().reduceMotion).toBe(false);
  });

  it("pengunjung yang belum masuk TIDAK ditanyakan preferensinya", async () => {
    // Tidak ada akun untuk ditanya, dan permintaannya hanya akan dijawab 401 —
    // yaitu satu galat per pemuatan halaman publik, untuk semua orang.
    const { tertahan } = renderProbe("keluar");

    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("150"));
    expect(tertahan.jumlah()).toBe(0);
  });
});

// ---------------------------------------------------------------------------

/**
 * Klien yang MENOLAK `n` permintaan pertama sebelum menahan yang berikutnya —
 * untuk menguji jalur retry TanStack (`MAKS_RETRY` = 2).
 */
function klienGagalLalu(gagalBerapaKali: number): Tertahan {
  let lepaskan: ((nilai: never) => void) | null = null;
  let jumlah = 0;

  return {
    klien: {
      request: (path: string) => {
        if (path === "/auth/refresh") return new Promise(() => {}) as Promise<never>;
        if (path === "/me/accessibility") {
          jumlah += 1;
          if (jumlah <= gagalBerapaKali) {
            return Promise.reject(
              new ApiError({ code: "JARINGAN_GAGAL", message: "Gagal" }, 0),
            ) as Promise<never>;
          }
          return new Promise<never>((resolve) => {
            lepaskan = resolve;
          });
        }
        return Promise.reject(new Error(`jalur tak terduga: ${path}`)) as Promise<never>;
      },
    },
    jumlah: () => jumlah,
    jawab: (nilai) => lepaskan?.({ data: nilai } as never),
  };
}

describe("cuplikan awal diambil sekali per masuk, bukan per percobaan", () => {
  it("suntingan selagi GET awal masih RETRY tidak tertimpa jawaban akun", async () => {
    // Cacat non-pemblokir yang tercatat di QC PR-036: `awal.current` dulu
    // dicuplik ulang pada SETIAP jalannya `queryFn`. Percobaan pertama gagal,
    // pengguna menggeser sakelar, percobaan kedua berangkat dan mencuplik ulang
    // — cuplikan barunya sudah memuat geseran itu, jadi field-nya terbaca "tidak
    // tersentuh" dan jawaban akun menimpanya. Jendelanya detik-detik pertama
    // masuk, tetapi yang hilang adalah pilihan aksesibilitas seseorang.
    useStoreSesi.setState({ status: "masuk" });
    const store = createA11yStore({ storage: memori() });
    store.getState().setPreferensi({ textScale: 150 });

    const tertahan = klienGagalLalu(1);
    render(
      <Providers
        queryClient={createQueryClient()}
        klienApi={tertahan.klien}
        a11yStore={store}
      >
        <Pengintip store={store} />
      </Providers>,
    );

    // Percobaan pertama sudah berangkat dan ditolak.
    await waitFor(() => expect(tertahan.jumlah()).toBe(1));

    // Pengguna menggeser sakelar SEBELUM percobaan kedua berangkat.
    act(() => {
      store.getState().setPreferensi({ textScale: 175 });
    });

    // Percobaan kedua (retry) berangkat, lalu dijawab akun dengan nilai LAIN.
    await waitFor(() => expect(tertahan.jumlah()).toBe(2), { timeout: 5000 });
    tertahan.jawab({ ...ACCESSIBILITY_PROFILE_KOSONG, textScale: 120 });

    // Geseran pengguna bertahan: cuplikannya diambil sebelum ia menggeser.
    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("175"));
    expect(store.getState().pilihanPengguna.textScale).toBe(175);
  });
});

describe("isolasi antar-pengguna di perangkat yang sama", () => {
  it("KELUAR membuang preferensi pengguna yang pergi", async () => {
    // Perangkat bersama — warnet, ponsel keluarga, laptop komunitas. Tanpa ini,
    // pengguna berikutnya membuka aplikasi dengan kontras tinggi, teks 175%, dan
    // mode bahasa sederhana milik orang sebelumnya. Pada produk yang preferensi
    // aksesibilitasnya menyiratkan disabilitas seseorang, itu juga membocorkan
    // sesuatu tentang orang itu.
    const { store, tertahan } = renderProbe("masuk");

    tertahan.jawab({ ...ACCESSIBILITY_PROFILE_KOSONG, highContrast: true });
    await waitFor(() => expect(store.getState().pilihanPengguna.highContrast).toBe(true));

    act(() => {
      useStoreSesi.setState({ status: "keluar" });
    });

    await waitFor(() => expect(store.getState().pilihanPengguna).toEqual({}));
  });

  it("BOOT tanpa sesi TIDAK membuang preferensi pengunjung anonim", async () => {
    // Pasangan wajib dari test di atas. `memulihkan → keluar` adalah jalur boot
    // biasa bagi setiap orang yang belum masuk; membuang preferensi di sana
    // berarti pengguna yang menyetel kontras tinggi sebelum pernah punya akun
    // kehilangannya pada SETIAP muat ulang. Pembersihan hanya sah pada peralihan
    // "masuk" → "keluar" yang sungguhan.
    const { store } = renderProbe("keluar");

    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("150"));
    expect(store.getState().pilihanPengguna.textScale).toBe(150);
  });

  it("pengguna berikutnya menarik preferensinya sendiri, bukan sisa yang sebelumnya", async () => {
    const { store, tertahan } = renderProbe("masuk");

    tertahan.jawab({ ...ACCESSIBILITY_PROFILE_KOSONG, textScale: 120 });
    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("120"));

    act(() => {
      useStoreSesi.setState({ status: "keluar" });
    });
    await waitFor(() => expect(store.getState().pilihanPengguna).toEqual({}));

    // Pengguna kedua masuk di tab yang sama: penggabungan HARUS dipersenjatai
    // ulang, jika tidak akun kedua tidak pernah menarik preferensinya sendiri.
    act(() => {
      useStoreSesi.setState({ status: "masuk" });
    });
    await waitFor(() => expect(tertahan.jumlah()).toBe(2));
    tertahan.jawab({ ...ACCESSIBILITY_PROFILE_KOSONG, textScale: 200 });

    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("200"));
  });
});
