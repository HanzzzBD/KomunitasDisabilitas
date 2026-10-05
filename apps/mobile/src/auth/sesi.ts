// Session store mobile (PR-090, ADR-014: Zustand untuk state global).
//
// Pembagian tempat simpan yang menjadi inti keamanannya:
//   access token  → MEMORI saja (store ini). Hilang saat app ditutup, dan itu
//                   disengaja: umurnya 15 menit, memulihkannya dari refresh
//                   token lebih murah daripada menyimpannya di disk.
//   refresh token → SecureStore saja (token-storage.ts). Tidak pernah masuk
//                   state ini, tidak pernah ke log.
//
// Modul ini murni: penyimpanan dan pemanggil API disuntikkan, sehingga alur
// boot/masuk/keluar diuji di Vitest tanpa runtime React Native.
import { createStore, type StoreApi } from "zustand/vanilla";
import type { SessionTokens } from "@nawasena/schemas";

import type { TokenStorage } from "../storage/token-storage";

/**
 * - `memulihkan` — boot: refresh token sedang dicoba (layar tunggu).
 * - `keluar`     — belum/tidak lagi masuk → stack masuk.
 * - `masuk`      — access token di memori → stack aplikasi.
 * - `terputus`   — ada refresh token, tetapi server tak terjangkau saat boot.
 *                  Token TIDAK dibuang: sinyal buruk bukan alasan memaksa
 *                  pengguna mengulang OTP.
 */
export type StatusSesi = "memulihkan" | "keluar" | "masuk" | "terputus";

export interface StateSesi {
  status: StatusSesi;
  accessToken: string | null;
}

/** Hasil pemanggilan refresh, dipetakan pemanggil dari ApiError. */
export type HasilPerpanjang =
  | { ok: true; accessToken: string; refreshToken: string | undefined }
  | { ok: false; sebab: "ditolak" | "jaringan" };

export interface DepsSesi {
  penyimpanan: TokenStorage;
  /** POST /auth/refresh dengan token tersimpan (tahan balapan rotasi). */
  perpanjang: (refreshToken: string) => Promise<HasilPerpanjang>;
  /** POST /auth/logout — idempoten di server; kegagalannya diabaikan. */
  keluarDiServer: (refreshToken: string) => Promise<void>;
  /** Lepas perangkat push sementara access token masih tersedia (PR-094). */
  sebelumKeluar?: () => Promise<void>;
}

export interface AksiSesi {
  /** Dipanggil sekali saat boot (dan dari tombol "Coba lagi" saat terputus). */
  pulihkan(): Promise<void>;
  /** Simpan pasangan token hasil OTP/Google. Refresh token WAJIB ada (client mobile). */
  masuk(tokens: SessionTokens): Promise<void>;
  /** Keluar atas kehendak pengguna. */
  keluar(): Promise<void>;
  /** Refresh di tengah sesi ditolak — dari `onSessionEnded` api-client. */
  sesiBerakhir(): Promise<void>;
  /** Access token baru dari refresher api-client. */
  gantiAccessToken(accessToken: string): void;
}

export type StoreSesi = StoreApi<StateSesi & AksiSesi>;

export function createSesiStore(deps: DepsSesi): StoreSesi {
  const { penyimpanan } = deps;

  return createStore<StateSesi & AksiSesi>()((set) => ({
    status: "memulihkan",
    accessToken: null,

    async pulihkan() {
      set({ status: "memulihkan" });
      const refreshToken = await penyimpanan.getRefreshToken();
      if (refreshToken === null) {
        set({ status: "keluar", accessToken: null });
        void deps.sebelumKeluar?.().catch(() => undefined);
        return;
      }

      const hasil = await deps.perpanjang(refreshToken);
      if (hasil.ok) {
        // Rotasi: token lama sudah dicabut server. Simpan yang baru SEBELUM
        // menyatakan masuk — bila penyimpanan gagal, sesi berikutnya akan
        // membawa token yang sudah mati dan dibaca server sebagai reuse.
        if (hasil.refreshToken !== undefined) await penyimpanan.setRefreshToken(hasil.refreshToken);
        set({ status: "masuk", accessToken: hasil.accessToken });
        return;
      }

      if (hasil.sebab === "jaringan") {
        set({ status: "terputus", accessToken: null });
        return;
      }
      await penyimpanan.clearRefreshToken();
      set({ status: "keluar", accessToken: null });
      void deps.sebelumKeluar?.().catch(() => undefined);
    },

    async masuk(tokens) {
      if (tokens.refreshToken === undefined) {
        // Server menjawab bentuk web (refresh di cookie). Di RN itu berarti
        // sesi yang tidak akan bertahan restart — lebih baik gagal keras.
        throw new Error("Respons masuk tanpa refresh token; periksa client: 'mobile'.");
      }
      await penyimpanan.setRefreshToken(tokens.refreshToken);
      set({ status: "masuk", accessToken: tokens.accessToken });
    },

    async keluar() {
      const refreshToken = await penyimpanan.getRefreshToken();
      await deps.sebelumKeluar?.().catch(() => undefined);
      // State lokal dibersihkan dulu: pengguna yang menekan "Keluar" tidak
      // boleh tertahan di aplikasi karena jaringan sedang buruk.
      await penyimpanan.clearRefreshToken();
      set({ status: "keluar", accessToken: null });
      if (refreshToken !== null) await deps.keluarDiServer(refreshToken).catch(() => undefined);
    },

    async sesiBerakhir() {
      await deps.sebelumKeluar?.().catch(() => undefined);
      await penyimpanan.clearRefreshToken();
      set({ status: "keluar", accessToken: null });
    },

    gantiAccessToken(accessToken) {
      set({ accessToken });
    },
  }));
}
