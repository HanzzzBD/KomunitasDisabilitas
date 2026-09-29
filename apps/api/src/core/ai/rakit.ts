// core/ai — merakit `AiClient` dari env (PR-067).
//
// KENAPA BERKAS INI ADA. Sampai PR-066 hanya `boot.ts` yang merakit `AiClient`,
// dan ia boleh memanggil `createAiGateway` langsung (U-07). PR-067 menambah
// PERAKIT KEDUA — worker ekstraksi CV. Dua composition root yang menyusun
// gateway sendiri-sendiri akan cepat atau lambat berbeda (satu lupa stream
// gateway, satu lupa cache), dan penjaga U-07 harus membuka pintu kedua untuk
// `apps/worker`. Jadi susunannya pindah ke sini, ke dalam `core/ai` yang memang
// tempat pabrik provider boleh dipanggil, dan kedua proses memanggil fungsi yang
// SAMA. Worker tetap tidak pernah menyentuh pabrik provider.
import type { Logger } from "../logger/index.js";
import { createAiPromptCache, type CacheRedisLike } from "./cache.js";
import { createAiClient, type AiClient, type AiUsageRecorder } from "./client.js";
import { createAiGateway, createAiStreamGateway, type AiGatewayEnv } from "./gateway.js";
import type { AiQuota } from "./quota.js";
import type { FetchLike } from "./types.js";

export interface RakitAiClientDeps {
  env: AiGatewayEnv;
  logger: Pick<Logger, "warn" | "error">;
  quota: AiQuota;
  /** Port `ai_usage` — di kedua proses: antrean `ai-usage-record`. */
  recorder: AiUsageRecorder;
  /** WAJIB klien `redis.cache` (allkeys-lru) bila diisi — alasan di kepala cache.ts. */
  cacheRedis?: CacheRedisLike;
  metrics?: { increment(name: string): void };
  /** Disuntik test; produksi memakai `fetch` global. */
  fetchImpl?: FetchLike;
}

export function rakitAiClient(deps: RakitAiClientDeps): AiClient {
  return createAiClient({
    provider: createAiGateway(deps.env, deps.logger, deps.fetchImpl),
    streamProvider: createAiStreamGateway(deps.env, deps.fetchImpl),
    quota: deps.quota,
    recorder: deps.recorder,
    ...(deps.cacheRedis === undefined
      ? {}
      : {
          cache: createAiPromptCache({
            redis: deps.cacheRedis,
            logger: deps.logger,
            ...(deps.metrics === undefined ? {} : { metrics: deps.metrics }),
          }),
        }),
    logger: deps.logger,
  });
}
