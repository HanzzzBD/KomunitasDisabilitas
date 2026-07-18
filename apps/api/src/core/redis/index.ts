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

function createClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true, // konek saat pertama dipakai — boot API tidak menunggu Redis
    maxRetriesPerRequest: 1, // gagal cepat; retry = urusan pemanggil
    retryStrategy: (times) => Math.min(times * 500, 5000), // reconnect santai, tanpa storm
    enableOfflineQueue: false, // saat down: error langsung, bukan antre diam-diam
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
    async ping(client) {
      try {
        if (client.status === "wait") await client.connect();
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
