// Menyambungkan store preferensi ke aplikasi.
//
// Tipis dengan sengaja: seluruh aturan tinggal di `@nawasena/a11y` (PR-026a/b),
// dan berkas ini hanya menghubungkan store ke DOM nyata, ke `window` nyata, ke
// mode bahasa i18n, dan — sejak PR-036 — ke preferensi yang tersimpan di akun.
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createA11yStore, type A11yStore } from "@nawasena/a11y";
import { hubungkanKeDom } from "@nawasena/a11y/web";
import { accessibilityKeys, getAccessibility } from "@nawasena/api-client";
import {
  ACCESSIBILITY_KEYS,
  type AccessibilityProfile,
  type UpdateAccessibilityPreferences,
} from "@nawasena/schemas";
import { idPenggunaSaatIni } from "../features/onboarding/index.js";
import { useModeBahasa } from "../shared/i18n/index.js";
import { useStoreSesi } from "../shared/sesi/store.js";
import { useKlienApi } from "./klien-api.js";

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

/**
 * Gabungkan preferensi dari akun ke pilihan lokal — inti aturan "server menang,
 * lokal hanya untuk cat pertama" (ADR-008, AC-6 PR-036).
 *
 * FUNGSI MURNI, dan itu satu-satunya alasan ia berdiri sendiri: perlombaan yang
 * ditanganinya (pengguna menggeser sakelar SEMENTARA permintaannya masih di
 * jalan) mustahil diuji andal lewat komponen — ia menuntut pengendalian waktu
 * sampai ke milidetik. Sebagai data masuk → data keluar, ia bisa diuji apa
 * adanya.
 *
 * ATURANNYA PER FIELD, bukan per profil. Menimpa seluruh profil berarti
 * membuang perubahan yang baru saja dibuat pengguna di layar — perubahan yang
 * sudah ia LIHAT berlaku, dan yang PUT-nya sudah dalam perjalanan. Yang diambil
 * dari server karena itu hanya field yang TIDAK tersentuh sejak permintaannya
 * berangkat: `sebelum` adalah cuplikan saat berangkat, `sekarang` keadaan saat
 * jawabannya tiba.
 *
 * `null` DARI SERVER BERARTI "BELUM DIATUR", DAN FIELD ITU TIDAK DITULIS.
 * Sejak migrasi 09 profil akun bisa menyatakan ketiadaan pilihan apa adanya,
 * jadi aturannya kini sesederhana kenyataannya: ada nilai → itu pilihan yang
 * pernah ditegaskan pengguna (di perangkat mana pun), tulis; `null` → tidak ada
 * pilihan, jangan sentuh, biarkan `rekonsiliasi()` turun ke sinyal OS lalu ke
 * bawaan.
 *
 * INI MENGGANTIKAN `gabungkanFieldOS` dan menutup DUA BATAS yang dulu diterima
 * sadar, keduanya akibat langsung server yang selalu menjawab nilai konkret:
 * - field bernilai bawaan tidak lagi MEMAKU apa pun, jadi perubahan setelan OS
 *   sesudah login kembali berlaku untuk field yang belum pernah dipilih;
 * - `false` yang benar-benar dipilih pengguna kini terkirim sebagai `false`
 *   (bukan `null`), jadi ia menang atas sinyal OS yang bertentangan dan reset
 *   `true → false` di perangkat A benar-benar mendarat di perangkat B.
 * Tebakan "nilai == bawaan, mungkin bukan pilihan" tidak diperlukan lagi, dan
 * karena itu dihapus — bukan dilonggarkan.
 *
 * Ditulis tujuh baris eksplisit alih-alih perulangan atas kunci: hanya bentuk
 * ini yang membuat `typecheck` ikut menjaga kecocokan tipe tiap field, dan
 * field baru di skema tidak bisa lolos diam-diam tanpa diputuskan di sini.
 */
export function gabungkanDariServer(
  server: AccessibilityProfile,
  sebelum: UpdateAccessibilityPreferences,
  sekarang: UpdateAccessibilityPreferences,
): UpdateAccessibilityPreferences {
  const hasil: UpdateAccessibilityPreferences = {};
  if (sekarang.textScale === sebelum.textScale && server.textScale !== null) {
    hasil.textScale = server.textScale;
  }
  if (sekarang.highContrast === sebelum.highContrast && server.highContrast !== null) {
    hasil.highContrast = server.highContrast;
  }
  if (sekarang.reduceMotion === sebelum.reduceMotion && server.reduceMotion !== null) {
    hasil.reduceMotion = server.reduceMotion;
  }
  if (sekarang.simpleLanguage === sebelum.simpleLanguage && server.simpleLanguage !== null) {
    hasil.simpleLanguage = server.simpleLanguage;
  }
  if (sekarang.largeTouchTargets === sebelum.largeTouchTargets && server.largeTouchTargets !== null) {
    hasil.largeTouchTargets = server.largeTouchTargets;
  }
  if (
    sekarang.prefersSignLanguage === sebelum.prefersSignLanguage &&
    server.prefersSignLanguage !== null
  ) {
    hasil.prefersSignLanguage = server.prefersSignLanguage;
  }
  if (sekarang.screenReaderHint === sebelum.screenReaderHint && server.screenReaderHint !== null) {
    hasil.screenReaderHint = server.screenReaderHint;
  }
  return hasil;
}

/**
 * Menarik preferensi milik akun begitu pengguna masuk, lalu menuliskannya ke
 * store — PEMAKAI PERTAMA `getAccessibility()` di seluruh repo ini.
 *
 * Komponen, bukan hook di `Providers`, dengan alasan yang sama seperti
 * `SambungkanBahasa`: ia butuh berada DI DALAM `PenyediaKlienApi`, sementara
 * store-nya dibuat di luar. Merender `null` — ia kabel, bukan tampilan.
 *
 * `status === "masuk"` sebagai syarat, bukan "sekali saat mount": status itu
 * menyala pada login OTP/Google MAUPUN pada pemulihan sesi saat boot, yaitu
 * tepat dua saat ketika "preferensi akun ini" mulai punya arti. Sebelum itu
 * tidak ada akun untuk ditanyakan, dan permintaannya hanya akan dijawab 401.
 *
 * TIDAK ADA KEDIPAN, dan itu bukan kebetulan. Nilai lokal sudah tergambar
 * sebelum React ada (skrip pra-paint, PR-026c) dan tetap terpasang sepanjang
 * permintaan ini berjalan; yang berubah saat jawabannya tiba hanyalah field
 * yang memang berbeda. Layar tidak pernah melewati keadaan "bawaan".
 *
 * Kegagalannya SENGAJA TIDAK ditampilkan di mana pun. Pengguna tidak meminta
 * apa pun di sini, preferensi lokalnya tetap berlaku, dan pesan galat yang
 * muncul sendiri di layar mana pun yang kebetulan sedang dibuka adalah gangguan
 * tanpa tindakan yang bisa diambil. Panel preferensi (`PanelAksesibilitas`)
 * yang menampilkan galat, sebab di sanalah pengguna benar-benar meminta sesuatu.
 */
export function SambungkanServer({ store }: { store: A11yStore }) {
  const klien = useKlienApi();
  const klienQuery = useQueryClient();
  const status = useStoreSesi((s) => s.status);

  // Cuplikan pilihan pengguna PADA SAAT permintaan berangkat. Ref, bukan state:
  // ia tidak dirender, dan menjadikannya state akan merender ulang seluruh
  // pohon setiap kali permintaan dimulai.
  const awal = useRef<UpdateAccessibilityPreferences>({});

  // Penggabungan berjalan SEKALI PER MASUK, bukan sekali per permintaan.
  //
  // Query yang sama bisa dijalankan ulang tanpa diminta siapa pun:
  // `refetchOnReconnect` bawaan TanStack v5 bernilai true, dan "Coba lagi" di
  // banner luring memanggil `invalidateQueries()` tanpa pandang bulu. Setiap
  // jalan ulang mencuplik `awal.current` LAGI, sehingga sakelar yang baru
  // digeser pengguna — yang PUT-nya belum mendarat di akun — terbaca "tidak
  // tersentuh" lalu ditimpa nilai akun yang belum memuatnya.
  //
  // Yang ditutup di sini kelasnya, bukan gejalanya: tidak satu pun AC menuntut
  // penggabungan ulang. AC-6 berbunyi "nilai server menang SAAT MASUK", dan e2e
  // AC-1 memuat ulang perangkat B untuk melihat perubahan dari perangkat A.
  // Mematikan `refetchOnReconnect` saja tidak cukup — `invalidateQueries()`
  // menjangkau query ini juga — jadi penjaganya dipasang pada penggabungannya,
  // satu tempat yang menutup SEMUA pemicu sekaligus dan tidak menambah
  // pembukuan perlombaan baru.
  //
  // AKIBATNYA DISADARI: perubahan dari perangkat lain tidak lagi menyusul di
  // tengah sesi, ia baru terlihat pada masuk atau muat ulang berikutnya. Itu
  // persis yang dijanjikan AC-1, tidak kurang.
  const sudahDigabung = useRef(false);

  // Cuplikan diambil SEKALI per masuk, bukan sekali per permintaan.
  //
  // Ref terpisah dari `sudahDigabung` dengan sengaja: sebuah GET yang gagal lalu
  // diulang (retry TanStack, 2×) menjalankan `queryFn` lagi SEBELUM penggabungan
  // pertama terjadi, sehingga syarat `!sudahDigabung.current` saja masih
  // membiarkan percobaan kedua mencuplik ulang. Pengguna yang menggeser sakelar
  // selagi GET awalnya masih berputar akan kehilangan geseran itu, sebab
  // cuplikan barunya sudah memuatnya dan ia jadi terbaca "tidak tersentuh".
  // Jendelanya sempit — detik-detik pertama masuk — tapi jendela sempit yang
  // membuang pilihan aksesibilitas seseorang tetap membuangnya.
  const sudahDicuplik = useRef(false);

  // `sub` pemilik sesi yang SEDANG berjalan, disimpan supaya masih ada saat
  // logout: pada saat `status` menjadi "keluar", tokennya sudah dibuang dan
  // `idPenggunaSaatIni()` mengembalikan null — padahal justru saat itulah kita
  // perlu tahu cache siapa yang harus dibuang.
  const subAktif = useRef<string | null>(null);
  const statusSebelumnya = useRef(status);

  const sub = status === "masuk" ? idPenggunaSaatIni() : null;
  if (status === "masuk" && sub !== null) subAktif.current = sub;

  // Masuk yang BERIKUTNYA berhak digabungkan lagi. Tanpa pengembalian ini, akun
  // kedua di perangkat yang sama tidak akan pernah menarik preferensinya.
  useEffect(() => {
    if (status !== "masuk") {
      sudahDigabung.current = false;
      sudahDicuplik.current = false;
    }

    // KELUAR YANG SUNGGUHAN — hanya peralihan "masuk" → "keluar", bukan boot.
    //
    // Tanpa syarat peralihan itu, setiap kali aplikasi dibuka tanpa sesi
    // ("memulihkan" → "keluar") preferensi pengguna anonim ikut terhapus, dan
    // orang yang mengatur kontras tinggi sebelum pernah punya akun akan
    // kehilangannya pada setiap muat ulang.
    //
    // Yang dibuang DUA-DUANYA, sebab keduanya menyimpan preferensi orang yang
    // baru saja pergi: entri cache TanStack miliknya, dan `pilihanPengguna` di
    // `localStorage`. Yang kedua itu yang membuat perangkat bersama — warnet,
    // ponsel keluarga, laptop komunitas — menyerahkan kontras, skala teks, dan
    // mode bahasa sederhana milik pengguna sebelumnya kepada pengguna
    // berikutnya. Pada produk yang preferensinya menyiratkan disabilitas
    // seseorang, itu bukan sekadar setelan yang salah.
    if (statusSebelumnya.current === "masuk" && status === "keluar") {
      const subKeluar = subAktif.current;
      subAktif.current = null;
      klienQuery.removeQueries({ queryKey: accessibilityKeys.me(subKeluar) });
      for (const kunci of ACCESSIBILITY_KEYS) store.getState().hapusPilihan(kunci);
    }
    statusSebelumnya.current = status;
  }, [status, store, klienQuery]);

  const { data } = useQuery({
    // Key DILINGKUPI `sub`: pengguna B tidak bisa membaca entri milik A karena
    // keduanya bukan key yang sama, bukan karena ada kode yang ingat
    // membersihkannya.
    queryKey: accessibilityKeys.me(sub),
    queryFn: () => {
      if (!sudahDicuplik.current) {
        sudahDicuplik.current = true;
        awal.current = store.getState().pilihanPengguna;
      }
      return getAccessibility(klien);
    },
    enabled: status === "masuk",
  });

  useEffect(() => {
    if (data === undefined) return;
    if (sudahDigabung.current) return;
    sudahDigabung.current = true;
    const gabungan = gabungkanDariServer(data, awal.current, store.getState().pilihanPengguna);
    // `setPreferensi` menulis ke tingkat "pilihan pengguna" (ADR-008), BUKAN ke
    // tingkat baru: nilai yang tersimpan di akun memang pilihan yang pernah
    // ditegaskan pengguna, hanya di perangkat lain. Tingkat keempat hanya akan
    // menambah aturan menang di paket yang dipakai bersama mobile tanpa satu
    // pun perbedaan perilaku. Field yang `null` di akun tidak ikut masuk ke
    // `gabungan` sama sekali, jadi tingkat OS tetap terjangkau untuknya.
    store.getState().setPreferensi(gabungan);
  }, [data, store]);

  return null;
}
