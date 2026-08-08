// core/redis — dua klien terpisah (ADR-004 revisi PR-008):
// cache (allkeys-lru) vs queue (noeviction, dipakai BullMQ mulai PR-010).
// Klien queue di API dipakai untuk enqueue & readiness ping saja.
import { Redis } from "ioredis";
import type { Env } from "../config/index.js";

export interface RedisClients {
  cache: Redis;
  queue: Redis;
  /** PING dengan timeout — true bila terjangkau. */
  ping(client: Redis): Promise<boolean>;
  /** Tutup kedua koneksi saat shutdown. */
  end(): Promise<void>;
}

/**
 * Konstruktor ioredis TIDAK memblokir: koneksi dibuka di latar, jadi boot API
 * tetap tidak menunggu Redis (niat asli `lazyConnect`) sementara perintah
 * pertama tidak lagi jatuh ke koneksi yang belum ada.
 *
 * `lazyConnect: true` + `enableOfflineQueue: false` sebelumnya SALING
 * MENIADAKAN: lazyConnect menunda koneksi sampai perintah pertama, tetapi
 * perintah itu hanya bisa menunggu koneksi selesai bila boleh diantre — dan
 * offline queue yang mati menolaknya seketika ("Stream isn't writeable").
 * Akibatnya seluruh jalur Redis (OTP, kuota ekspor PDP) menjawab 500 kecuali
 * `ping()` kebetulan berjalan lebih dulu dan menyambungkan klien.
 *
 * Batas antrean tetap ada dan bukan tak terhingga: `maxRetriesPerRequest`
 * membuat perintah menyerah setelah satu percobaan ulang, jadi saat Redis
 * benar-benar mati pemanggil menerima error dalam hitungan ratusan milidetik
 * alih-alih menggantung. Antrean hanya menjembatani jendela reconnect —
 * yang justru kejadian jauh lebih sering daripada Redis mati total.
 */
function createClient(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1, // gagal cepat; retry = urusan pemanggil, dan pembatas antrean
    retryStrategy: (times) => Math.min(times * 500, 5000), // reconnect santai, tanpa storm
    enableOfflineQueue: true, // jembatani jendela reconnect; dibatasi maxRetriesPerRequest
  });
}

export function createRedisClients(env: Pick<Env, "REDIS_URL" | "REDIS_QUEUE_URL">): RedisClients {
  const cache = createClient(env.REDIS_URL);
  const queue = createClient(env.REDIS_QUEUE_URL);
  // Error koneksi ditangani per operasi; listener kosong mencegah crash
  // unhandled 'error' event saat Redis down.
  cache.on("error", () => {});
  queue.on("error", () => {});

  return {
    cache,
    queue,
    // TIDAK ada `connect()` manual di sini lagi. Cabang itu membuat health
    // memakai jalur yang BERBEDA dari setiap pemanggil lain: ia menyambungkan
    // klien, pemanggil biasa tidak. Justru divergensi itu yang menyembunyikan
    // bug di atas — `/readyz` melaporkan `redisCache: true` sementara endpoint
    // OTP menjawab 500. Health kini memakai jalur yang sama persis, sehingga
    // "siap" berarti hal yang sama bagi keduanya.
    async ping(client) {
      try {
        const res = await client.ping();
        return res === "PONG";
      } catch {
        return false;
      }
    },
    async end() {
      // disconnect() bukan quit(): saat Redis mati, quit() menggantung.
      cache.disconnect();
      queue.disconnect();
    },
  };
}
