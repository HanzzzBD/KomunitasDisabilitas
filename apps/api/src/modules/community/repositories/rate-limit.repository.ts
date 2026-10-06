export interface CommunityRedis {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
}
// Atomic increment + expiry, shared across API replicas. Only hashes/UUIDs in keys.
const BUMP = `local n = redis.call('INCR', KEYS[1])
if n == 1 or redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {n, redis.call('PTTL', KEYS[1])}`;
export function createCommunityRateRepository(redis: CommunityRedis) {
  return {
    async bump(bucket: "read" | "write", key: string, windowMs: number) {
      const result = await redis.eval(BUMP, 1, `community:rate:${bucket}:${key}`, windowMs);
      if (
        !Array.isArray(result) ||
        result.length !== 2 ||
        result.some((n) => !Number.isFinite(n))
      ) {
        throw new Error("Penghitung Community tidak valid");
      }
      return {
        value: Number(result[0]),
        retryAfterSeconds: Math.max(1, Math.ceil(Number(result[1]) / 1000)),
      };
    },
  };
}
export type CommunityRateRepository = ReturnType<typeof createCommunityRateRepository>;
