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
import { ACCESSIBILITY_DEFAULTS, type AccessibilityPreferences } from "@nawasena/schemas";
import { createA11yStore, type A11yStore, type PenyimpananA11y } from "@nawasena/a11y";
import { accessibilityKeys, type ApiClient } from "@nawasena/api-client";
import { Providers } from "../src/app/providers.js";
import { createQueryClient } from "../src/app/query-client.js";
import { gabungkanDariServer } from "../src/app/penyedia-a11y.js";
import { useStoreSesi } from "../src/shared/sesi/store.js";

const DARI_SERVER: AccessibilityPreferences = {
  ...ACCESSIBILITY_DEFAULTS,
  textScale: 120,
  highContrast: true,
};

describe("gabungkanDariServer — aturan per field", () => {
  it("field yang tidak tersentuh mengambil nilai akun", () => {
    const hasil = gabungkanDariServer(DARI_SERVER, {}, {}, {});

    expect(hasil.textScale).toBe(120);
    expect(hasil.highContrast).toBe(true);
  });

  it("field yang DIUBAH pengguna di tengah jalan tetap memakai nilai lokal", () => {
    // Pengguna sudah MELIHAT perubahannya berlaku, dan PUT-nya sudah berangkat.
    // Menimpanya dengan jawaban yang berangkat lebih dulu berarti layar berubah
    // sendiri kembali ke nilai yang barusan ia tinggalkan.
    const hasil = gabungkanDariServer(DARI_SERVER, { textScale: 150 }, { textScale: 175 }, {});

    expect(hasil.textScale).toBeUndefined();
    // Tetangganya yang tidak disentuh TETAP diperbarui — penolakannya per
    // field, bukan per profil.
    expect(hasil.highContrast).toBe(true);
  });

  it("nilai lokal yang KEBETULAN sama dengan saat berangkat tetap diperbarui", () => {
    // "Tersentuh" berarti berubah, bukan pernah ada. Field yang sudah bernilai
    // sama sejak awal tidak sedang diperebutkan siapa pun.
    const hasil = gabungkanDariServer(DARI_SERVER, { textScale: 150 }, { textScale: 150 }, {});

    expect(hasil.textScale).toBe(120);
  });

  it("mencakup KETUJUH field, bukan sebagian", () => {
    // Field yang terlewat tidak pernah tersinkron antar-perangkat, dan
    // ketiadaannya tidak menimbulkan satu pun gejala di perangkat yang sedang
    // dipakai.
    expect(Object.keys(gabungkanDariServer(DARI_SERVER, {}, {}, {})).sort()).toEqual(
      Object.keys(ACCESSIBILITY_DEFAULTS).sort(),
    );
  });
});

// ---------------------------------------------------------------------------

// Server SELALU menjawab tujuh nilai konkret — akun baru diberi baris berisi
// ACCESSIBILITY_DEFAULTS sejak pendaftaran — jadi nilai server yang KEBETULAN
// sama dengan bawaan tidak membuktikan apa pun tentang pilihan pengguna.
// Menuliskannya apa adanya akan memadamkan akomodasi yang diminta OS bagi
// setiap orang yang tak pernah menyentuh sakelarnya. Hanya `highContrast` dan
// `reduceMotion` yang terkena: hanya keduanya yang punya sinyal OS.
describe("gabungkanDariServer — penjaga sinyal OS", () => {
  it("nilai server berbentuk bawaan TIDAK ditulis bila sinyal OS bertentangan", () => {
    // `reduceMotion` server = false = bawaan, sementara perangkat ini meminta
    // animasi dikurangi. Kuncinya dilewatkan supaya `pilihanPengguna` tetap
    // kosong dan `rekonsiliasi()` jatuh ke tingkat OS.
    const hasil = gabungkanDariServer(DARI_SERVER, {}, {}, { reduceMotion: true });

    // BUKAN sekadar `toBeUndefined()`: kunci yang HADIR dengan nilai
    // `undefined` juga lolos pemeriksaan itu, padahal `setPreferensi` men-
    // spread objek ini apa adanya. Yang harus dibuktikan adalah OMISI kuncinya
    // — persis yang membedakan cabang 2 (lewati) dari cabang lain (tulis).
    expect(hasil.reduceMotion).toBeUndefined();
    expect("reduceMotion" in hasil).toBe(false);
    // Field lain tetap tersinkron — penjaganya per field.
    expect(hasil.textScale).toBe(120);
  });

  it("nilai server yang MENYIMPANG dari bawaan tetap menang atas sinyal OS", () => {
    const dariServer: AccessibilityPreferences = { ...DARI_SERVER, reduceMotion: true };
    const hasil = gabungkanDariServer(dariServer, {}, {}, { reduceMotion: true });

    expect(hasil.reduceMotion).toBe(true);
  });

  it("sinyal OS yang menolak TIDAK membatalkan pilihan eksplisit dari akun", () => {
    // `highContrast` server = true (menyimpang dari bawaan → bukti pilihan),
    // OS bilang tidak perlu. Yang dipilih pengguna menang, dan arah gagalnya
    // sengaja memihak akomodasi yang MENYALA.
    const hasil = gabungkanDariServer(DARI_SERVER, {}, {}, { highContrast: false });

    expect(hasil.highContrast).toBe(true);
  });

  it("tanpa sinyal OS, nilai bawaan dari akun TETAP ditulis", () => {
    // Inilah yang menjaga AC-1 untuk kedua field ini: mengembalikan sakelar ke
    // posisi mati di satu perangkat harus mendarat di perangkat lain yang tidak
    // punya pendapat OS yang bertentangan.
    const hasil = gabungkanDariServer(DARI_SERVER, {}, {}, {});

    expect(hasil.reduceMotion).toBe(false);
    expect("reduceMotion" in hasil).toBe(true);
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
  jawab: (nilai: AccessibilityPreferences) => void;
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
      expect(klien.getQueryState(accessibilityKeys.me())?.fetchStatus).toBe("idle"),
    );

    expect(store.getState().pilihanPengguna.textScale).toBe(175);
    // Field yang tak tersentuh pun TIDAK ikut digabungkan lagi: penggabungan
    // berjalan sekali per masuk, jadi perubahan dari perangkat lain baru
    // terlihat pada masuk atau muat ulang berikutnya — persis janji AC-1.
    expect(store.getState().pilihanPengguna.largeTouchTargets).toBe(false);
  });

  it("sinyal OS sudah terbaca saat jawaban akun tiba", async () => {
    // Penjaga sinyal OS bergantung pada `store.os` yang SUDAH terisi ketika
    // penggabungan berjalan. Keempat test murni di atas menyuapkan `os` dengan
    // tangan, jadi hanya pohon nyata yang bisa membuktikan urutannya. Bila
    // urutan itu rusak, cabang 3 menulis `reduceMotion: false` dan akomodasi
    // yang diminta perangkat padam diam-diam saat masuk — persis cacat yang
    // penjaga ini ada untuk mencegahnya.
    palsukanKurangiGerakPerangkat();
    const { store, tertahan } = renderProbe("masuk");

    // Akun baru: tujuh nilai bawaan, termasuk `reduceMotion: false`.
    tertahan.jawab(ACCESSIBILITY_DEFAULTS);
    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("100"));

    expect(store.getState().efektif().reduceMotion).toBe(true);
    expect("reduceMotion" in store.getState().pilihanPengguna).toBe(false);
  });

  it("pengunjung yang belum masuk TIDAK ditanyakan preferensinya", async () => {
    // Tidak ada akun untuk ditanya, dan permintaannya hanya akan dijawab 401 —
    // yaitu satu galat per pemuatan halaman publik, untuk semua orang.
    const { tertahan } = renderProbe("keluar");

    await waitFor(() => expect(screen.getByTestId("skala")).toHaveTextContent("150"));
    expect(tertahan.jumlah()).toBe(0);
  });
});
