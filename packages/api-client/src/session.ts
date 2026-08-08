// Hook refresh untuk ApiClient (PR-018b) — 401 → refresh → retry sekali.
//
// SINGLE-FLIGHT bukan hiasan, melainkan syarat kebenaran. Refresh token bersifat
// ROTATING: sekali dipakai ia dicabut. Bila tiga permintaan menerima 401
// bersamaan dan masing-masing memanggil /auth/refresh, dua di antaranya membawa
// token yang sudah dicabut — dan itu PERSIS bentuk yang dibaca server sebagai
// reuse, sehingga seluruh keluarga sesi dicabut dan pengguna terlempar keluar.
// Klien yang naif justru menghancurkan sesinya sendiri di jaringan lambat,
// tepat ketika permintaan menumpuk.
//
// Karena itu: satu panggilan refresh yang sedang berjalan dipakai bersama oleh
// semua pemanggil yang datang saat itu.
import type { ApiClient } from "./client.js";
import { refreshSession } from "./endpoints/auth.js";

export interface SessionRefresherOptions {
  client: ApiClient;
  /**
   * Simpan access token baru (Zustand/SecureStore). Dipanggil hanya saat
   * refresh berhasil.
   */
  onAccessToken: (accessToken: string) => void | Promise<void>;
  /**
   * Ambil refresh token tersimpan — MOBILE saja. Web mengembalikan null (atau
   * tidak memberikan opsi ini): tokennya di cookie HttpOnly, dilampirkan
   * browser sendiri dan memang tidak bisa dibaca JavaScript.
   */
  getRefreshToken?: () => string | null | Promise<string | null>;
  /** Simpan refresh token baru — MOBILE saja (rotasi mengganti nilainya). */
  onRefreshToken?: (refreshToken: string) => void | Promise<void>;
  /** Sesi habis (refresh ditolak) → aplikasi mengarahkan ke halaman masuk. */
  onSessionEnded?: () => void | Promise<void>;
}

/**
 * Buat fungsi untuk `ApiClientOptions.refresh`. Mengembalikan true bila token
 * baru siap — client lalu mengulang permintaan aslinya SEKALI.
 */
export function createSessionRefresher(options: SessionRefresherOptions): () => Promise<boolean> {
  const { client, onAccessToken, getRefreshToken, onRefreshToken, onSessionEnded } = options;

  /** Panggilan yang sedang berjalan; null = tidak ada. */
  let berjalan: Promise<boolean> | null = null;

  async function jalankan(): Promise<boolean> {
    try {
      const refreshToken = (await getRefreshToken?.()) ?? undefined;
      const { data } = await refreshSession(client, refreshToken === null ? {} : { refreshToken });

      await onAccessToken(data.accessToken);
      // Hanya mobile yang menerima refresh baru di body; web mendapat cookie.
      if (data.refreshToken !== undefined) await onRefreshToken?.(data.refreshToken);
      return true;
    } catch {
      // Sebab penolakan TIDAK dibedakan di sini: kedaluwarsa, dicabut, atau
      // reuse — bagi pengguna semuanya berarti "masuk lagi".
      await onSessionEnded?.();
      return false;
    }
  }

  return function refresh(): Promise<boolean> {
    // Sudah ada yang menyegarkan → ikut menunggu hasilnya, jangan memanggil lagi.
    berjalan ??= jalankan().finally(() => {
      berjalan = null;
    });
    return berjalan;
  };
}
