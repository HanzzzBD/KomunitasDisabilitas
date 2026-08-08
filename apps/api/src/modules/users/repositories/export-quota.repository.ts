// modules/users — kuota ekspor data pribadi per pengguna (PR-022).
//
// KENAPA DIBATASI SAMA SEKALI. Endpoint ini mengembalikan SELURUH data seorang
// pengguna dalam satu permintaan. Bagi pemiliknya itu hak (UU PDP §8.7); bagi
// pemegang access token curian ia satu panggilan yang memanen semuanya
// sekaligus. Batas harian tidak mencegah pengambilan pertama — tidak ada yang
// bisa — tetapi ia menutup pemanenan berulang dan membuat percobaannya terlihat
// di audit.
//
// KENAPA DI REDIS, BUKAN DI MEMORI PROSES. Limiter global (core/http) memakai
// memory store, jadi ia mereset setiap deploy dan tidak dibagi antar replika.
// Untuk kuota yang diukur dalam HARI, keduanya fatal: restart mengembalikan
// jatah, dan dua replika berarti jatah ganda.
//
// Mekanismenya sengaja SAMA PERSIS dengan limiter kirim OTP (`bumpSend`):
// INCR + EXPIRE saat pertama, TTL tidak pernah diperpanjang sehingga jendela
// bergerak maju dan Retry-After yang dilaporkan selalu jujur.
import type { CounterState } from "./types.js";

/**
 * Irisan perintah Redis yang dipakai repo ini. Sengaja sempit: unit test
 * memakai fake in-memory tanpa server, dan klien ioredis nyata memenuhinya.
 *
 * Dideklarasikan ulang di sini alih-alih meminjam milik modul `auth` —
 * repository lintas modul dilarang (PR-002), dan meminjamnya akan menyeret
 * seluruh kebutuhan OTP (get/set/del) ke tempat yang hanya butuh tiga perintah.
 */
export interface ExportRedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

/**
 * Prefiks kunci. Berisi userId APA ADANYA, tanpa sidik HMAC seperti nomor HP di
 * repo OTP — dan itu keputusan sadar: userId adalah UUID acak, bukan PII yang
 * bisa dikenali orang, dan ia sudah muncul di `audit_logs` sebagai `actor_id`.
 * Menyamarkannya di sini tidak menambah perlindungan apa pun, hanya membuat
 * operasi (mis. menyetel ulang kuota untuk satu pengguna) mustahil dilakukan.
 */
const KEY = "pdp:export:";

export function createExportQuotaRepository(redis: ExportRedisLike) {
  return {
    /**
     * Naikkan pemakaian dan kembalikan keadaan jendela sekarang.
     *
     * Yang dikembalikan adalah nilai SETELAH kenaikan, jadi pemanggil yang
     * mendapat `value > batas` tahu permintaan inilah yang melewatinya.
     */
    async bump(userId: string, windowSeconds: number): Promise<CounterState> {
      const key = `${KEY}${userId}`;
      const value = await redis.incr(key);
      if (value === 1) {
        await redis.expire(key, windowSeconds);
        return { value, resetInSeconds: windowSeconds };
      }
      const sisa = await redis.ttl(key);
      // TTL bisa -1 (kunci tanpa expire, mis. EXPIRE gagal saat Redis sekarat).
      // Jatuh ke jendela penuh: lebih baik menahan terlalu lama daripada
      // membiarkan kunci abadi yang mengunci pengguna selamanya... sebaliknya,
      // TTL yang hilang berarti kunci itu TIDAK akan kedaluwarsa sendiri, jadi
      // kita pasang ulang.
      if (sisa < 0) {
        await redis.expire(key, windowSeconds);
        return { value, resetInSeconds: windowSeconds };
      }
      return { value, resetInSeconds: sisa };
    },
  };
}

export type ExportQuotaRepository = ReturnType<typeof createExportQuotaRepository>;
