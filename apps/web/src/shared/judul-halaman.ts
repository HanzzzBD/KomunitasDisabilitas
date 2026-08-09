// Judul dokumen per halaman (PR-032a) — bagian "SEO dasar + meta" pada Scope
// PR-032.
//
// KENAPA INI BUKAN SEKADAR SEO. Pada aplikasi satu-halaman, berpindah route
// tidak memuat ulang dokumen — dan `document.title` yang tidak ikut berubah
// membuat DUA hal gagal sekaligus:
//
//   1. Screen reader membacakan judul dokumen saat halaman berganti. Judul yang
//      tidak berubah berarti pengguna tidak mendapat konfirmasi bahwa
//      perpindahannya berhasil, dan ia menekan tautannya lagi.
//   2. Riwayat peramban, bookmark, dan daftar tab semuanya memakai judul ini.
//      Sepuluh entri riwayat bernama "Nawasena" tidak bisa dibedakan.
//
// Ia dipakai sebagai HOOK, bukan sebagai efek samping di route config, supaya
// judulnya bisa memakai teks terjemahan — yang hanya tersedia di dalam pohon
// React (mode bahasa bisa berubah tanpa berpindah halaman).
import { useEffect } from "react";

/**
 * Menyetel `document.title` selama komponen terpasang.
 *
 * Sengaja TIDAK memulihkan judul lama saat komponen dilepas: halaman berikutnya
 * memasang judulnya sendiri, dan memulihkan judul lama lebih dulu hanya
 * menghasilkan satu kedipan judul usang di antara keduanya.
 */
export function useJudulHalaman(judul: string): void {
  useEffect(() => {
    document.title = judul;
  }, [judul]);
}
