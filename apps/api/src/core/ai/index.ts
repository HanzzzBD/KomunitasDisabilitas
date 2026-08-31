// core/ai — barrel export (AI Gateway, ADR-012).
//
// Pemanggil di luar `core/ai` mengimpor dari sini saja. Adapter provider
// (`providers/gemini.js`) sengaja TIDAK diekspor ulang: memilih provider adalah
// tugas gateway, dan modul yang bisa mengimpor adapter langsung akan
// mengunci dirinya ke satu provider — persis yang ADR-012 larang.
export { createAiGateway, createUnavailableAiGateway, type AiGatewayEnv } from "./gateway.js";
export {
  AI_EMBED_DIMENSIONS,
  AI_ERROR_MESSAGES,
  AiProviderError,
  type AiChatMessage,
  type AiChatRequest,
  type AiChatResponse,
  type AiChatRole,
  type AiEmbedRequest,
  type AiEmbedResponse,
  type AiErrorCode,
  type AiJsonResponse,
  type AiProvider,
  type AiUsage,
} from "./types.js";

// Kuota AI (PR-043). CATATAN: gerbang fail-fast di src/index.ts TIDAK boleh
// mengimpor barrel ini — ia mengambil `loadAiQuotaConfig` lewat jalur sempit
// `./core/ai/quota-config.js`. Barrel ini menyeret core/http (dan lewatnya
// express); jalur sempit itu hanya menyentuh zod + core/config.
export {
  AI_FEATURES,
  AI_QUOTA_BUFFER_RATIO,
  AI_QUOTA_DEFAULTS,
  AI_QUOTA_FREE_TIER_PER_DAY,
  AI_QUOTA_GLOBAL_DEFAULT,
  AI_QUOTA_GLOBAL_ENV_VAR,
  aiQuotaEnvVar,
  aiQuotaEnvVars,
  loadAiQuotaConfig,
  type AiQuotaConfig,
  type AiQuotaFeature,
} from "./quota-config.js";
export {
  AI_QUOTA_PREFIX,
  AI_QUOTA_RETRY_GAGAL_DETIK,
  AI_QUOTA_TTL_GRACE_DETIK,
  bolehDikembalikan,
  createAiQuota,
  isKuotaHabis,
  KODE_KUOTA_HABIS,
  KODE_LAYAK_DIKEMBALIKAN,
  kunciKuotaGlobal,
  kunciKuotaUser,
  type AiQuota,
  type AiQuotaDeps,
  type AiQuotaFitur,
  type AiQuotaPemakaian,
  type AiQuotaReservasi,
  type AiQuotaRingkasan,
  type QuotaRedisLike,
} from "./quota.js";
export { detikKeTengahMalamWib, hariWib, ZONA_WIB } from "./waktu-wib.js";
