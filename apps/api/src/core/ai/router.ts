// core/ai — router dua provider + circuit breaker (PR-042, ADR-005).
//
// Router ini SENDIRI adalah `AiProvider`: pemanggil tetap tidak tahu ada dua
// provider di baliknya, persis seperti yang dijanjikan gateway.ts.
import type { ZodType } from "zod";
import {
  createCircuitBreaker,
  type CircuitBreaker,
  type CircuitBreakerOptions,
} from "./breaker.js";
import {
  AiProviderError,
  type AiChatRequest,
  type AiChatResponse,
  type AiEmbedRequest,
  type AiEmbedResponse,
  type AiErrorCode,
  type AiJsonResponse,
  type AiProvider,
} from "./types.js";

export const AI_ROUTER_NAME = "router";

/**
 * Kode yang berarti "provider ini sedang tidak sanggup" — sinyal KESEHATAN,
 * lepas dari isi permintaan. Hanya inilah yang memicu peralihan ke cadangan dan
 * yang dihitung breaker.
 *
 * Yang sengaja TIDAK ada di sini:
 * - `AI_SAFETY_BLOCK` dan `AI_INVALID_OUTPUT` — keduanya VONIS ISI, bukan
 *   kesehatan provider. Prompt yang ditahan penyaring Gemini belum tentu
 *   ditahan Groq (model berbeda); mengulanginya di sana berarti mencuci vonis
 *   keamanan yang tidak konsisten — itu keputusan produk/hukum, bukan router.
 *   `AI_INVALID_OUTPUT` adalah `chatJson` yang gagal skema kita; disiplin JSON
 *   mode Llama lebih longgar, jadi mengalihkannya justru mencuci kelemahan itu
 *   lewat jalur Gemini yang sudah tervalidasi.
 * - `AI_NOT_CONFIGURED` — keadaan tetap per-boot, bukan gangguan sesaat.
 *   Menghitungnya akan membuka sirkuit provider yang memang sengaja dimatikan.
 */
const KODE_ALIH: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  "AI_RATE_LIMIT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_NETWORK_ERROR",
]);

function sinyalKesehatan(err: unknown): err is AiProviderError {
  return err instanceof AiProviderError && KODE_ALIH.has(err.code);
}

export interface AiRouterDeps {
  /** Provider utama — Gemini. Satu-satunya yang melayani `embed`. */
  primary: AiProvider;
  /** Cadangan untuk chat/chatJson — Groq. */
  fallback: AiProvider;
  /**
   * Tuas rollback (`AI_ROUTER_FORCE_PROVIDER`): pin ke satu provider, TANPA
   * fallback dan TANPA breaker. Dipakai saat kita perlu mematikan satu provider
   * tanpa deploy — jadi ia harus melewati juga mekanisme yang mungkin bermasalah.
   */
  forceProvider?: string;
  /** Breaker siap pakai (test menyuntik jam lewat sini); default dibuat sendiri. */
  breakers?: { primary: CircuitBreaker; fallback: CircuitBreaker };
  /** Opsi breaker baku bila `breakers` tidak diberikan. */
  breakerOptions?: CircuitBreakerOptions;
}

/** Satu percobaan ke satu provider, dengan breaker-nya. */
async function lewatBreaker<T>(
  provider: AiProvider,
  breaker: CircuitBreaker,
  panggil: (p: AiProvider) => Promise<T>,
): Promise<T> {
  if (!breaker.canAttempt()) {
    // Gagal SEKETIKA tanpa menyentuh jaringan — inilah gunanya breaker.
    // Kodenya sengaja termasuk KODE_ALIH supaya sirkuit utama yang terbuka
    // mengalihkan trafik ke cadangan, bukan menghentikannya.
    throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", provider.name, {
      detail: "sirkuit terbuka",
    });
  }
  try {
    const hasil = await panggil(provider);
    breaker.recordSuccess();
    return hasil;
  } catch (err) {
    // Hanya sinyal kesehatan yang menggerakkan sirkuit. Vonis isi dan
    // AI_NOT_CONFIGURED bukan bukti provider sakit, jadi hitungan berturut
    // direset — kalau tidak, satu penjajakan `half-open` yang kebetulan kena
    // AI_SAFETY_BLOCK akan menggantung selamanya tanpa pernah menutup sirkuit.
    if (sinyalKesehatan(err)) breaker.recordFailure();
    else breaker.recordSuccess();
    throw err;
  }
}

/**
 * Rakit router. `chat`/`chatJson` beralih ke cadangan saat provider utama
 * memberi sinyal kesehatan; `embed` TIDAK PUNYA jalur cadangan sama sekali —
 * lihat komentar di bawah.
 */
export function createAiRouter(deps: AiRouterDeps): AiProvider {
  const { primary, fallback } = deps;
  const breakers = deps.breakers ?? {
    primary: createCircuitBreaker(deps.breakerOptions),
    fallback: createCircuitBreaker(deps.breakerOptions),
  };

  const dipaksa =
    deps.forceProvider === undefined
      ? undefined
      : deps.forceProvider === fallback.name
        ? fallback
        : primary;

  /**
   * Jalankan satu kapabilitas chat. `panggil` menerima provider dan meneruskan
   * permintaan APA ADANYA — tidak ada satu pun data tambahan yang diselipkan
   * untuk cadangan (syarat kesetaraan payload, catatan keamanan PR-042).
   */
  async function denganCadangan<T>(panggil: (p: AiProvider) => Promise<T>): Promise<T> {
    if (dipaksa !== undefined) return panggil(dipaksa);

    let awal: AiProviderError;
    try {
      return await lewatBreaker(primary, breakers.primary, panggil);
    } catch (err) {
      if (!sinyalKesehatan(err)) throw err;
      awal = err;
    }

    try {
      return await lewatBreaker(fallback, breakers.fallback, panggil);
    } catch {
      // Cadangan gagal juga: yang dilihat pemanggil adalah error PROVIDER UTAMA.
      // Peralihan tadi adalah usaha penyelamatan yang tidak pernah ia minta, dan
      // menonjolkan kegagalannya akan salah menunjuk penyebab — mis. "Layanan AI
      // belum dikonfigurasi" (kunci Groq kosong) padahal yang terjadi adalah
      // Gemini kehabisan kuota.
      throw awal;
    }
  }

  return {
    name: dipaksa?.name ?? AI_ROUTER_NAME,

    chat(request: AiChatRequest): Promise<AiChatResponse> {
      return denganCadangan((p) => p.chat(request));
    },

    chatJson<T>(request: AiChatRequest, schema: ZodType<T>): Promise<AiJsonResponse<T>> {
      return denganCadangan((p) => p.chatJson(request, schema));
    },

    /**
     * `embed` TIDAK PERNAH beralih provider — dan jalur untuk itu memang tidak
     * ditulis, bukan sekadar dimatikan dengan flag. Dua alasan yang saling
     * menguatkan: Groq tidak punya endpoint embedding sama sekali, dan vektor
     * dari model berbeda tidak sebanding dengan yang sudah tersimpan di kolom
     * `vector(768)` — mencampurnya merusak hasil pencocokan tanpa gejala.
     * Kegagalannya sampai ke pemanggil sebagai `AiProviderError` biasa, supaya
     * job antrean mengulangnya dengan kebijakan retry-nya sendiri (ADR-004).
     */
    embed(request: AiEmbedRequest): Promise<AiEmbedResponse> {
      if (dipaksa !== undefined) return dipaksa.embed(request);
      return lewatBreaker(primary, breakers.primary, (p) => p.embed(request));
    },
  };
}
