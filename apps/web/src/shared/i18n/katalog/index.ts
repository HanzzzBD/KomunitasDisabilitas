// Kunci katalog — TIPE SAJA, tanpa satu byte pun di bundel.
//
// Perakitan runtime-nya pindah ke `../registri.js` (malas, per fitur) dan
// `./semua.js` (lengkap, khusus penjaga CI). Yang tinggal di sini hanya union
// kunci, dan itu disengaja: `import type` dihapus habis saat build, sehingga
// keamanan tipe penuh TIDAK menuntut satu pun katalog ikut ke bundel awal.
//
// Inilah yang membuat kunci salah ketik tetap menjadi galat `typecheck`, bukan
// teks aneh yang baru ketahuan di layar pengguna — persis seperti sebelum
// pemuatan malas.
import type { katalogShell } from "./shell.js";
import type { katalogAuth } from "./auth.js";
import type { katalogBeranda } from "./beranda.js";
import type { katalogPengaturan } from "./pengaturan.js";
import type { katalogOnboarding } from "./onboarding.js";
import type { katalogProfil } from "./profil.js";

type SemuaKatalog = typeof katalogShell &
  typeof katalogAuth &
  typeof katalogBeranda &
  typeof katalogPengaturan &
  typeof katalogOnboarding &
  typeof katalogProfil;

/** Seluruh kunci yang sah, diturunkan dari katalog — bukan ditulis ulang. */
export type KunciTeks = keyof SemuaKatalog;
