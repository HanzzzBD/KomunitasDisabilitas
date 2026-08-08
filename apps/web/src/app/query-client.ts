// Konfigurasi TanStack Query — angka-angkanya dari SDD §4.1, bukan dari selera.
//
// Dibuat sebagai FUNGSI, bukan instance modul-tingkat: tiap test butuh cache
// yang bersih. Satu QueryClient yang dibagi antar test akan membuat test kedua
// membaca hasil test pertama dari cache dan lulus tanpa memanggil apa pun —
// bentuk kegagalan yang tampak seperti keberhasilan.
import { QueryClient } from "@tanstack/react-query";

/** SDD §4.1: "staleTime default 60 s, retry 2 dengan backoff". */
export const STALE_TIME_MS = 60_000;
export const MAKS_RETRY = 2;

/** Backoff eksponensial berbatas — 1s, 2s, lalu berhenti (retry maks 2). */
export function jedaRetryMs(percobaanKe: number): number {
  return Math.min(1000 * 2 ** percobaanKe, 30_000);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: MAKS_RETRY,
        retryDelay: jedaRetryMs,
        // ADR-009 (online-only) diterjemahkan ke perilaku, bukan sekadar
        // dicatat: saat offline, query TIDAK dijalankan lalu gagal — ia
        // ditahan sampai koneksi kembali. Bedanya penting bagi pengguna, sebab
        // "gagal" dan "belum dicoba" menuntut tindakan yang berbeda.
        networkMode: "online",
        // Memuat ulang saat jendela kembali fokus adalah perilaku bawaan yang
        // BURUK di sini: pengguna screen reader dan pengguna keyboard sering
        // berpindah jendela, dan konten yang berubah sendiri di bawah kursor
        // mereka menghilangkan konteks yang sedang dibaca.
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Mutasi TIDAK di-retry otomatis. Sebagian mutasi platform ini tidak
        // idempoten (melamar, menghapus akun), dan mengulangnya diam-diam bisa
        // menciptakan aksi ganda yang tidak pernah diminta pengguna.
        retry: 0,
        networkMode: "online",
      },
    },
  });
}
