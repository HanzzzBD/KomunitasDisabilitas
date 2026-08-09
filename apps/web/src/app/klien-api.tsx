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
export async function pulihkanSesi(klien: ApiClient): Promise<void> {
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
