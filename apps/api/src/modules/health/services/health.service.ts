// modules/health — service: liveness & readiness (SDD §11, ADR-004/017).
// Tanpa repository: yang diperiksa infra (DB/Redis), bukan data bisnis.
import type { DbClient } from "../../../core/db/index.js";
import type { RedisClients } from "../../../core/redis/index.js";

export interface HealthService {
  /** Liveness: proses hidup — tidak menyentuh dependensi. */
  liveness(): { status: "hidup" };
  /** Readiness: ping DB + kedua Redis paralel dengan batas waktu. */
  readiness(): Promise<{ siap: boolean; detail: ReadinessDetail }>;
}

export interface ReadinessDetail {
  db: boolean;
  redisCache: boolean;
  redisQueue: boolean;
}

const READINESS_TIMEOUT_MS = 2000;

/** Ping yang menggantung dianggap gagal setelah batas waktu. */
async function withTimeout(check: Promise<boolean>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), READINESS_TIMEOUT_MS);
  });
  const result = await Promise.race([check, timeout]);
  clearTimeout(timer);
  return result;
}

export function createHealthService(db: DbClient, redis: RedisClients): HealthService {
  return {
    liveness() {
      return { status: "hidup" };
    },

    async readiness() {
      const [dbOk, cacheOk, queueOk] = await Promise.all([
        withTimeout(db.ping()),
        withTimeout(redis.ping(redis.cache)),
        withTimeout(redis.ping(redis.queue)),
      ]);
      const detail: ReadinessDetail = { db: dbOk, redisCache: cacheOk, redisQueue: queueOk };
      return { siap: dbOk && cacheOk && queueOk, detail };
    },
  };
}
