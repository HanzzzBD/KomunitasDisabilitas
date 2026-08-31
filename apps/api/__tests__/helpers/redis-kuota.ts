// Redis in-memory seukuran kontrak `QuotaRedisLike` (PR-043).
//
// KENAPA BUKAN REDIS SUNGGUHAN. Repo ini sudah punya sejumlah test yang
// melewati dirinya sendiri saat Docker mati (`queue-redis.test.ts` dkk), dan
// itu wajar untuk hal yang memang hanya bisa dibuktikan oleh server nyata (TTL
// yang benar-benar dipasang, kebijakan eviction). Penegakan kuota BUKAN salah
// satunya: mesinnya menerima `QuotaRedisLike` yang sempit, jadi seluruh
// aturannya — batas per pengguna, pagu global, refund, gagal tertutup — bisa
// dibuktikan tanpa server, dan karena itu ia TIDAK BOLEH ikut rombongan yang
// diam-diam terlewat di mesin tanpa Docker.
//
// Fake ini menyimpan TTL yang dipasang supaya test bisa memeriksa bahwa setiap
// kunci memang diberi kedaluwarsa (syarat menumpang di instans `noeviction`).
import type { QuotaRedisLike } from "../../src/core/ai/quota.js";

interface Entri {
  nilai: number;
  /** null = belum pernah di-EXPIRE (padanan TTL -1 di Redis). */
  ttl: number | null;
}

export interface RedisKuotaPalsu extends QuotaRedisLike {
  /** Nilai penghitung; 0 bila kuncinya tidak ada. */
  nilai(key: string): number;
  /** TTL terpasang, atau -1 bila kunci tanpa kedaluwarsa, -2 bila tidak ada. */
  ttlTerpasang(key: string): number;
  daftarKunci(): string[];
  /** Semua perintah berikutnya melempar — meniru Redis tak terjangkau. */
  matikan(): void;
  hidupkan(): void;
  /** Berapa kali perintah apa pun dipanggil (untuk membuktikan "tidak menyentuh Redis"). */
  jumlahPerintah(): number;
}

export function redisKuotaPalsu(awal: Record<string, number> = {}): RedisKuotaPalsu {
  const isi = new Map<string, Entri>();
  for (const [key, nilai] of Object.entries(awal)) isi.set(key, { nilai, ttl: null });
  let mati = false;
  let perintah = 0;

  function jalankan<T>(hasil: () => T): Promise<T> {
    perintah += 1;
    if (mati) return Promise.reject(new Error("Redis tidak terjangkau (fake)"));
    return Promise.resolve(hasil());
  }

  return {
    incr: (key) =>
      jalankan(() => {
        const entri = isi.get(key) ?? { nilai: 0, ttl: null };
        entri.nilai += 1;
        isi.set(key, entri);
        return entri.nilai;
      }),
    decr: (key) =>
      jalankan(() => {
        const entri = isi.get(key) ?? { nilai: 0, ttl: null };
        entri.nilai -= 1;
        isi.set(key, entri);
        return entri.nilai;
      }),
    expire: (key, seconds) =>
      jalankan(() => {
        const entri = isi.get(key);
        if (entri === undefined) return 0;
        entri.ttl = seconds;
        return 1;
      }),
    ttl: (key) =>
      jalankan(() => {
        const entri = isi.get(key);
        if (entri === undefined) return -2;
        return entri.ttl ?? -1;
      }),
    get: (key) =>
      jalankan(() => {
        const entri = isi.get(key);
        return entri === undefined ? null : String(entri.nilai);
      }),
    nilai: (key) => isi.get(key)?.nilai ?? 0,
    ttlTerpasang: (key) => {
      const entri = isi.get(key);
      if (entri === undefined) return -2;
      return entri.ttl ?? -1;
    },
    daftarKunci: () => [...isi.keys()].sort(),
    matikan: () => {
      mati = true;
    },
    hidupkan: () => {
      mati = false;
    },
    jumlahPerintah: () => perintah,
  };
}
