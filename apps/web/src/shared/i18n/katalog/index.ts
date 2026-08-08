// Perakitan katalog dari potongan per fitur.
//
// Satu berkas per fitur, bukan satu berkas raksasa: katalog terpusat adalah
// tempat setiap PR fitur bertabrakan saat merge, dan tempat kunci yang sudah
// tidak dipakai menumpuk tanpa ada yang berani menghapusnya.
import { katalogShell } from "./shell.js";

/**
 * Katalog gabungan. Tiap fitur menyumbang kuncinya sendiri di sini.
 *
 * Berikutnya: `auth` (PR-030), `pengaturan` (PR-033), `lowongan` (Phase 08).
 */
export const katalog = {
  ...katalogShell,
} as const;

/**
 * Seluruh kunci yang sah, diturunkan dari katalog — bukan ditulis ulang.
 *
 * Inilah yang membuat kunci salah ketik menjadi galat `typecheck`, bukan teks
 * aneh yang baru ketahuan di layar pengguna. Menuliskan daftar kunci secara
 * manual akan menghadirkan sumber kebenaran kedua yang bebas menyimpang.
 */
export type KunciTeks = keyof typeof katalog;
