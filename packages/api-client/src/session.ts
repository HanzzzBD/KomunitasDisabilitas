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
import type { RefreshSessionResponse } from "@nawasena/schemas";
import type { ApiClient } from "./client.js";
import { refreshSession } from "./endpoints/auth.js";
import { ApiError } from "./errors.js";

/**
 * Jeda sebelum mencoba lagi saat server menjawab `SESI_SUDAH_DIROTASI`
 * (utang U-10). Totalnya 3,8 detik — di dalam jendela toleransi server
 * (bawaan 10 detik), dan cukup untuk jawaban PEMENANG balapan tiba lebih dulu
 * sehingga cookie (web) atau penyimpanan token (mobile) sudah memegang token
 * terbarunya.
 */
export const JEDA_COBA_ULANG_ROTASI_MS = [300, 1000, 2500] as const;

export interface OpsiRefreshToleran {
  /** Ambil refresh token TERKINI tiap percobaan — mobile; web: undefined (cookie). */
  getRefreshToken?: () => string | null | Promise<string | null>;
  /** Disuntik test; bawaan `setTimeout`. */
  tunggu?: (ms: number) => Promise<void>;
}

/**
 * `POST /auth/refresh` yang tahan balapan rotasi (utang U-10).
 *
 * Dua tab, atau pemulihan boot yang berlomba dengan refresh yang dipicu 401,
 * mengirim token yang SAMA. Yang kalah dijawab `SESI_SUDAH_DIROTASI` — bukan
 * "sesi habis" — dan cukup mencoba lagi sesudah pemenangnya memperbarui
 * cookie/token. Kode lain dilempar apa adanya: tidak ada percobaan ulang untuk
 * sesi yang memang berakhir.
 */
export async function refreshSesiToleran(
  client: ApiClient,
  opsi: OpsiRefreshToleran = {},
): Promise<RefreshSessionResponse> {
  const tunggu = opsi.tunggu ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let percobaan = 0; ; percobaan++) {
    try {
      const refreshToken = (await opsi.getRefreshToken?.()) ?? undefined;
      return await refreshSession(client, refreshToken === undefined ? {} : { refreshToken });
    } catch (err) {
      const jeda = JEDA_COBA_ULANG_ROTASI_MS[percobaan];
      if (!(err instanceof ApiError && err.code === "SESI_SUDAH_DIROTASI") || jeda === undefined) {
        throw err;
      }
      await tunggu(jeda);
    }
  }
}

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
  /** Disuntik test (jeda coba ulang balapan rotasi). */
  tunggu?: (ms: number) => Promise<void>;
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
      // Tahan balapan rotasi (utang U-10): `SESI_SUDAH_DIROTASI` dicoba lagi
      // dengan token TERKINI, bukan dibaca sebagai "sesi habis".
      const { data } = await refreshSesiToleran(client, {
        ...(getRefreshToken === undefined ? {} : { getRefreshToken }),
        ...(options.tunggu === undefined ? {} : { tunggu: options.tunggu }),
      });

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
