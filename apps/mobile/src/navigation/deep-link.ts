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

import { idSchema } from "@nawasena/schemas";

export const SKEMA = "nawasena";
export const PREFIKS = `${SKEMA}://`;

/** Path yang boleh dibuka dari luar. Bertambah per PR fitur (090+). */
export const PATH_DIIZINKAN = [
  "",
  "beranda",
  "lowongan",
  "lamaran",
  "notifikasi",
  "cv",
  "cv/chat",
  "profil",
] as const;

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

  if ((PATH_DIIZINKAN as readonly string[]).includes(path)) return path;
  const segmen = path.split("/");
  return segmen.length === 2 &&
    (segmen[0] === "lamaran" || segmen[0] === "lowongan" || segmen[0] === "cv") &&
    idSchema.safeParse(segmen[1]).success
    ? path
    : null;
}

export function deepLinkDiizinkan(url: string): boolean {
  return pathDeepLink(url) !== null;
}

export type TujuanTautan =
  | { layar: "Utama"; tab: "Beranda" | "Cari" | "Lamaran" | "Cv" | "Profil" }
  | { layar: "Notifikasi" }
  | { layar: "CvChat" }
  | { layar: "LamaranDetail" | "LowonganDetail" | "CvEditor"; id: string };

export function tujuanDeepLink(url: string): TujuanTautan | null {
  const path = pathDeepLink(url);
  if (path === null) return null;
  if (path === "" || path === "beranda") return { layar: "Utama", tab: "Beranda" };
  if (path === "lamaran") return { layar: "Utama", tab: "Lamaran" };
  if (path === "notifikasi") return { layar: "Notifikasi" };
  if (path === "cv") return { layar: "Utama", tab: "Cv" };
  if (path === "cv/chat") return { layar: "CvChat" };
  if (path === "lowongan") return { layar: "Utama", tab: "Cari" };
  if (path === "profil") return { layar: "Utama", tab: "Profil" };
  const [jenis, id] = path.split("/");
  return id
    ? {
        layar:
          jenis === "lamaran" ? "LamaranDetail" : jenis === "cv" ? "CvEditor" : "LowonganDetail",
        id,
      }
    : null;
}
