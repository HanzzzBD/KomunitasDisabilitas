// State sesi (ADR-014) — AC PR-030 nomor 5, dan Security Considerations
// PR-030: "tidak menyimpan access token persisten".
//
// DUA HAL YANG SENGAJA TIDAK DILAKUKAN DI SINI, keduanya soal di mana token
// boleh berada:
//
// 1. TANPA `persist`. Berbeda dari store preferensi aksesibilitas (PR-026),
//    yang memang harus selamat dari reload, store ini tidak menulis apa pun ke
//    localStorage. Access token yang tersimpan di sana bisa dibaca skrip mana
//    pun yang berhasil masuk ke halaman, dan ia bertahan lama setelah pengguna
//    menutup tab. Yang menyeberangi reload adalah refresh token di cookie
//    HttpOnly — yang justru TIDAK bisa dibaca JavaScript.
//
// 2. TOKENNYA TIDAK ADA DI DALAM STATE REAKTIF. Ia hidup di variabel modul,
//    bukan di store. Alasannya tiga, dan tidak satu pun soal gaya:
//      - Token tidak pernah dirender, jadi menjadikannya reaktif tidak membeli
//        apa pun.
//      - Setiap pembaca reaktif adalah tempat ia bisa bocor: React DevTools,
//        pencatat kesalahan yang men-serialisasi state, dan snapshot store.
//      - Refresh mengganti token tiap ~15 menit; kalau ia bagian dari state,
//        setiap penggantian merender ulang semua pelanggan store demi nilai
//        yang tidak ditampilkan siapa pun.
//
// Yang mencegah keduanya menyimpang: HANYA aksi di store ini yang boleh menulis
// token. Tidak ada setter token yang diekspor terpisah.
import { create } from "zustand";

/**
 * `memulihkan` adalah keadaan AWAL, dan itu yang membuat guard benar.
 *
 * Saat halaman baru dimuat, aplikasi belum tahu apakah cookie refresh-nya
 * masih sah — jawabannya baru datang setelah satu perjalanan ke server. Tanpa
 * keadaan ketiga ini, guard hanya punya "masuk" atau "keluar", dan pada milidetik
 * pertama ia akan membaca "keluar" lalu melempar pengguna yang SEDANG login ke
 * halaman masuk setiap kali ia me-reload.
 */
export type StatusSesi = "memulihkan" | "masuk" | "keluar";

/** Token akses — di luar state reaktif dengan sengaja (lihat catatan berkas). */
let tokenAkses: string | null = null;

/** Dipakai `ApiClient.getAccessToken`; bukan untuk dirender. */
export function ambilTokenAkses(): string | null {
  return tokenAkses;
}

/**
 * TIDAK ADA `userId` DI SINI, dan itu keputusan yang ditunda dengan sengaja.
 *
 * `POST /auth/refresh` hanya mengembalikan token — tanpa identitas. Artinya
 * sesi yang dipulihkan dari cookie saat reload TAHU bahwa pengguna masuk,
 * tetapi tidak tahu SIAPA. Menjawabnya butuh memilih antara membaca klaim
 * `sub` dari JWT tanpa memverifikasinya, atau satu permintaan tambahan ke
 * `/users/me` — dan pilihan itu bergantung pada apa yang halaman pertama
 * benar-benar butuhkan.
 *
 * Belum ada halaman seperti itu. AC 5 (guard) hanya perlu `status`. Menaruh
 * `userId` di sini sekarang berarti menebak, dan tebakan yang salah akan
 * terlanjur dipakai sebelum ketahuan. Ia lahir bersama halaman pertama yang
 * menampilkan identitas — lihat "Out of scope" di log PR-030a.
 */
export interface StateSesi {
  status: StatusSesi;

  /** Sesi baru terbentuk: verifikasi OTP, Google, atau pemulihan saat boot. */
  masuk: (accessToken: string) => void;
  /** Token diperbarui oleh refresh; status tidak berubah. */
  perbarui: (accessToken: string) => void;
  /** Sesi berakhir — logout, refresh ditolak, atau tidak ada cookie sama sekali. */
  keluar: () => void;
}

export const useStoreSesi = create<StateSesi>((set) => ({
  status: "memulihkan",

  masuk: (accessToken) => {
    tokenAkses = accessToken;
    set({ status: "masuk" });
  },

  perbarui: (accessToken) => {
    tokenAkses = accessToken;
    // TIDAK menyentuh `set`: tidak ada satu pun nilai yang dirender berubah,
    // jadi memanggilnya hanya akan merender ulang seluruh pelanggan tanpa
    // sebab. Inilah yang dibeli dengan menaruh token di luar state.
  },

  keluar: () => {
    tokenAkses = null;
    set({ status: "keluar" });
  },
}));
