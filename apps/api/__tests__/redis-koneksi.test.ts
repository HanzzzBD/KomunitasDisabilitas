// Integration: core/redis terhadap Redis NYATA, lewat createRedisClients().
//
// Kenapa berkas ini ada. Bug yang ditambalnya lolos dari 671 test karena tidak
// satu pun menjalankan Redis sungguhan MELALUI factory-nya:
//   - unit test memakai fake in-memory (tidak punya koneksi sama sekali);
//   - `auth-otp-redis.test.ts` merakit klien ioredis-nya SENDIRI — tanpa
//     `enableOfflineQueue: false` dan dengan `connect()` eksplisit, jadi ia
//     menghindari kedua sebab bug-nya;
//   - test HTTP memakai `redis://127.0.0.1:9` yang sengaja mati, jadi hanya
//     jalur gagal yang teruji.
//
// Yang diuji di sini adalah PERAKITANNYA, bukan ioredis. Karena itu setiap test
// berangkat dari `createRedisClients()`, bukan dari `new Redis()`.
import { describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { createRedisClients } from "../src/core/redis/index.js";

// Sama seperti auth-otp-redis.test.ts: di CI hanya REDIS_QUEUE_URL (6380) yang
// tersedia, dan untuk menguji perakitan koneksi Redis mana pun sama sahnya.
const REDIS_URL = process.env.REDIS_URL ?? process.env.REDIS_QUEUE_URL ?? "redis://localhost:6380";
/** Port 9 = discard; tidak pernah ada yang mendengarkan. Konvensi test lain. */
const REDIS_MATI = "redis://127.0.0.1:9";

function klien(url: string) {
  return createRedisClients({ REDIS_URL: url, REDIS_QUEUE_URL: url });
}

/**
 * Deteksi ketersediaan server memakai klien MENTAH, bukan createRedisClients.
 *
 * Ini bukan kerewelan gaya. Versi pertama test ini memakai `r.ping()` dari
 * factory-nya sendiri, dan saat perakitannya rusak probe ikut gagal sehingga
 * seluruh test **di-skip alih-alih merah** — penjaga yang lulus secara hampa,
 * persis kegagalan yang seharusnya ia tangkap. Terbukti lewat uji mutasi.
 *
 * Yang ingin diketahui di sini hanya "apakah ada server Redis di alamat ini",
 * dan pertanyaan itu harus dijawab tanpa menyentuh kode yang sedang diuji.
 */
async function redisHidup(): Promise<boolean> {
  const mentah = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  mentah.on("error", () => {});
  try {
    await mentah.connect();
    return (await mentah.ping()) === "PONG";
  } catch {
    return false;
  } finally {
    mentah.disconnect();
  }
}

const TERSEDIA = await redisHidup();

describe("core/redis — koneksi klien cache", () => {
  it("klien SEGAR menjalankan perintah pertama tanpa ping/readyz lebih dulu", async (ctx) => {
    if (!TERSEDIA) return ctx.skip();

    // INI regresi utamanya. Pada kode lama (lazyConnect + enableOfflineQueue
    // false) baris di bawah melempar "Stream isn't writeable ..." — dan itulah
    // yang membuat POST /auth/otp/request menjawab 500 di lingkungan nyata.
    // Tidak ada ping() di mana pun sebelum ini, DENGAN SENGAJA.
    const r = klien(REDIS_URL);
    try {
      await expect(r.cache.ttl("uji:koneksi:tidak-ada")).resolves.toBe(-2);
    } finally {
      await r.end();
    }
  }, 15_000);

  it("klien queue juga, sebab keduanya dirakit fungsi yang sama", async (ctx) => {
    if (!TERSEDIA) return ctx.skip();

    const r = klien(REDIS_URL);
    try {
      await expect(r.queue.ttl("uji:koneksi:tidak-ada")).resolves.toBe(-2);
    } finally {
      await r.end();
    }
  }, 15_000);

  it("perintah tepat setelah koneksi terputus tetap berhasil (jendela reconnect)", async (ctx) => {
    if (!TERSEDIA) return ctx.skip();

    const r = klien(REDIS_URL);
    try {
      await r.cache.set("uji:reconnect", "1", "EX", 30);

      // disconnect(true) memutus lalu menyambung ulang — tiruan paling dekat
      // dari koneksi yang jatuh di produksi tanpa mematikan server Redis.
      // Perintah berikutnya jatuh TEPAT di jendela reconnect: dengan offline
      // queue ia menunggu, tanpanya ia langsung gagal.
      r.cache.disconnect(true);
      await expect(r.cache.get("uji:reconnect")).resolves.toBe("1");

      await r.cache.del("uji:reconnect");
    } finally {
      await r.end();
    }
  }, 20_000);

  it("Redis mati → GAGAL cepat, bukan menggantung (maxRetriesPerRequest sebagai pembatas)", async () => {
    // Pasangan dari test di atas. Antrean offline hanya boleh menjembatani
    // reconnect; saat Redis benar-benar mati ia tidak boleh menahan permintaan
    // sampai timeout HTTP. Batas 5 detik jauh di atas ~0,5 detik yang terukur,
    // supaya runner CI yang lambat tidak membuat test ini rewel.
    const r = klien(REDIS_MATI);
    const mulai = Date.now();
    try {
      await expect(r.cache.ttl("apa-saja")).rejects.toThrow();
      expect(Date.now() - mulai).toBeLessThan(5_000);
    } finally {
      await r.end();
    }
  }, 15_000);

  it("ping() melaporkan false untuk Redis mati dan true untuk yang hidup", async (ctx) => {
    const mati = klien(REDIS_MATI);
    try {
      await expect(mati.ping(mati.cache)).resolves.toBe(false);
    } finally {
      await mati.end();
    }

    if (!TERSEDIA) return ctx.skip();
    const hidup = klien(REDIS_URL);
    try {
      await expect(hidup.ping(hidup.cache)).resolves.toBe(true);
    } finally {
      await hidup.end();
    }
  }, 20_000);
});
