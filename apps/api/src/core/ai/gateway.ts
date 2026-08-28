// core/ai — perakitan AI Gateway (PR-041, ADR-012).
//
// Pemanggil menerima `AiProvider`, TITIK. Ia tidak tahu — dan tidak boleh tahu —
// bahwa hari ini hanya ada satu provider di baliknya. Itulah yang membuat
// PR-042 (Groq + router + circuit breaker) bisa mengganti isi fungsi ini tanpa
// menyentuh satu pun pemanggil; kuota (PR-043), registry prompt (PR-044), dan
// kontrak degradasi (PR-046) masuk lewat pintu yang sama.
import type { Env } from "../config/index.js";
import type { Logger } from "../logger/index.js";
import { createGeminiProvider } from "./providers/gemini.js";
import { AiProviderError, type AiProvider } from "./types.js";

const BELUM_DIKONFIGURASI = "belum-dikonfigurasi";

/**
 * Gateway "belum dikonfigurasi": setiap panggilan ditolak AI_NOT_CONFIGURED.
 *
 * Deny-by-default, pola `createUnavailableOtpSender`. Boot TIDAK gagal karena
 * kunci AI kosong: fitur AI selalu punya jalur non-AI (ADR-005), jadi API tanpa
 * kunci adalah keadaan sah untuk dev — yang tidak sah adalah panggilan AI yang
 * diam-diam mengembalikan sesuatu.
 */
export function createUnavailableAiGateway(): AiProvider {
  const tolak = (): Promise<never> =>
    Promise.reject(new AiProviderError("AI_NOT_CONFIGURED", BELUM_DIKONFIGURASI));

  return {
    name: BELUM_DIKONFIGURASI,
    chat: tolak,
    chatJson: tolak,
    embed: tolak,
  };
}

/** Env yang dibaca gateway — sengaja sempit supaya ketergantungannya terbaca. */
export type AiGatewayEnv = Pick<
  Env,
  | "GEMINI_API_KEY"
  | "GEMINI_BASE_URL"
  | "GEMINI_CHAT_MODEL"
  | "GEMINI_EMBED_MODEL"
  | "GEMINI_TIMEOUT_MS"
>;

/**
 * Rakit gateway dari env. Tanpa `GEMINI_API_KEY` hasilnya gateway yang selalu
 * menolak — peringatannya dicatat SEKALI di sini, bukan pada tiap panggilan,
 * supaya operator tahu fitur AI mati tanpa membanjiri log saat ia memang mati.
 */
export function createAiGateway(
  env: AiGatewayEnv,
  logger: Pick<Logger, "warn">,
  fetchImpl?: Parameters<typeof createGeminiProvider>[1],
): AiProvider {
  if (env.GEMINI_API_KEY === undefined) {
    logger.warn(
      { provider: BELUM_DIKONFIGURASI },
      "GEMINI_API_KEY belum di-set — seluruh panggilan AI akan ditolak",
    );
    return createUnavailableAiGateway();
  }

  return createGeminiProvider(
    {
      apiKey: env.GEMINI_API_KEY,
      baseUrl: env.GEMINI_BASE_URL,
      chatModel: env.GEMINI_CHAT_MODEL,
      embedModel: env.GEMINI_EMBED_MODEL,
      timeoutMs: env.GEMINI_TIMEOUT_MS,
    },
    fetchImpl,
  );
}
