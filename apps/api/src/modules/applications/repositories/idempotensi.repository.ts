// modules/applications — Idempotency-Key + batas laju apply di Redis (PR-075).
//
// LAPIS PERTAMA IDEMPOTENSI (SDD §5.3): kunci disimpan 24 jam, jadi retry dengan
// kunci yang sama memutar ulang hasil pertama alih-alih melamar lagi.
//
// KENAPA REDIS CACHE (allkeys-lru), BUKAN QUEUE. Kunci yang terusir hanya
// menurunkan "putar ulang 201" menjadi "409 SUDAH_MELAMAR" dari lapis kedua
// (unique DB) — lamarannya tetap satu. Kehilangannya tidak pernah melahirkan
// lamaran ganda, jadi tidak layak menempati Redis yang tidak boleh evict.
//
// Kunci memuat userId: Idempotency-Key milik dua pengguna tidak pernah bisa
// saling memutar ulang, meski kebetulan sama.

/** Nilai pencacah berjendela + sisa umur jendelanya (bentuk sama dengan modul users). */
export interface CounterState {
  value: number;
  resetInSeconds: number;
}

/** Irisan perintah ioredis yang dipakai — fake in-memory memenuhinya di test. */
export interface ApplyRedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", detik: number, nx: "NX"): Promise<"OK" | null>;
  set(key: string, value: string, mode: "EX", detik: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

/** Isi satu kunci: lowongan yang dilamar + lamaran hasilnya (null = masih diproses). */
export interface CatatanIdempotensi {
  jobId: string;
  applicationId: string | null;
}

const KEY_IDEM = "apply:idem:";
const KEY_LAJU = "apply:laju:";

export function createIdempotensiRepository(redis: ApplyRedisLike) {
  const kunci = (userId: string, key: string) => `${KEY_IDEM}${userId}:${key}`;

  return {
    /**
     * Klaim kunci SECARA ATOMIK (`SET NX`). `true` = permintaan inilah yang
     * pertama dan boleh bekerja; `false` = kunci sudah ada (selesai atau masih
     * berjalan) — baca dengan `baca()`.
     */
    async klaim(userId: string, key: string, jobId: string, ttl: number): Promise<boolean> {
      const isi: CatatanIdempotensi = { jobId, applicationId: null };
      return (await redis.set(kunci(userId, key), JSON.stringify(isi), "EX", ttl, "NX")) === "OK";
    },

    async baca(userId: string, key: string): Promise<CatatanIdempotensi | null> {
      const mentah = await redis.get(kunci(userId, key));
      if (mentah === null) return null;
      try {
        const isi = JSON.parse(mentah) as Partial<CatatanIdempotensi>;
        if (typeof isi.jobId !== "string") return null;
        return {
          jobId: isi.jobId,
          applicationId: typeof isi.applicationId === "string" ? isi.applicationId : null,
        };
      } catch {
        return null;
      }
    },

    async selesaikan(userId: string, key: string, isi: CatatanIdempotensi, ttl: number) {
      await redis.set(kunci(userId, key), JSON.stringify(isi), "EX", ttl);
    },

    /** Lepas klaim saat permintaan GAGAL, supaya retry dengan kunci sama bisa bekerja. */
    async lepas(userId: string, key: string): Promise<void> {
      await redis.del(kunci(userId, key));
    },

    /**
     * Batas laju per pengguna — mekanisme yang SAMA dengan kuota ekspor PDP
     * (`export-quota.repository.ts`): INCR + EXPIRE saat pertama, TTL tidak
     * diperpanjang.
     */
    async bumpLaju(userId: string, windowSeconds: number): Promise<CounterState> {
      const key = `${KEY_LAJU}${userId}`;
      const value = await redis.incr(key);
      if (value === 1) {
        await redis.expire(key, windowSeconds);
        return { value, resetInSeconds: windowSeconds };
      }
      const sisa = await redis.ttl(key);
      if (sisa < 0) {
        await redis.expire(key, windowSeconds);
        return { value, resetInSeconds: windowSeconds };
      }
      return { value, resetInSeconds: sisa };
    },
  };
}

export type IdempotensiRepository = ReturnType<typeof createIdempotensiRepository>;
