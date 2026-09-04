// core/ai — `AiClient`: satu pintu yang mengikat kuota → provider → jejak biaya
// (PR-043b, ADR-005, ADR-012, SDD §7.1 langkah 5 "Catat ai_usage (async)").
//
// KENAPA BUKAN `AiProvider` LAGI. `AiProvider.chat(request)` sengaja tidak
// membawa identitas maupun nama fitur — itulah yang membuat router bisa
// meneruskan permintaan APA ADANYA ke provider cadangan (syarat kesetaraan
// payload, catatan keamanan PR-042). Kuota dan `ai_usage` menuntut keduanya.
// Menjadikan `AiClient` sebuah `AiProvider` berarti menyelundupkan `userId` ke
// dalam `request`, dan — lebih buruk — membuat setiap pemanggil `AiProvider`
// yang sudah ada diam-diam melewati kuota. Karena itu antarmukanya terpisah,
// dengan konteks yang harus ditulis eksplisit di setiap tempat panggilan.
//
// BERKAS INI BEBAS PRISMA. Pencatatan diminta lewat port `AiUsageRecorder`;
// implementasinya (antrean → worker → INSERT) hidup di `modules/ai`. Dengan
// begitu `core/ai` tidak pernah tahu — dan tidak perlu tahu — apakah baris itu
// ditulis lewat antrean hari ini atau langsung kelak.
import type { ZodType } from "zod";
import { uuidV7 } from "../ids/index.js";
import type { Logger } from "../logger/index.js";
import type { AiPromptCache } from "./cache.js";
import type { PromptTemplate } from "./prompts/index.js";
import type { AiQuota } from "./quota.js";
import type { AiQuotaFeature } from "./quota-config.js";
import type {
  AiChatRequest,
  AiChatResponse,
  AiEmbedRequest,
  AiEmbedResponse,
  AiJsonResponse,
  AiProvider,
  AiUsage,
} from "./types.js";

/** Siapa memanggil, untuk fitur apa. Identitas datang dari sesi, bukan body. */
export interface AiCallContext {
  userId: string;
  feature: AiQuotaFeature;
  /**
   * Versi template prompt (SDD §7.3). Belum ada produsennya: registry
   * `prompts/<nama>.vN.ts` lahir di PR-044, dan sampai saat itu setiap baris
   * `ai_usage.prompt_version` bernilai NULL — yang memang fakta yang benar.
   */
  promptVersion?: string;
}

/**
 * Satu panggilan AI sukses, siap dicatat. Sengaja HANYA metadata biaya: tidak
 * ada isi prompt, tidak ada jawaban model. Kalimat ini adalah kontraknya —
 * menambahkan field bermuatan teks pengguna di sini berarti membocorkannya ke
 * antrean, ke DB, dan ke setiap log yang menyentuh keduanya.
 */
export interface AiUsagePeristiwa {
  /** UUID baris `ai_usage`, dibuat DI SINI — fondasi idempotensi penulisan. */
  id: string;
  userId: string;
  feature: AiQuotaFeature;
  /** Provider yang BENAR-BENAR menjawab (`response.provider`), bukan "router". */
  provider: string;
  tokensIn: number;
  tokensOut: number;
  promptVersion?: string;
  createdAt: Date;
}

/**
 * Port pencatatan. Kontraknya satu kalimat: **`catat` TIDAK PERNAH menolak.**
 *
 * Jejak biaya adalah kepentingan kita, bukan kepentingan pengguna yang sedang
 * menunggu jawabannya. Antrean penuh, Redis tumbang, atau payload yang cacat
 * tidak boleh mencabut jawaban AI yang sudah berhasil dibuat dan sudah dibayar
 * tokennya.
 */
export interface AiUsageRecorder {
  catat(peristiwa: AiUsagePeristiwa): Promise<void>;
}

/**
 * Jawaban satu panggilan template prompt (PR-044b).
 *
 * `provider`/`model`/`usage` ABSEN pada jawaban dari cache, dan itu bukan
 * kelalaian: pada cache hit ketiganya memang TIDAK ADA — tidak ada provider yang
 * menjawab, tidak ada token yang terbakar. Mengarang nilainya (`provider:
 * "cache"`, `usage: 0/0`) akan menyelundupkan panggilan berbiaya nol ke dalam
 * angka yang dipakai orang untuk merekonsiliasi tagihan. `dariCache` adalah
 * diskriminan yang membuat ketiadaan itu terbaca, bukan mengejutkan.
 *
 * `dariCache` ADALAH DIAGNOSTIK SISI SERVER — JANGAN MENARUHNYA DI BADAN
 * RESPONS HTTP untuk template ber-`lingkup: "bersama"`. Pada lingkup pengguna ia
 * hanya menceritakan riwayat pemanggilnya sendiri dan tidak berbahaya; pada
 * lingkup bersama satu entri melayani semua orang, jadi `dariCache: true`
 * memberi tahu pemanggil apakah SESEORANG di platform ini pernah menanyakan
 * pertanyaan itu — orakel lintas akun yang lemah tetapi nyata. Belum ada
 * template bersama hari ini; kalimat ini ada supaya sifat itu tidak diwarisi
 * diam-diam oleh PR pertama yang membuatnya (PR-072 re-rank adalah kandidatnya).
 */
export interface AiPromptResponse<Output> {
  data: Output;
  dariCache: boolean;
  provider?: string;
  model?: string;
  usage?: AiUsage;
}

export interface AiClient {
  chat(ctx: AiCallContext, request: AiChatRequest): Promise<AiChatResponse>;
  json<T>(
    ctx: AiCallContext,
    request: AiChatRequest,
    schema: ZodType<T>,
  ): Promise<AiJsonResponse<T>>;
  embed(ctx: AiCallContext, request: AiEmbedRequest): Promise<AiEmbedResponse>;
  /**
   * Jalur template prompt: cache → kuota → provider → jejak biaya → cache tulis.
   *
   * URUTANNYA HIDUP DI SINI, DAN HANYA DI SINI. Kalau ia diserahkan kepada PR
   * fitur, satu PR yang memanggil cache sesudah kuota (atau lupa menulis
   * kembali) sudah cukup untuk membuat seluruh penghematan lenyap tanpa satu
   * pun test merah.
   */
  prompt<Input, Output>(
    ctx: AiCallContext,
    template: PromptTemplate<Input, Output>,
    input: Input,
  ): Promise<AiPromptResponse<Output>>;
}

export interface AiClientDeps {
  /** Gateway hasil `createAiGateway` — router + breaker di baliknya. */
  provider: AiProvider;
  quota: AiQuota;
  recorder: AiUsageRecorder;
  logger: Pick<Logger, "error">;
  /**
   * Cache jawaban prompt (PR-044b). ABSEN = perilaku sebelum PR ini, persis:
   * setiap `prompt()` menjadi panggilan provider. Opsional supaya composition
   * root yang belum merakit `redis.cache` tidak dipaksa mengarang satu, dan
   * supaya cache bisa dimatikan tanpa menyentuh satu baris pun kode fitur.
   */
  cache?: AiPromptCache;
  /** Pembuat UUID baris; disuntik agar test deterministik. Default uuid v7. */
  ids?: () => string;
  /** Pola repo (`core/ai/breaker.ts`): jam disuntik, BUKAN fake timer. */
  clock?: () => Date;
}

/**
 * Angka token dari provider dibersihkan SEBELUM masuk payload.
 *
 * Alasannya bukan kerapian: `aiUsageRecordJobSchema` menuntut bilangan bulat
 * tak-negatif, jadi provider yang mengembalikan pecahan, negatif, atau NaN akan
 * membuat seluruh baris jejak biaya HILANG lewat penolakan zod. Membulatkan ke
 * bawah dan melantaikan di nol menyimpan catatan yang sedikit meleset alih-alih
 * tidak menyimpan catatan sama sekali.
 *
 * Batasnya yang sudah ada sejak PR-041 tetap berlaku dan tidak diperlebar di
 * sini: adapter memetakan field usage yang hilang menjadi 0, jadi "0 token" dan
 * "provider diam" tidak dapat dibedakan di hilir.
 */
function angkaToken(nilai: number | undefined): number {
  if (nilai === undefined || !Number.isFinite(nilai)) return 0;
  return Math.max(0, Math.trunc(nilai));
}

export function createAiClient(deps: AiClientDeps): AiClient {
  const { provider, quota, recorder, logger, cache } = deps;
  const ids = deps.ids ?? (() => uuidV7());
  const clock = deps.clock ?? (() => new Date());

  /**
   * Catat tanpa pernah menggagalkan pemanggil — penjaga KEDUA, di atas penjaga
   * yang sudah ada di dalam recorder itu sendiri. Dua lapis karena keduanya
   * murah dan karena implementasi port ini bisa berganti (mis. tulis langsung
   * ke DB) tanpa yang menggantinya sempat membaca kalimat kontrak di atas.
   */
  async function catatAman(peristiwa: AiUsagePeristiwa): Promise<void> {
    try {
      await recorder.catat(peristiwa);
    } catch (err) {
      logger.error(
        { err, feature: peristiwa.feature, provider: peristiwa.provider },
        "Gagal mencatat pemakaian AI — jawaban tetap diberikan, jejak biayanya hilang",
      );
    }
  }

  /**
   * Kerangka satu panggilan AI, dipakai ketiga metode.
   *
   * 1. Kuota DULU. Jatah habis melempar di sini, dan itu berarti provider TIDAK
   *    PERNAH disentuh — inilah satu-satunya bentuk penggerbangan yang berarti:
   *    memeriksa setelah memanggil hanya menghitung uang yang sudah terbakar.
   * 2. Panggil provider. Gagal → `kembalikanBila` yang memutuskan kelayakan
   *    refund (lihat `bolehDikembalikan`), lalu error asli dilempar apa adanya.
   * 3. Sukses → catat. Kegagalan pencatatan tidak pernah sampai ke pemanggil.
   *
   * KEGAGALAN TIDAK DICATAT. Baris `ai_usage` hanya lahir dari panggilan yang
   * berhasil: error provider tidak membawa `usage`, jadi tidak ada token yang
   * bisa diatribusikan, dan jatah yang layak sudah dikembalikan. Kegagalan yang
   * TIDAK layak refund (`AI_SAFETY_BLOCK`, `AI_INVALID_OUTPUT`) memang membakar
   * token tanpa meninggalkan baris — penghitung kuota adalah jejaknya.
   *
   * `await` pada pencatatan, bukan fire-and-forget: satu perjalanan ke Redis di
   * samping panggilan LLM (ratusan milidetik sampai detik) tidak berarti,
   * sedangkan fire-and-forget membuat jaminan "tercatat sekali" hanya bisa
   * diuji dengan balapan waktu.
   */
  async function jalankan<T>(
    ctx: AiCallContext,
    panggil: () => Promise<T>,
    bacaJejak: (hasil: T) => { provider: string; usage?: AiUsage },
  ): Promise<T> {
    const reservasi = await quota.periksaDanPakai({
      userId: ctx.userId,
      feature: ctx.feature,
    });

    let hasil: T;
    try {
      hasil = await panggil();
    } catch (err) {
      await quota.kembalikanBila(reservasi, err);
      throw err;
    }

    // Kuota yang DILEWATI (fail open, `tercatat === false`) tetap dicatat:
    // pemakaiannya nyata dan berbiaya nyata. Justru di sanalah jejak biaya
    // paling dibutuhkan, sebab penghitungnya sedang tidak bisa dibaca.
    const jejak = bacaJejak(hasil);
    await catatAman({
      id: ids(),
      userId: ctx.userId,
      feature: ctx.feature,
      provider: jejak.provider,
      tokensIn: angkaToken(jejak.usage?.promptTokens),
      tokensOut: angkaToken(jejak.usage?.completionTokens),
      ...(ctx.promptVersion === undefined ? {} : { promptVersion: ctx.promptVersion }),
      createdAt: clock(),
    });

    return hasil;
  }

  return {
    chat(ctx, request) {
      return jalankan(
        ctx,
        () => provider.chat(request),
        (hasil) => ({ provider: hasil.provider, usage: hasil.usage }),
      );
    },

    json(ctx, request, schema) {
      return jalankan(
        ctx,
        () => provider.chatJson(request, schema),
        (hasil) => ({ provider: hasil.provider, usage: hasil.usage }),
      );
    },

    /**
     * `embed` selalu tercatat dengan token 0/0, dan itu DISENGAJA.
     *
     * `AiEmbedResponse` tidak punya `usage` karena Gemini `embedContent` memang
     * tidak mengembalikan `usageMetadata` — tidak ada angka yang bisa dicatat.
     * Yang dipilih BUKAN menandai ketidaktahuan itu dengan kolom nullable atau
     * tri-state "unknown" (keduanya memperluas skema tanpa satu pun pembaca yang
     * membutuhkannya), melainkan mengakui bahwa **biaya embedding terlacak lewat
     * CACAH BARIS, bukan lewat token**: satu baris `ai_usage` per embedding, dan
     * `ai_usage_monthly.requests` yang menghitungnya. Konsekuensinya harus
     * diketahui pembaca angka bulanan: kolom token untuk fitur `embed` selalu 0.
     */
    embed(ctx, request) {
      return jalankan(
        ctx,
        () => provider.embed(request),
        (hasil) => ({ provider: hasil.provider }),
      );
    },

    /**
     * Jalur template prompt (PR-044b). Seluruh urutannya ada di badan ini.
     *
     * 1. CACHE DULU, kuota sesudahnya. Urutan ini KEBALIKAN diagram SDD §7.1
     *    (langkah 1 kuota, langkah 2 cache) dan itu disengaja: memeriksa cache
     *    belakangan menuntut kemampuan mengembalikan SEBAGIAN reservasi (pagu
     *    global saja), dan refund parsial adalah persis kelas bug yang dibayar
     *    PR-043b. Dengan urutan ini pagu global tidak pernah naik pada hit, jadi
     *    tidak ada jendela dan tidak ada yang perlu dikembalikan.
     * 2. HIT tetap memotong jatah PENGGUNA (`lewatiGlobal: true`). Jatah per
     *    pengguna adalah kendali anti-abuse: cache hit tetap sebuah permintaan.
     *    Konsekuensinya — pengguna TIDAK melihat jatahnya lebih awet; yang
     *    diuntungkan tier gratis platform. Ini keputusan owner 2026-09-03, dan
     *    ia berbeda dari kalimat "sisanya dari cache" di SDD §7.1.
     * 3. HIT TIDAK MENULIS BARIS `ai_usage` — hanya metrik (AC-5). Baris 0-token
     *    akan merusak rekonsiliasi tagihan PR-043b, tempat 0/0 sudah punya arti
     *    lain ("embed"). Konsekuensinya harus diketahui pembaca angka: cacah
     *    panggilan TIDAK lagi sama dengan cacah baris `ai_usage`.
     *
     * PENGGUNA YANG JATAHNYA HABIS TETAP DITOLAK MESKI ADA DI CACHE. Itu bukan
     * cacat yang menunggu diperbaiki, itu kendali anti-abuse-nya bekerja:
     * membolehkan hit tanpa jatah menjadikan cache sebuah API tak terbatas bagi
     * siapa pun yang bisa menebak masukan yang pernah dipakai.
     */
    async prompt(ctx, template, input) {
      // `promptVersion` diisi dari template bila pemanggil tidak menyatakannya.
      // `template.id` MEMANG nilai kolom `ai_usage.prompt_version` (PR-044a),
      // jadi jalur ini mengisi kolom yang sejak PR-043b selalu NULL.
      const konteks: AiCallContext = {
        ...ctx,
        promptVersion: ctx.promptVersion ?? template.id,
      };
      const konteksCache = { userId: ctx.userId, feature: ctx.feature };

      // `cache` absen = perilaku sebelum PR-044b, tanpa cabang tambahan.
      const tersimpan = await cache?.baca(konteksCache, template, input);
      if (tersimpan !== undefined) {
        // Melempar bila jatah habis — lihat catatan anti-abuse di atas.
        await quota.periksaDanPakai({
          userId: ctx.userId,
          feature: ctx.feature,
          lewatiGlobal: true,
        });
        return { data: tersimpan, dariCache: true };
      }

      const hasil = await jalankan(
        konteks,
        () => provider.chatJson(template.bangun(input), template.output),
        (jawaban) => ({ provider: jawaban.provider, usage: jawaban.usage }),
      );

      // Ditulis SESUDAH jejak biaya dan SESUDAH kuota — pada titik ini jawabannya
      // sudah pasti sah (lolos skema template di adapter). Kegagalan menulis
      // ditelan `cache.tulis` sendiri; ia tidak pernah mencabut jawaban ini.
      await cache?.tulis(konteksCache, template, input, hasil.data);

      return {
        data: hasil.data,
        dariCache: false,
        provider: hasil.provider,
        model: hasil.model,
        usage: hasil.usage,
      };
    },
  };
}
