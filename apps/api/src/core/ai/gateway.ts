// core/ai — perakitan AI Gateway (PR-041/PR-042, ADR-012).
//
// Pemanggil menerima `AiProvider`, TITIK. Ia tidak tahu — dan tidak boleh tahu —
// provider mana yang menjawab. Itulah yang membuat PR-042 bisa menyelipkan
// router + circuit breaker di sini tanpa menyentuh satu pun pemanggil; kuota
// (PR-043), registry prompt (PR-044), dan kontrak degradasi (PR-046) masuk lewat
// pintu yang sama.
import type { Env } from "../config/index.js";
import type { Logger } from "../logger/index.js";
import { createGeminiProvider, GEMINI_PROVIDER } from "./providers/gemini.js";
import { createGroqProvider, GROQ_PROVIDER } from "./providers/groq.js";
import { createAiRouter } from "./router.js";
import { AiProviderError, type AiProvider, type FetchLike } from "./types.js";

const BELUM_DIKONFIGURASI = "belum-dikonfigurasi";

/**
 * Provider pengganti untuk kunci yang kosong: setiap panggilan ditolak
 * AI_NOT_CONFIGURED, tetapi NAMANYA tetap nama provider aslinya supaya log,
 * metrik, dan tuas `AI_ROUTER_FORCE_PROVIDER` tetap menunjuk sesuatu yang nyata.
 *
 * Deny-by-default, pola `createUnavailableOtpSender`. Boot TIDAK gagal karena
 * kunci AI kosong: fitur AI selalu punya jalur non-AI (ADR-005), jadi API tanpa
 * kunci adalah keadaan sah untuk dev — yang tidak sah adalah panggilan AI yang
 * diam-diam mengembalikan sesuatu.
 */
function createBelumDikonfigurasi(nama: string): AiProvider {
  const tolak = (): Promise<never> =>
    Promise.reject(new AiProviderError("AI_NOT_CONFIGURED", nama));

  return {
    name: nama,
    chat: tolak,
    chatJson: tolak,
    embed: tolak,
  };
}

/** Gateway "belum dikonfigurasi" — dipakai saat TIDAK ADA satu pun kunci AI. */
export function createUnavailableAiGateway(): AiProvider {
  return createBelumDikonfigurasi(BELUM_DIKONFIGURASI);
}

/** Env yang dibaca gateway — sengaja sempit supaya ketergantungannya terbaca. */
export type AiGatewayEnv = Pick<
  Env,
  | "GEMINI_API_KEY"
  | "GEMINI_BASE_URL"
  | "GEMINI_CHAT_MODEL"
  | "GEMINI_EMBED_MODEL"
  | "GEMINI_TIMEOUT_MS"
  | "GROQ_API_KEY"
  | "GROQ_BASE_URL"
  | "GROQ_CHAT_MODEL"
  | "GROQ_TIMEOUT_MS"
  | "AI_ROUTER_FORCE_PROVIDER"
>;

/**
 * Rakit gateway dari env: Gemini sebagai utama, Groq sebagai cadangan chat, di
 * bawah router + circuit breaker.
 *
 * Kunci yang kosong TIDAK membuat provider-nya hilang dari router — ia diganti
 * penolak AI_NOT_CONFIGURED yang bernama sama. Bentuknya jadi seragam: satu
 * jalur kode untuk semua kombinasi kunci, dan pemanggil tetap melihat error asli
 * dari provider utama (lihat router.ts) alih-alih "belum dikonfigurasi" dari
 * cadangan yang memang tidak pernah dipasang.
 *
 * Peringatan dicatat SEKALI saat perakitan, bukan pada tiap panggilan, supaya
 * operator tahu apa yang mati tanpa membanjiri log saat ia memang mati.
 */
export function createAiGateway(
  env: AiGatewayEnv,
  logger: Pick<Logger, "warn">,
  fetchImpl?: FetchLike,
): AiProvider {
  if (env.GEMINI_API_KEY === undefined && env.GROQ_API_KEY === undefined) {
    logger.warn(
      { provider: BELUM_DIKONFIGURASI },
      "GEMINI_API_KEY dan GROQ_API_KEY belum di-set — seluruh panggilan AI akan ditolak",
    );
    return createUnavailableAiGateway();
  }

  if (env.GEMINI_API_KEY === undefined) {
    logger.warn(
      { provider: GEMINI_PROVIDER },
      "GEMINI_API_KEY belum di-set — chat memakai Groq, dan embedding tidak tersedia",
    );
  } else if (env.GROQ_API_KEY === undefined) {
    logger.warn(
      { provider: GROQ_PROVIDER },
      "GROQ_API_KEY belum di-set — tidak ada cadangan saat Gemini penuh atau tumbang",
    );
  }

  const gemini =
    env.GEMINI_API_KEY === undefined
      ? createBelumDikonfigurasi(GEMINI_PROVIDER)
      : createGeminiProvider(
          {
            apiKey: env.GEMINI_API_KEY,
            baseUrl: env.GEMINI_BASE_URL,
            chatModel: env.GEMINI_CHAT_MODEL,
            embedModel: env.GEMINI_EMBED_MODEL,
            timeoutMs: env.GEMINI_TIMEOUT_MS,
          },
          fetchImpl,
        );

  const groq =
    env.GROQ_API_KEY === undefined
      ? createBelumDikonfigurasi(GROQ_PROVIDER)
      : createGroqProvider(
          {
            apiKey: env.GROQ_API_KEY,
            baseUrl: env.GROQ_BASE_URL,
            chatModel: env.GROQ_CHAT_MODEL,
            timeoutMs: env.GROQ_TIMEOUT_MS,
          },
          fetchImpl,
        );

  return createAiRouter({
    primary: gemini,
    fallback: groq,
    // Satu-satunya tempat kegagalan provider cadangan pernah terlihat manusia
    // (PR-043b, utang PR-042). Yang dilempar ke pemanggil tetap error PRIMER —
    // hook ini hanya mencatat, dan `warn` (bukan `error`) karena keadaannya
    // sudah dilaporkan sekali oleh error yang dilempar.
    onFallbackFailure: (info) =>
      logger.warn(
        { err: info.error, provider: info.fallbackName, primary: info.primary.code },
        "Provider cadangan ikut gagal — pemanggil menerima error provider utama",
      ),
    ...(env.AI_ROUTER_FORCE_PROVIDER !== undefined
      ? { forceProvider: env.AI_ROUTER_FORCE_PROVIDER }
      : {}),
  });
}
