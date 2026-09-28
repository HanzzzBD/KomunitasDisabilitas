// modules/ai — registry aliran jawaban AI CV Builder (PR-066).
//
// Ini "registry sesi" yang dijanjikan kepala `core/http/sse.ts` dan dicatat log
// PR-045 sebagai SYARAT MASUK PR-066: tanpa plafon, registry sesi SSE adalah
// permukaan kehabisan memori — setiap aliran menahan cincin hingga 256 event.
//
// Satu entri per SESI CHAT (bukan per koneksi): koneksi datang dan pergi (3G),
// alirannya tetap. Entri hidup selama jawaban dibuat, lalu sebentar SESUDAHNYA
// (`retensiMs`) supaya klien yang putus tepat di akhir masih bisa menyambung dan
// menerima event penutup. Setelah itu jawabannya tetap aman — sudah tersimpan
// di transkrip — hanya tidak bisa lagi diputar sebagai aliran.
//
// BATAS YANG DITERIMA SADAR: hidup di memori SATU proses. Dengan dua replika,
// sambung ulang yang mendarat di proses lain menerima 404 `AI_ALIRAN_TIDAK_ADA`
// dan klien membaca transkripnya — benar dan aman, bukan diam-diam salah.
// Jalannya sticky routing (PR-098), sama seperti catatan `sse.ts`.
import type { SseSesi } from "../../../core/http/index.js";

/** Plafon aliran serentak per proses. ×256 event per cincin = batas memori atasnya. */
export const MAKS_ALIRAN_SERENTAK = 200;

/** Berapa lama aliran yang sudah selesai masih bisa disambung (ms). */
export const RETENSI_ALIRAN_MS = 60_000;

/** Penunda ber-DI — pola `PenjadwalSse`: test memicunya sendiri, tanpa fake timer. */
export interface PenundaAliran {
  tunda(fn: () => void, ms: number): void;
}

const penundaNyata: PenundaAliran = {
  tunda(fn, ms) {
    setTimeout(fn, ms).unref?.();
  },
};

interface Entri {
  userId: string;
  sesi: SseSesi;
  berjalan: boolean;
}

export type HasilDaftar = "ok" | "sedang-berjalan" | "penuh";

export interface RegistriAliran {
  /** Daftarkan aliran baru untuk `sessionId`. Menimpa entri lama yang sudah selesai. */
  daftar(sessionId: string, userId: string, sesi: SseSesi): HasilDaftar;
  /** Aliran milik `userId` untuk sesi ini; milik orang lain = tidak ada. */
  ambil(sessionId: string, userId: string): SseSesi | undefined;
  /** Tandai selesai; entri dihapus setelah `retensiMs`. */
  selesai(sessionId: string, sesi: SseSesi): void;
  readonly jumlah: number;
}

export function createRegistriAliran(
  opsi: { maks?: number; retensiMs?: number; penunda?: PenundaAliran } = {},
): RegistriAliran {
  const maks = opsi.maks ?? MAKS_ALIRAN_SERENTAK;
  const retensiMs = opsi.retensiMs ?? RETENSI_ALIRAN_MS;
  const penunda = opsi.penunda ?? penundaNyata;
  const entri = new Map<string, Entri>();

  return {
    daftar(sessionId, userId, sesi) {
      const lama = entri.get(sessionId);
      if (lama?.berjalan === true) return "sedang-berjalan";
      // Entri selesai yang ditimpa tidak menambah jumlah — ia hanya diganti.
      if (lama === undefined && entri.size >= maks) return "penuh";
      entri.set(sessionId, { userId, sesi, berjalan: true });
      return "ok";
    },

    ambil(sessionId, userId) {
      const e = entri.get(sessionId);
      // Pemilik dicek DI SINI juga, bukan hanya oleh repository: registry ini
      // tidak menyentuh DB, dan id sesi orang lain tidak boleh membuka alirannya.
      return e !== undefined && e.userId === userId ? e.sesi : undefined;
    },

    selesai(sessionId, sesi) {
      const e = entri.get(sessionId);
      if (e === undefined || e.sesi !== sesi) return;
      e.berjalan = false;
      penunda.tunda(() => {
        // Hanya hapus bila entri itu MASIH yang ini — aliran berikutnya untuk
        // sesi yang sama mungkin sudah menggantikannya.
        if (entri.get(sessionId)?.sesi === sesi) entri.delete(sessionId);
      }, retensiMs);
    },

    get jumlah() {
      return entri.size;
    },
  };
}
