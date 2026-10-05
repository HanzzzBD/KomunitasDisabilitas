// modules/auth — nonce sekali pakai untuk Sign in with Google di Android (PR-090).
//
// Kenapa ada: jalur Android tidak punya authorization code + PKCE. Aplikasi
// langsung memegang id_token, dan id_token itu berlaku ± 1 jam. Tanpa nonce,
// id_token yang bocor (log, proxy, perangkat dipinjam) bisa diputar ulang ke
// POST /auth/google/mobile sampai kedaluwarsa. Nonce terbitan server yang
// dikonsumsi SEKALI menutup itu: Google menandatangani nonce di dalam token,
// dan setelah satu kali masuk nonce itu tidak dikenal lagi.
//
// Redis CACHE (allkeys-lru), sama seperti OTP. Nonce yang ter-evict hanya
// berarti "ulangi tombol Google" — gagal tertutup, bukan gagal terbuka.
//
// Yang disimpan adalah SHA-256 nonce, bukan nonce-nya: isi Redis yang terbaca
// (dump, MONITOR) tidak memberi siapa pun nonce yang masih bisa dipakai.
import { createHash, randomBytes } from "node:crypto";

/** Subset klien Redis yang dipakai — `del` mengembalikan jumlah kunci terhapus. */
export interface NonceRedisLike {
  set(key: string, value: string, secondsToken: "EX", seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

/** Umur nonce: cukup untuk memilih akun di Credential Manager, tidak lebih. */
export const GOOGLE_NONCE_TTL_SECONDS = 300;

/** 32 byte CSPRNG → 43 karakter base64url. */
const NONCE_BYTES = 32;

const PREFIKS = "google:nonce:";

const kunci = (nonce: string): string => PREFIKS + createHash("sha256").update(nonce).digest("hex");

export function createGoogleNonceRepository(redis: NonceRedisLike) {
  return {
    async terbitkan(): Promise<{ nonce: string; expiresIn: number }> {
      const nonce = randomBytes(NONCE_BYTES).toString("base64url");
      await redis.set(kunci(nonce), "1", "EX", GOOGLE_NONCE_TTL_SECONDS);
      return { nonce, expiresIn: GOOGLE_NONCE_TTL_SECONDS };
    },

    /**
     * true bila nonce pernah diterbitkan, belum hangus, dan BELUM dipakai.
     *
     * `DEL` atomik di Redis: dari dua permintaan yang membawa nonce sama secara
     * bersamaan, tepat satu yang mendapat 1. Pola get-lalu-del akan meloloskan
     * keduanya di celah antara dua perintah.
     */
    async konsumsi(nonce: string): Promise<boolean> {
      return (await redis.del(kunci(nonce))) === 1;
    },
  };
}

export type GoogleNonceRepository = ReturnType<typeof createGoogleNonceRepository>;
