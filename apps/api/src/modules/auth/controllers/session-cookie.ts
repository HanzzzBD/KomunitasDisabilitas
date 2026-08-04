// modules/auth — cookie refresh untuk klien web (PR-018b, SDD §8.1).
//
// Empat flag, masing-masing menutup satu hal:
//
//   HttpOnly           → JavaScript tidak bisa membacanya. Inilah alasan refresh
//                        token web TIDAK ikut di body response: body bisa dibaca
//                        script, jadi mengirimnya ke sana membatalkan flag ini.
//   Secure             → tidak pernah melintas di HTTP polos.
//   SameSite=Strict    → browser tidak melampirkannya pada permintaan lintas
//                        situs, sehingga /auth/refresh tidak bisa dipicu dari
//                        situs lain (mitigasi CSRF yang diminta SDD §8.1).
//   Path=/api/v1/auth  → cookie hanya ikut pada endpoint auth, bukan pada SETIAP
//                        permintaan API. Mengurangi paparan tanpa biaya apa pun.
//
// Membaca cookie dilakukan manual dari header, bukan lewat cookie-parser:
// satu-satunya cookie yang kita perlukan adalah milik kita sendiri, dan
// menambah dependensi untuk itu tidak sepadan.
import type { Request, Response } from "express";

/** Nama cookie refresh. Diawali nama produk supaya tidak bentrok di domain bersama. */
export const REFRESH_COOKIE = "nawasena_refresh";

/** Jalur cookie — sengaja sempit; lihat catatan di atas. */
const COOKIE_PATH = "/api/v1/auth";

export interface SessionCookieOptions {
  /**
   * `Secure` dimatikan HANYA di development, tempat dev berjalan di http
   * localhost. Test memakai nilai produksi supaya snapshot header menguji
   * bentuk yang benar-benar dikirim ke pengguna.
   */
  secure: boolean;
}

export function createSessionCookie(options: SessionCookieOptions) {
  const dasar = {
    httpOnly: true,
    secure: options.secure,
    sameSite: "strict" as const,
    path: COOKIE_PATH,
  };

  return {
    /** Pasang refresh token; `expiresAt` menentukan Max-Age. */
    set(res: Response, token: string, expiresAt: Date): void {
      const maxAgeMs = Math.max(0, expiresAt.getTime() - Date.now());
      res.cookie(REFRESH_COOKIE, token, { ...dasar, maxAge: maxAgeMs });
    },

    /**
     * Hapus cookie. Atribut HARUS sama persis dengan saat dipasang (terutama
     * `path`) — browser mencocokkan atribut, dan cookie yang "dihapus" dengan
     * path berbeda akan tetap hidup.
     */
    clear(res: Response): void {
      res.clearCookie(REFRESH_COOKIE, dasar);
    },

    /** Baca refresh token dari header Cookie; null bila tidak ada. */
    read(req: Request): string | null {
      const header = req.headers.cookie;
      if (typeof header !== "string") return null;

      for (const bagian of header.split(";")) {
        const pemisah = bagian.indexOf("=");
        if (pemisah === -1) continue;
        if (bagian.slice(0, pemisah).trim() !== REFRESH_COOKIE) continue;

        const nilai = bagian.slice(pemisah + 1).trim();
        return nilai === "" ? null : decodeURIComponent(nilai);
      }
      return null;
    },
  };
}

export type SessionCookie = ReturnType<typeof createSessionCookie>;
