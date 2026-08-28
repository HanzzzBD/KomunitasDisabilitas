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
