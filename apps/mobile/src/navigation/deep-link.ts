// Validasi deep link (PR-088). Dipisah dari React Navigation agar bisa diuji di
// Vitest tanpa runtime React Native.
//
// Deep link adalah input dari luar aplikasi: siapa pun bisa menaruh tautan
// `nawasena://...` di pesan WhatsApp. Karena itu tautan hanya diteruskan ke
// navigator bila skemanya milik kita DAN path-nya ada di daftar layar yang
// memang boleh dibuka dari luar. Selebihnya diabaikan — aplikasi tetap terbuka
// di layar awal, tidak ada layar yang terbuka karena tebakan path.
//
// `URL` di React Native tidak lengkap untuk skema kustom, jadi parsing manual.

export const SKEMA = "nawasena";
export const PREFIKS = `${SKEMA}://`;

/** Path yang boleh dibuka dari luar. Bertambah per PR fitur (090+). */
export const PATH_DIIZINKAN = ["", "beranda"] as const;

const BATAS_PANJANG_URL = 512;
// Huruf kecil, angka, `-`, dan `/` antarsegmen. Tanpa `..`, `%`, `@`, atau `:`.
const POLA_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;

/** Path ternormalisasi bila tautan sah, `null` bila harus diabaikan. */
export function pathDeepLink(url: string): string | null {
  if (url.length > BATAS_PANJANG_URL) return null;
  if (!url.toLowerCase().startsWith(PREFIKS)) return null;

  const sisa = url.slice(PREFIKS.length);
  const path = (sisa.split(/[?#]/, 1)[0] ?? "").replace(/^\/+|\/+$/g, "");
  if (path !== "" && !POLA_PATH.test(path)) return null;

  return (PATH_DIIZINKAN as readonly string[]).includes(path) ? path : null;
}

export function deepLinkDiizinkan(url: string): boolean {
  return pathDeepLink(url) !== null;
}
