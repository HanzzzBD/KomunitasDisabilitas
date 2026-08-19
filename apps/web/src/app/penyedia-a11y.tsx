// Menyambungkan store preferensi ke aplikasi.
//
// Tipis dengan sengaja: seluruh aturan tinggal di `@nawasena/a11y` (PR-026a/b),
// dan berkas ini hanya menghubungkan store ke DOM nyata, ke `window` nyata, dan
// ke mode bahasa i18n.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createA11yStore, type A11yStore } from "@nawasena/a11y";
import { hubungkanKeDom } from "@nawasena/a11y/web";
import { useModeBahasa } from "../shared/i18n/index.js";

/**
 * Store untuk lingkungan browser.
 *
 * `localStorage` disuntikkan DI SINI, bukan di dalam paket — itulah yang
 * membuat inti `@nawasena/a11y` tetap bisa dipakai mobile (SDD §4.2). Akses
 * lewat `globalThis` dengan optional chaining: mode privat sebagian browser
 * melempar saat `localStorage` disentuh, dan preferensi yang gagal disimpan
 * tidak boleh menghalangi aplikasi terbuka.
 */
export function buatStoreWeb(): A11yStore {
  return createA11yStore({
    storage: {
      getItem: (k) => {
        try {
          return globalThis.localStorage?.getItem(k) ?? null;
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        try {
          globalThis.localStorage?.setItem(k, v);
        } catch {
          /* penyimpanan penuh atau diblokir — preferensi tetap berlaku sesi ini */
        }
      },
      removeItem: (k) => {
        try {
          globalThis.localStorage?.removeItem(k);
        } catch {
          /* sama seperti di atas */
        }
      },
    },
  });
}

const KonteksA11yStore = createContext<A11yStore | null>(null);

export function PenyediaA11y({ store, children }: { store: A11yStore; children: ReactNode }) {
  useEffect(() => {
    // Skrip pra-paint sudah menulis token yang sama sebelum React ada; panggilan
    // ini menuliskannya lagi dengan nilai identik, lalu mengambil alih pembaruan
    // berikutnya. Penulisan ulang bernilai sama tidak menimbulkan kedipan —
    // browser mengabaikannya.
    return hubungkanKeDom({ store, elemen: document.documentElement, jendela: window });
  }, [store]);

  return <KonteksA11yStore.Provider value={store}>{children}</KonteksA11yStore.Provider>;
}

/**
 * Store preferensi untuk kode fitur yang perlu MENULIS, bukan sekadar terkena
 * akibatnya.
 *
 * Sampai PR-035 tidak ada yang membutuhkannya: preferensi hanya dibaca lewat
 * `<html>` (token CSS) dan lewat `SambungkanBahasa`, yang menerima store-nya
 * sebagai prop dari `Providers` — jalur yang tidak terjangkau komponen route
 * mana pun. Wizard onboarding adalah pemakai pertama yang harus menulis
 * (`setPreferensi`) ke instance yang SAMA dengan yang menggerakkan DOM;
 * membuat store kedua akan menghasilkan kendali yang tampak tidak berfungsi.
 *
 * Melempar bila dipakai di luar penyedianya, bukan mengembalikan null —
 * alasannya sama persis dengan `useKlienApi()`: nilai null menyebar sebagai
 * `undefined` sampai ke tempat yang jauh dari sebabnya.
 */
export function useA11yStoreWeb(): A11yStore {
  const store = useContext(KonteksA11yStore);
  if (store === null) {
    throw new Error("useA11yStoreWeb dipakai di luar <PenyediaA11y>. Pasang di tumpukan provider.");
  }
  return store;
}

/**
 * Menyambungkan preferensi `simpleLanguage` ke mode bahasa i18n.
 *
 * Komponen terpisah karena ia HARUS berada di dalam `PenyediaI18n`, sementara
 * store-nya dibuat di luar. Merender `null` — ia kabel, bukan tampilan.
 *
 * Arahnya SATU: preferensi → i18n. Mode bahasa bukan sumber kebenaran kedua,
 * ia turunan. Menyambungkannya dua arah akan melahirkan dua tempat yang
 * sama-sama mengklaim tahu bahasa mana yang sedang dipakai.
 */
export function SambungkanBahasa({ store }: { store: A11yStore }) {
  const { mode, setMode } = useModeBahasa();

  useEffect(() => {
    const terapkan = () => {
      const diinginkan = store.getState().efektif().simpleLanguage ? "id-simple" : "id";
      // Bandingkan sebelum menyetel: `setMode` tanpa syarat akan merender ulang
      // seluruh pohon pada setiap perubahan preferensi apa pun, termasuk yang
      // tidak ada hubungannya dengan bahasa.
      if (diinginkan !== mode) setMode(diinginkan);
    };

    terapkan();
    return store.subscribe(terapkan);
  }, [store, mode, setMode]);

  return null;
}
