// Klien API aplikasi web — merakit `@nawasena/api-client` (PR-005/PR-018b)
// dengan store sesi (PR-030a).
//
// Perakitannya melingkar, dan itu bukan kecelakaan: klien butuh hook `refresh`,
// sementara hook refresh butuh klien untuk memanggil `/auth/refresh`. Simpulnya
// dibuka lewat satu variabel yang diisi belakangan — bukan dengan membuat dua
// klien, sebab klien kedua akan punya konfigurasi sendiri yang bebas menyimpang.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createApiClient,
  createSessionRefresher,
  refreshSession,
  type ApiClient,
} from "@nawasena/api-client";
import { ambilTokenAkses, useStoreSesi } from "../shared/sesi/store.js";

/**
 * Bawaannya RELATIF (`/api/v1`), bukan alamat lengkap, dan itu penting.
 *
 * Refresh token web hidup di cookie HttpOnly. Cookie hanya ikut terkirim ke
 * asal yang sama; begitu API dipanggil di host lain, cookie-nya tidak
 * dilampirkan dan sesi tidak pernah bisa dipulihkan — gejalanya "selalu
 * terlempar ke halaman masuk setiap reload", yang menyesatkan karena tokennya
 * sendiri baik-baik saja.
 */
const BASE_URL_BAWAAN = "/api/v1";

export function buatKlienApi(opsi: { baseUrl?: string; fetch?: typeof globalThis.fetch } = {}) {
  let segarkan: (() => Promise<boolean>) | null = null;

  const klien = createApiClient({
    baseUrl: opsi.baseUrl ?? BASE_URL_BAWAAN,
    // Fungsi, bukan nilai: token berganti tiap ~15 menit, dan klien harus
    // membaca yang TERBARU pada tiap permintaan.
    getAccessToken: ambilTokenAkses,
    refresh: () => segarkan?.() ?? false,
    fetch: opsi.fetch,
  });

  segarkan = createSessionRefresher({
    client: klien,
    onAccessToken: (token) => useStoreSesi.getState().perbarui(token),
    // `getRefreshToken` sengaja TIDAK diberikan: di web tokennya ada di cookie
    // HttpOnly yang dilampirkan browser sendiri dan memang tidak terbaca
    // JavaScript. Mobile-lah yang menyediakannya (PR-089).
    onSessionEnded: () => useStoreSesi.getState().keluar(),
  });

  return klien;
}

/** Pemulihan yang sedang berjalan per klien; lihat catatan di `pulihkanSesi`. */
const pemulihanBerjalan = new WeakMap<ApiClient, Promise<void>>();

/**
 * Coba pulihkan sesi dari cookie refresh saat aplikasi dibuka.
 *
 * Tanpa ini, setiap muat ulang halaman melempar pengguna yang sesinya MASIH
 * sah ke halaman masuk — cacat yang tidak pernah terlihat saat mengembangkan
 * (karena kita jarang me-reload setelah login) dan langsung terasa oleh
 * pengguna.
 *
 * Biayanya satu permintaan yang gagal bagi pengunjung yang memang belum
 * pernah masuk. Itu diterima: alternatifnya adalah menyimpan penanda "pernah
 * masuk" di localStorage, yaitu memindahkan sebagian keadaan sesi ke tempat
 * yang justru ingin kita hindari.
 */
export function pulihkanSesi(klien: ApiClient): Promise<void> {
  // SINGLE-FLIGHT, dan ini syarat kebenaran — bukan penghematan permintaan.
  //
  // Refresh token DIROTASI: sekali dipakai ia dicabut. Dua pemulihan yang
  // berjalan bersamaan membawa nilai cookie yang SAMA, jadi yang kalah tiba
  // dengan token yang sudah dirotasi dan ditolak. Sampai PR-033i, respons
  // penolakan itu ikut menghapus cookie yang baru saja dipasang pemenangnya —
  // dan hasil akhirnya adalah toples cookie kosong meskipun server memegang
  // sesi yang sah.
  //
  // Gejalanya menyesatkan justru karena halaman yang sedang terbuka tetap
  // sehat: access token pemenang hidup di memori. Kerusakannya baru muncul
  // pada MUAT ULANG berikutnya — dan tempat pertama yang menabraknya adalah
  // halaman kembalian dari Google, yang selalu dimuat dari nol. Di sana ia
  // terbaca sebagai "sesi Anda sudah berakhir", satu-satunya cabang yang
  // menyembunyikan tombol hapus akun. Itulah yang memblokir AC PR-033 nomor 4.
  //
  // PEMICU YANG TERUKUR ADALAH PERILAKU DEVELOPMENT, dan itu perlu dinyatakan
  // apa adanya: `useEffect` di bawah dijalankan dua kali oleh StrictMode React
  // 18 hanya di dev — pada build produksi `<StrictMode>` tidak berefek runtime
  // (`providers.tsx` mencatat hal yang sama). Di aplikasi ini pun tidak ada
  // jalur remount produksi: `PenyediaKlienApi` dipasang sekali di puncak pohon
  // provider dengan klien yang dipaku `useState`.
  //
  // Jadi yang ditutup gerbang ini persisnya: dua panggilan `pulihkanSesi`
  // BERSAMAAN pada satu klien. Itu yang membuat cacatnya deterministik dan
  // bisa diukur di dev, dan itu pula yang membuat verifikasi keyboard-only
  // jalur Google mustahil diselesaikan sebelumnya.
  //
  // YANG TIDAK DITUTUP GERBANG INI, supaya tidak dikira sudah aman:
  //   - Dua tab yang dibuka bersamaan. Keduanya konteks JavaScript terpisah
  //     dengan WeakMap sendiri-sendiri, jadi keduanya tetap mengirim nilai
  //     cookie yang sama.
  //   - Pemulihan boot yang berlomba dengan refresh yang dipicu 401. Jalur itu
  //     punya single-flight-nya SENDIRI di `createSessionRefresher`, dan dua
  //     gerbang terpisah tidak saling melihat. Jendelanya sempit, tetapi ia
  //     TERJANGKAU — dan justru di `/masuk/google`: halaman itu publik secara
  //     kontrak (kembalian OAuth tidak bisa dijaga guard), ia menembakkan
  //     `googleAuth` saat mount berbarengan dengan pemulihan boot, `googleAuth`
  //     tidak menyetel `skipAuthRefresh`, dan `GOOGLE_EXCHANGE_GAGAL` berstatus
  //     401 — sehingga penukaran yang gagal memanggil hook refresh. Akibatnya
  //     bisa lebih buruk daripada satu 401: bila yang kalah membaca barisnya
  //     SESUDAH rotasi pemenang commit, ia masuk cabang reuse dan
  //     `revokeFamily` ikut mematikan token segar milik pemenang. (Bila
  //     keduanya benar-benar berbarengan, `revokedAt: null` di klausa WHERE
  //     membuat yang kalah hanya mendapat 401 biasa.)
  //
  // Keduanya butuh jendela toleransi di sisi server (memperlakukan token yang
  // baru saja dirotasi sebagai balapan, bukan reuse) — dicatat sebagai
  // lanjutan, di luar lingkup PR ini.
  //
  // Gerbangnya per-KLIEN, bukan per-modul: test merakit banyak klien, dan
  // gerbang modul-global akan membuat pemulihan kedua diam-diam memakai hasil
  // pemulihan milik klien lain.
  const berjalan = pemulihanBerjalan.get(klien);
  if (berjalan !== undefined) return berjalan;

  const janji = jalankanPemulihan(klien).finally(() => {
    // Dilepas setelah selesai: yang digabungkan hanya yang BERSAMAAN. Pemulihan
    // sesudahnya (mis. provider dipasang ulang) tetap harus boleh berjalan.
    pemulihanBerjalan.delete(klien);
  });
  pemulihanBerjalan.set(klien, janji);
  return janji;
}

async function jalankanPemulihan(klien: ApiClient): Promise<void> {
  let hasil: string | null = null;
  try {
    const { data } = await refreshSession(klien);
    hasil = data.accessToken;
  } catch {
    // Sebab penolakan tidak dibedakan: tidak ada cookie, kedaluwarsa, atau
    // dicabut — bagi pengguna ketiganya berarti "belum masuk".
    hasil = null;
  }

  // HANYA berlaku bila belum ada yang memutuskan lebih dulu.
  //
  // Pemulihan ini berjalan sejak aplikasi dipasang, sementara pengguna bisa
  // menyelesaikan login di halaman yang SAMA sebelum jawabannya tiba —
  // paling nyata di `/masuk/google`, yang menukarkan code segera setelah
  // dimuat. Tanpa penjaga ini, pemulihan yang gagal (wajar: pengunjung itu
  // memang belum punya cookie) memanggil `keluar()` sesudah penukaran berhasil
  // dan MENCABUT sesi yang baru saja terbentuk — pengguna terlempar keluar
  // tepat setelah berhasil masuk, tanpa satu pun pesan kesalahan.
  //
  // Ditemukan oleh test PR-030c, bukan oleh review.
  const { status, masuk, keluar } = useStoreSesi.getState();
  if (status !== "memulihkan") return;

  if (hasil === null) keluar();
  else masuk(hasil);
}

const KonteksKlienApi = createContext<ApiClient | null>(null);

export interface PenyediaKlienApiProps {
  children: ReactNode;
  /** Disuntik test; produksi merakit sendiri. */
  klien?: ApiClient;
}

export function PenyediaKlienApi({ children, klien }: PenyediaKlienApiProps) {
  const [terpakai] = useState(() => klien ?? buatKlienApi());

  useEffect(() => {
    void pulihkanSesi(terpakai);
  }, [terpakai]);

  return <KonteksKlienApi.Provider value={terpakai}>{children}</KonteksKlienApi.Provider>;
}

/**
 * Klien API untuk kode fitur.
 *
 * Melempar bila dipakai di luar penyedianya, bukan mengembalikan null: klien
 * yang null akan menyebar sebagai `undefined` sampai ke tempat yang jauh dari
 * sebabnya, dan pesannya di sana tidak akan menyebut provider yang lupa
 * dipasang.
 */
export function useKlienApi(): ApiClient {
  const klien = useContext(KonteksKlienApi);
  if (klien === null) {
    throw new Error("useKlienApi dipakai di luar <PenyediaKlienApi>. Pasang di tumpukan provider.");
  }
  return klien;
}
