// AC PR-026: "Persist selamat dari refresh + migrasi versi teruji."
//
// Nilai tersimpan hidup di perangkat pengguna berbulan-bulan dan tidak bisa
// dimigrasikan dari server. Ia juga bisa disunting tangan, disalin antar-profil
// browser, atau ditinggalkan versi lama aplikasi. Karena itu yang diuji di sini
// bukan jalur bahagianya, melainkan apa yang terjadi saat isinya TIDAK seperti
// yang kita harapkan.
import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import {
  KUNCI_PENYIMPANAN,
  VERSI_STORE,
  bersihkanTersimpan,
  createA11yStore,
} from "../src/store.js";

/** Penyimpanan di memori — pengganti localStorage/AsyncStorage saat test. */
function memori(awal: Record<string, string> = {}): StateStorage & { isi: Record<string, string> } {
  const isi = { ...awal };
  return {
    isi,
    getItem: (k) => isi[k] ?? null,
    setItem: (k, v) => {
      isi[k] = v;
    },
    removeItem: (k) => {
      delete isi[k];
    },
  };
}

const tersimpan = (state: unknown, version = VERSI_STORE) => JSON.stringify({ state, version });

describe("store — dasar", () => {
  it("mulai tanpa pilihan apa pun, efektif = bawaan", () => {
    const s = createA11yStore({ storage: memori() });
    expect(s.getState().pilihanPengguna).toEqual({});
    expect(s.getState().efektif().reduceMotion).toBe(false);
  });

  it("setPreferensi menggabung, bukan menimpa seluruhnya", () => {
    const s = createA11yStore({ storage: memori() });
    s.getState().setPreferensi({ reduceMotion: true });
    s.getState().setPreferensi({ textScale: 150 });

    expect(s.getState().pilihanPengguna).toEqual({ reduceMotion: true, textScale: 150 });
  });

  it("hapusPilihan MENGHAPUS kunci, tidak menyetelnya ke false", () => {
    // Menyetel `false` berarti "pengguna memilih tidak" — dan itu memblokir
    // sinyal OS selamanya, persis kebalikan dari maksud tombol "ikuti perangkat".
    const s = createA11yStore({ storage: memori() });
    s.getState().setPreferensi({ reduceMotion: true });
    s.getState().setSinyalOS({ reduceMotion: true });

    s.getState().hapusPilihan("reduceMotion");

    expect("reduceMotion" in s.getState().pilihanPengguna).toBe(false);
    // Sinyal OS kembali berlaku.
    expect(s.getState().efektif().reduceMotion).toBe(true);
  });

  it("sinyal OS TIDAK ikut disimpan", () => {
    // Ia keadaan perangkat, bukan pilihan pengguna. Menyimpannya berarti
    // membawa setelan laptop kantor ke ponsel pribadi lewat sinkronisasi profil.
    const st = memori();
    const s = createA11yStore({ storage: st });
    s.getState().setSinyalOS({ reduceMotion: true });
    s.getState().setPreferensi({ textScale: 120 });

    expect(st.isi[KUNCI_PENYIMPANAN]).toContain("textScale");
    expect(st.isi[KUNCI_PENYIMPANAN]).not.toContain("reduceMotion");
  });
});

describe("store — bertahan melintasi muat ulang", () => {
  it("pilihan pengguna kembali setelah store dibuat ulang", () => {
    const st = memori();
    createA11yStore({ storage: st }).getState().setPreferensi({ textScale: 175 });

    // Store kedua = simulasi refresh halaman.
    expect(createA11yStore({ storage: st }).getState().pilihanPengguna.textScale).toBe(175);
  });
});

describe("store — migrasi & state rusak", () => {
  it("versi LEBIH LAMA dibersihkan lewat skema, bukan dipercaya", () => {
    const st = memori({
      [KUNCI_PENYIMPANAN]: tersimpan({ pilihanPengguna: { textScale: 150 } }, 0),
    });
    expect(createA11yStore({ storage: st }).getState().pilihanPengguna).toEqual({ textScale: 150 });
  });

  it("versi LEBIH BARU dibuang, bukan ditebak", () => {
    // Pengguna membuka versi lama aplikasi setelah memakai yang baru. Menebak
    // bentuk masa depan adalah cara paling andal merusak preferensi seseorang.
    const st = memori({
      [KUNCI_PENYIMPANAN]: tersimpan({ pilihanPengguna: { textScale: 150 } }, VERSI_STORE + 1),
    });
    expect(createA11yStore({ storage: st }).getState().pilihanPengguna).toEqual({});
  });

  it("nilai di luar rentang dibuang, sisanya SELAMAT", () => {
    // Membuang SEMUA preferensi karena satu field rusak berarti menghukum
    // pengguna atas kesalahan yang bukan miliknya.
    const st = memori({
      [KUNCI_PENYIMPANAN]: tersimpan({
        pilihanPengguna: { textScale: 9999, reduceMotion: true },
      }),
    });
    const p = createA11yStore({ storage: st }).getState().pilihanPengguna;

    expect(p.textScale).toBeUndefined();
    expect(p.reduceMotion).toBe(true);
  });

  it("field asing ditolak — tidak bisa menyelundup lewat localStorage", () => {
    const st = memori({
      [KUNCI_PENYIMPANAN]: tersimpan({
        pilihanPengguna: { reduceMotion: true, admin: true, __proto__: { jahat: 1 } },
      }),
    });
    const p = createA11yStore({ storage: st }).getState().pilihanPengguna as Record<string, unknown>;

    expect(p.reduceMotion).toBe(true);
    expect(p.admin).toBeUndefined();
  });

  it("state rusak total tidak menjatuhkan aplikasi", () => {
    for (const rusak of ["bukan json", tersimpan(null), tersimpan("teks"), tersimpan([1, 2])]) {
      const st = memori({ [KUNCI_PENYIMPANAN]: rusak });
      expect(() => createA11yStore({ storage: st }).getState().efektif()).not.toThrow();
    }
  });
});

describe("bersihkanTersimpan", () => {
  it("menerima bentuk terbungkus maupun telanjang", () => {
    expect(bersihkanTersimpan({ pilihanPengguna: { textScale: 120 } })).toEqual({ textScale: 120 });
    expect(bersihkanTersimpan({ textScale: 120 })).toEqual({ textScale: 120 });
  });

  it("bukan objek → kosong", () => {
    expect(bersihkanTersimpan(null)).toEqual({});
    expect(bersihkanTersimpan("teks")).toEqual({});
    expect(bersihkanTersimpan(42)).toEqual({});
  });
});
