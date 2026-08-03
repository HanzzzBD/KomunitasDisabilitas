// modules/auth — repository OTP di Redis (SDD §8.1).
//
// Dua kebijakan privasi yang ditegakkan DI SINI, bukan di service:
//   1. Kode OTP tidak pernah tersimpan mentah — hanya HMAC-SHA256 ber-pepper.
//      Dump Redis yang bocor tidak bisa dipakai login tanpa OTP_HASH_SECRET.
//   2. Nomor HP tidak pernah menjadi bagian kunci Redis — kunci memakai
//      "sidik" HMAC nomor, jadi daftar key Redis bukan daftar nomor pengguna.
//
// Repo ini murni akses data: batas percobaan/kirim & tangga lockout adalah
// keputusan bisnis dan tinggal di service.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Irisan perintah Redis yang dipakai repo ini. Sengaja sempit: unit test
 * memakai fake in-memory tanpa server, dan klien ioredis nyata memenuhinya.
 */
export interface OtpRedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, secondsToken: "EX", seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

export interface OtpRepositoryDeps {
  redis: OtpRedisLike;
  /** Pepper HMAC (env OTP_HASH_SECRET). Wajib — modul tidak dibangun tanpa ini. */
  secret: string;
}

/** Hasil satu pencacah berjendela: nilai sekarang + sisa umur jendela. */
export interface CounterState {
  value: number;
  resetInSeconds: number;
}

const KEY = {
  code: "otp:code:",
  attempt: "otp:try:",
  send: "otp:send:",
  strike: "otp:strike:",
  lock: "otp:lock:",
} as const;

export function createOtpRepository(deps: OtpRepositoryDeps) {
  const { redis, secret } = deps;

  const digest = (label: string, value: string): string =>
    createHmac("sha256", secret).update(`${label}:${value}`).digest("hex");

  /** Sidik nomor untuk kunci Redis — 32 hex cukup jarang bertabrakan. */
  const fingerprint = (phone: string): string => digest("phone", phone).slice(0, 32);

  /** Hash kode: terikat pada nomor, jadi kode bocor untuk nomor lain tak berguna. */
  const hashCode = (phone: string, code: string): string => digest("otp", `${phone}:${code}`);

  /**
   * INCR + EXPIRE saat pertama. Percobaan yang DITOLAK pun ikut menaikkan
   * pencacah (lebih ketat), tetapi TTL tidak diperpanjang sehingga jendela
   * tetap bergerak maju — Retry-After yang dilaporkan selalu jujur.
   */
  async function bump(key: string, ttlSeconds: number): Promise<CounterState> {
    const value = await redis.incr(key);
    if (value === 1) {
      await redis.expire(key, ttlSeconds);
      return { value, resetInSeconds: ttlSeconds };
    }
    const sisa = await redis.ttl(key);
    return { value, resetInSeconds: sisa > 0 ? sisa : ttlSeconds };
  }

  return {
    /** Sidik nomor untuk korelasi log/metrik tanpa membocorkan nomor. */
    fingerprint,

    /** Simpan hash kode baru; percobaan sebelumnya di-reset. */
    async saveCode(phone: string, code: string, ttlSeconds: number): Promise<void> {
      const id = fingerprint(phone);
      await redis.set(`${KEY.code}${id}`, hashCode(phone, code), "EX", ttlSeconds);
      await redis.del(`${KEY.attempt}${id}`);
    },

    /** Hash kode aktif, atau null bila tidak ada/kedaluwarsa. */
    async readCodeHash(phone: string): Promise<string | null> {
      return redis.get(`${KEY.code}${fingerprint(phone)}`);
    },

    /** Hanguskan kode + pencacah percobaannya. */
    async dropCode(phone: string): Promise<void> {
      const id = fingerprint(phone);
      await redis.del(`${KEY.code}${id}`, `${KEY.attempt}${id}`);
    },

    /** Bandingkan waktu-konstan (hindari timing oracle pada hash). */
    matches(phone: string, code: string, hash: string): boolean {
      const dihitung = Buffer.from(hashCode(phone, code), "utf8");
      const tersimpan = Buffer.from(hash, "utf8");
      return dihitung.length === tersimpan.length && timingSafeEqual(dihitung, tersimpan);
    },

    /** Pencacah kirim per nomor per jendela (SDD §8.1: 3/jam). */
    async bumpSend(phone: string, windowSeconds: number): Promise<CounterState> {
      return bump(`${KEY.send}${fingerprint(phone)}`, windowSeconds);
    },

    /** Pencacah percobaan verify untuk kode yang sedang aktif. */
    async bumpAttempt(phone: string, ttlSeconds: number): Promise<number> {
      const state = await bump(`${KEY.attempt}${fingerprint(phone)}`, ttlSeconds);
      return state.value;
    },

    /** Pencacah "kode hangus" beruntun — dasar tangga lockout progresif. */
    async bumpStrike(phone: string, windowSeconds: number): Promise<number> {
      const state = await bump(`${KEY.strike}${fingerprint(phone)}`, windowSeconds);
      return state.value;
    },

    async lock(phone: string, seconds: number): Promise<void> {
      await redis.set(`${KEY.lock}${fingerprint(phone)}`, "1", "EX", seconds);
    },

    /** Sisa detik lockout; 0 = tidak terkunci. */
    async lockRemainingSeconds(phone: string): Promise<number> {
      const sisa = await redis.ttl(`${KEY.lock}${fingerprint(phone)}`);
      return sisa > 0 ? sisa : 0;
    },

    /**
     * Bersihkan jejak percobaan setelah verifikasi berhasil. Pencacah KIRIM
     * sengaja dibiarkan hidup — kuota 3/jam tidak boleh bisa di-reset dengan
     * cara login berhasil berulang kali.
     */
    async clearAfterSuccess(phone: string): Promise<void> {
      const id = fingerprint(phone);
      await redis.del(
        `${KEY.code}${id}`,
        `${KEY.attempt}${id}`,
        `${KEY.strike}${id}`,
        `${KEY.lock}${id}`,
      );
    },
  };
}

export type OtpRepository = ReturnType<typeof createOtpRepository>;
