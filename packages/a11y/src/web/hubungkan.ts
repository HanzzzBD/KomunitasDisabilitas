// Menyambungkan store ke DOM dan ke setelan OS.
//
// Bebas React dengan sengaja: `subscribe` milik Zustand bukan API React, dan
// menaruh glue ini di paket berarti AC "perubahan store langsung mengubah token
// DOM" bisa diuji tanpa merender satu komponen pun. Integrasi `apps/web`
// (PR-026c) tinggal memanggil satu fungsi.
import type { A11yStore } from "../store.js";
import { terapkanToken } from "./token.js";
import { bacaSinyalOS, pantauSinyalOS, type JendelaMedia } from "./os.js";

export interface OpsiHubungkan {
  store: A11yStore;
  /** Produksi: `document.documentElement`. */
  elemen: HTMLElement;
  /** Produksi: `window`. */
  jendela: JendelaMedia;
}

/**
 * Pasang sambungan dua arah dan terapkan keadaan awal.
 *
 * Urutannya penting dan tidak boleh ditukar:
 *
 *   1. baca OS lalu masukkan ke store — sebelum ini, `efektif()` menghitung
 *      tanpa tahu apa pun tentang perangkat;
 *   2. terapkan token sekali, supaya layar benar SEBELUM interaksi pertama;
 *   3. baru berlangganan perubahan.
 *
 * Terbalik, akan ada satu frame ketika layar memakai bawaan alih-alih setelan
 * pengguna — kedipan yang paling terasa justru bagi pengguna yang paling
 * membutuhkan setelan itu.
 *
 * Mengembalikan fungsi pembatalan yang melepas SEMUA langganan.
 */
export function hubungkanKeDom(opsi: OpsiHubungkan): () => void {
  const { store, elemen, jendela } = opsi;

  store.getState().setSinyalOS(bacaSinyalOS(jendela));
  terapkanToken(elemen, store.getState().efektif());

  // Zustand memanggil listener pada SETIAP perubahan state, termasuk yang tidak
  // memengaruhi tampilan. Menulis token yang sama berulang kali murah (browser
  // mengabaikan penulisan atribut bernilai sama), jadi tidak ada penyaringan di
  // sini — penyaringan yang salah jauh lebih mahal daripada penulisan berlebih.
  const lepasStore = store.subscribe(() => {
    terapkanToken(elemen, store.getState().efektif());
  });

  const lepasOS = pantauSinyalOS(jendela, (sinyal) => {
    // Cukup perbarui store; langganan di atas yang menuliskannya ke DOM.
    // Menulis token langsung dari sini akan membuat DUA jalur penulisan yang
    // bisa menghasilkan keadaan berbeda.
    store.getState().setSinyalOS(sinyal);
  });

  return () => {
    lepasStore();
    lepasOS();
  };
}
