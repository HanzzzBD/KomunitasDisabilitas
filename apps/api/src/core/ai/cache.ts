// core/ai — cache jawaban prompt (PR-044b, AC-1 & AC-5 PR-044).
//
// NAMANYA JUJUR: INI PENCOCOKAN PERSIS, BUKAN "CACHE SEMANTIK". Judul PR-044
// menyebut "Cache Semantik", tetapi spesifikasinya sendiri berbunyi
// `hash(input + versi)` — yaitu kunci deterministik atas masukan yang identik.
// Tidak ada embedding, tidak ada ambang kemiripan, dan tidak ada di berkas ini
// yang boleh dibaca sebagai janji itu.
//
// KENAPA `redis.cache`, BUKAN `redis.queue`. Ini kebalikan persis dari kuota
// (`quota.ts`, catatan kepala berkasnya). Instans cache berjalan `allkeys-lru`:
// ia BOLEH mengusir kunci sembarang saat memori menipis. Untuk penghitung kuota
// itu bencana (jatah pulih, pagu kembali nol saat trafik puncak); untuk cache
// ini gratis — kunci yang hilang hanya berarti MISS, dan miss hanya berarti
// memanggil AI seperti sebelum cache ada. Kontrak instansnya adalah "kehilangan
// kunci ini tidak merusak apa pun", dan berkas ini memang memenuhinya.
//
// GAGAL TERBUKA. Setiap kegagalan — Redis tak terjangkau, JSON cacat, skema
// tidak lagi cocok — dibaca sebagai MISS. Ini juga kebalikan kuota, yang gagal
// TERTUTUP, dan alasannya simetris: kuota menjaga uang, jadi ketidaktahuan
// harus menahan; cache hanya MENGHEMAT uang, jadi ketidaktahuannya tidak boleh
// memadamkan bantuan AI bagi pengguna yang jatahnya masih ada. Cache yang gagal
// tertutup mematikan fitur demi penghematan — tidak ada yang menghendaki itu.
//
// TANPA PENGUNCIAN — BATAS YANG DITERIMA. Dua permintaan identik yang tiba
// bersamaan sama-sama miss dan sama-sama memanggil provider (thundering herd).
// Ditulis di sini supaya ia menjadi batas yang DIKETAHUI, bukan kejutan yang
// ditemukan orang lain di produksi. Menambal ini butuh kunci terdistribusi, dan
// itu mesin yang jauh lebih mahal daripada satu panggilan LLM ganda sesekali.
//
// BATAS PDP YANG HARUS DIKETAHUI. Nilai yang disimpan adalah JAWABAN AI atas
// masukan pengguna, dan `__tests__/purge-kelengkapan.test.ts` hanya memindai
// model Prisma — penghapusan akun TIDAK menjangkau Redis. Entri ber-`userId`
// karena itu bertahan sampai TTL/evict. Mitigasinya satu-satunya adalah TTL
// pendek berplafon keras (`PROMPT_CACHE_TTL_MAKS_DETIK`). Konsekuensinya untuk
// log: **kunci cache TIDAK PERNAH dicatat mentah**, dan isi prompt maupun
// jawaban tidak pernah menyentuh logger sama sekali.
import { createHash } from "node:crypto";
import type { Logger } from "../logger/index.js";
import {
  PROMPT_CACHE_TTL_DEFAULT_DETIK,
  PROMPT_CACHE_TTL_MAKS_DETIK,
  type PromptTemplate,
} from "./prompts/index.js";
import type { AiQuotaFeature } from "./quota-config.js";

/**
 * Prefiks kunci, berversi. `v1` di sini adalah versi BENTUK KUNCI: bila kelak
 * bahan kuncinya berubah, menaikkan prefiks membuat seluruh entri lama tidak
 * pernah terbaca lagi — lebih aman daripada berharap bentuk barunya kebetulan
 * tidak bertabrakan dengan yang lama.
 */
export const AI_CACHE_PREFIX = "ai:prompt:v1:";

/**
 * Nama metrik. Konstanta, bukan literal yang ditulis ulang di tempat pemakaian:
 * ia dipakai di dua tempat yang tidak boleh melenceng — pemanggil `increment`
 * di berkas ini dan penjaganya di test (pola `METRIK_ENQUEUE_GAGAL`,
 * `modules/ai/services/ai-usage.service.ts`).
 *
 * Cacahnya GLOBAL, tanpa label fitur. Port metrik yang sudah ada di repo ini
 * hanya menerima nama (`increment(name)`), dan menambah argumen kedua berarti
 * mengubah tiga pemanggil lain di luar scope PR ini. Konsekuensinya jujur:
 * "hemat kuota" (AC-5) terbaca sebagai rasio hit/miss seluruh platform, bukan
 * per fitur.
 */
export const METRIK_CACHE_HIT = "ai_cache.hit";
export const METRIK_CACHE_MISS = "ai_cache.miss";

/**
 * Irisan perintah Redis yang dipakai cache ini. Sengaja sempit (pola
 * `QuotaRedisLike`/`OtpRedisLike`): klien ioredis nyata memenuhinya, dan unit
 * test memakai fake in-memory tanpa server — jadi seluruh aturan di sini bisa
 * dibuktikan di mesin tanpa Docker, bukan diam-diam terlewat bersama rombongan
 * test integrasi.
 */
export interface CacheRedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, secondsToken: "EX", seconds: number): Promise<unknown>;
}

export interface AiPromptCacheDeps {
  /** WAJIB klien `redis.cache` (allkeys-lru) — lihat catatan kepala berkas. */
  redis: CacheRedisLike;
  logger: Pick<Logger, "warn">;
  /**
   * Backend metrik produksi belum ada (ADR-017); pola repo hari ini adalah
   * `logger.warn({ metric })` yang dirakit di composition root. Opsional supaya
   * pemanggil yang tidak punya sink tidak dipaksa mengarang satu.
   */
  metrics?: { increment(name: string): void };
}

/**
 * Konteks satu panggilan — bagian yang ikut menentukan kunci.
 *
 * Bentuknya sengaja dituliskan ulang di sini alih-alih meminjam `AiCallContext`
 * milik `client.ts`: `client.ts` mengimpor berkas ini, dan meminjam balik akan
 * membuat lingkarnya. Keduanya kompatibel secara struktural, jadi pemanggil
 * cukup meneruskan konteksnya apa adanya.
 */
export interface KonteksCachePrompt {
  userId: string;
  feature: AiQuotaFeature;
}

export interface AiPromptCache {
  /** Jawaban tersimpan, atau `undefined` untuk MISS (termasuk setiap kegagalan). */
  baca<Input, Output>(
    ctx: KonteksCachePrompt,
    template: PromptTemplate<Input, Output>,
    input: Input,
  ): Promise<Output | undefined>;
  /** Simpan jawaban. TIDAK PERNAH menolak: kegagalannya hanya kehilangan hemat. */
  tulis<Input, Output>(
    ctx: KonteksCachePrompt,
    template: PromptTemplate<Input, Output>,
    input: Input,
    nilai: Output,
  ): Promise<void>;
}

/**
 * Bentuk kanonik satu nilai masukan, sebelum di-`JSON.stringify`.
 *
 * KENAPA TIDAK LANGSUNG `JSON.stringify`. Ia mengikuti urutan PENYISIPAN kunci,
 * jadi `{...dasar, tambahan}` dan literal yang isinya sama persis menghasilkan
 * dua string berbeda — yaitu dua kunci berbeda untuk data yang sama, alias miss
 * abadi yang tidak punya satu pun gejala selain tagihan yang tidak turun.
 *
 * Aturannya, dan masing-masing alasannya:
 * - kunci objek DIURUTKAN, rekursif — menghapus ketergantungan pada urutan tulis;
 * - urutan LARIK DIPERTAHANKAN — di larik, urutan itu bermakna (peringkat
 *   lowongan, urutan percakapan); mengurutkannya akan menyamakan dua masukan
 *   yang jawabannya memang berbeda, dan itu HIT PALSU — kegagalan yang jauh
 *   lebih buruk daripada miss;
 * - `Date` → ISO — dua objek `Date` bernilai sama bukan objek yang sama;
 * - `undefined` pada properti DIBUANG (semantik JSON: field absen == field
 *   bernilai undefined), sedangkan `undefined` di dalam larik menjadi `null`
 *   supaya posisinya tidak bergeser.
 *
 * Batas yang diterima: `NaN`/`Infinity` menjadi `null` (perilaku JSON), jadi
 * keduanya berbagi satu kunci. Masukan prompt yang berisi angka non-hingga
 * sudah bermasalah jauh sebelum sampai ke sini.
 */
function kanonik(nilai: unknown): unknown {
  if (nilai instanceof Date) return nilai.toISOString();
  if (Array.isArray(nilai)) {
    return nilai.map((item) => (item === undefined ? null : kanonik(item)));
  }
  if (nilai !== null && typeof nilai === "object") {
    const hasil: Record<string, unknown> = {};
    for (const kunci of Object.keys(nilai as Record<string, unknown>).sort()) {
      const isi = (nilai as Record<string, unknown>)[kunci];
      if (isi === undefined) continue;
      hasil[kunci] = kanonik(isi);
    }
    return hasil;
  }
  return nilai;
}

/**
 * Sidik masukan. `undefined` bila masukannya tidak bisa diserialisasi sama
 * sekali (BigInt, struktur melingkar) — pemanggil membacanya sebagai "tidak
 * bisa di-cache", bukan sebagai error: gagal terbuka berlaku juga di sini.
 */
function sidikInput(input: unknown): string | undefined {
  try {
    const teks = JSON.stringify(kanonik(input) ?? null);
    if (teks === undefined) return undefined;
    return createHash("sha256").update(teks, "utf8").digest("hex");
  } catch {
    return undefined;
  }
}

/**
 * Kunci satu entri cache.
 *
 * KUNCI TIDAK PERNAH DIHITUNG DARI `AiChatRequest`. Ini bukan pilihan gaya:
 * `template.bangun()` membungkus setiap daun data tak tepercaya dengan penanda
 * ber-NONCE ACAK per panggilan (`prompts/definisi.ts` → `guard.ts`), jadi dua
 * pemanggilan dengan masukan IDENTIK menghasilkan `messages` yang berbeda.
 * Meng-hash `messages` memberi hit-rate NOL: ia lulus setiap unit test yang
 * membandingkan dirinya sendiri, lalu tidak pernah bekerja satu kali pun di
 * produksi. Karena itu cache duduk di lapisan PROMPT (template + input mentah),
 * bukan di lapisan request.
 *
 * Bahannya:
 * - `template.id` — sumbu versi yang dinyatakan (AC-1: naikkan versi → kunci
 *   berubah → entri lama tidak pernah terpakai);
 * - `template.sidik` — jaring untuk suntingan isi template tanpa naik versi;
 * - `ctx.feature` — murah, dan menutup pemakaian silang-fitur satu template
 *   (tidak ada yang menegakkan "satu template satu fitur" hari ini);
 * - `userId`, KECUALI template menyatakan `lingkup: "bersama"`;
 * - sidik kanonik `input`.
 *
 * `timeoutMs` sengaja TIDAK ikut: ia properti transport, bukan semantik —
 * jawaban yang sama tidak berubah karena batas tunggunya berbeda.
 */
export function kunciCachePrompt<Input, Output>(
  ctx: KonteksCachePrompt,
  template: PromptTemplate<Input, Output>,
  input: Input,
): string | undefined {
  // LINGKUP PER-PENGGUNA MENUNTUT PENGGUNA YANG SUNGGUHAN. `userId` kosong (atau
  // bukan string, dari pemanggil JavaScript yang tidak dijaga `tsc`) menghasilkan
  // sufiks `…:u::<hash>` yang SAMA bagi setiap pemanggil yang melakukannya —
  // yaitu lingkup bersama de facto, tanpa satu pun template menyentuh `lingkup`
  // dan tanpa penjaga di prompt-cache-lingkup.test.ts pernah melihatnya. Hari ini
  // `AiCallContext.userId` selalu datang dari sesi, tetapi worker adalah
  // pemanggil yang masuk akal berikutnya dan ia akan membawa id sistem sintetis.
  // Jawabannya "tidak bisa di-cache" (bentuk gagal-terbuka yang sudah ada), bukan
  // lemparan: cache tidak pernah boleh memadamkan jalur AI.
  if (
    template.lingkup !== "bersama" &&
    (typeof ctx.userId !== "string" || ctx.userId.length === 0)
  ) {
    return undefined;
  }

  const sidik = sidikInput(input);
  if (sidik === undefined) return undefined;
  // Lingkup "bersama" menghapus `userId` dari kunci — satu entri melayani semua
  // orang. Sahnya hanya bila seluruh masukan template memang data publik; lihat
  // `PromptSpec.lingkup` dan penjaganya di __tests__/prompt-cache-lingkup.test.ts.
  const pemilik = template.lingkup === "bersama" ? "bersama" : `u:${ctx.userId}`;
  return `${AI_CACHE_PREFIX}${template.id}:${template.sidik}:${ctx.feature}:${pemilik}:${sidik}`;
}

/**
 * Yang boleh masuk log dari sebuah error di berkas ini: NAMANYA saja.
 *
 * Bukan kehati-hatian berlebihan — dua jenis error di jalur ini membawa data
 * pengguna di badannya sendiri, dan keduanya tiba tanpa satu pun tindakan
 * penyerang:
 * - error ioredis menempelkan `command = { name, args }`, dan `args` sebuah
 *   `SET` adalah [kunci ber-`userId`, JAWABAN AI, "EX", ttl]. Redaksi terpusat
 *   (`core/logger`, path `err.command.args`) sudah menutup ini untuk SELURUH
 *   repo; penyempitan di sini adalah lapis keduanya, supaya berkas ini tidak
 *   bergantung pada daftar yang hidup di berkas lain.
 * - `SyntaxError` dari `JSON.parse` MENYALIN cuplikan masukan yang cacat ke
 *   dalam `message`-nya (V8: `Unexpected token 'r', "…" is not valid JSON`).
 *   Masukan yang cacat itu, di sini, adalah entri cache — yaitu jawaban AI.
 *   Tidak ada redaksi yang bisa menolongnya: kebocorannya ADA DI `message`,
 *   jadi granularitas yang benar memang `name`, bukan `message`.
 *
 * Ini menegakkan invarian yang sudah ditulis di kepala berkas: kunci cache
 * tidak pernah dicatat mentah, dan isi prompt maupun jawaban tidak pernah
 * menyentuh logger sama sekali.
 */
function namaError(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

/**
 * Jepit ULANG TTL, di titik tulis.
 *
 * Sudah dijepit `definePrompt` (`jepitTtl`), jadi ini terlihat mubazir — dan
 * memang mubazir untuk setiap template yang lahir di sana. Yang ditutupnya
 * adalah template yang TIDAK lahir di sana: `PromptTemplate` adalah interface
 * yang diekspor barrel, `cacheTtlDetik: number` menerima angka apa pun, dan
 * tidak ada apa pun di tingkat tipe yang memaksa sebuah template melewati
 * `definePrompt`. TTL adalah SATU-SATUNYA kendali PDP atas entri cache (D10:
 * purge akun tidak menjangkau Redis), dan kendali yang berarti dipasang di
 * titik cekik, bukan di titik niat: satu template rakitan tangan dengan
 * `cacheTtlDetik: 31_536_000` menyimpan jawaban AI atas data pengguna selama
 * setahun, melewati penghapusan akun, tanpa satu pun test merah.
 *
 * Lantai 1 detik ikut menutup kasus keduanya: `SET … EX 0` (dan negatif)
 * ditolak Redis nyata sebagai "invalid expire time", jadi ia akan mengubah
 * setiap penulisan menjadi kegagalan diam — selamanya miss, tanpa gejala.
 *
 * `NaN`/`Infinity` jatuh ke TTL BAKU, bukan ke plafon: rumus jepitnya sendiri
 * meloloskan `NaN` (`Math.min(86400, NaN)` = `NaN` → `EX NaN`), dan memilih
 * plafon 24 jam untuk angka yang tidak berarti akan memberi umur TERPANJANG
 * justru kepada template yang paling kacau. Perilakunya sengaja sama persis
 * dengan `jepitTtl` di `prompts/definisi.ts`.
 */
function ttlAman(detik: number): number {
  if (!Number.isFinite(detik)) return PROMPT_CACHE_TTL_DEFAULT_DETIK;
  return Math.min(PROMPT_CACHE_TTL_MAKS_DETIK, Math.max(1, Math.trunc(detik)));
}

export function createAiPromptCache(deps: AiPromptCacheDeps): AiPromptCache {
  const { redis, logger } = deps;

  /** Metrik itu opsional; ketiadaan sink tidak boleh menjatuhkan jalur panas. */
  function catatMetrik(nama: string): void {
    try {
      deps.metrics?.increment(nama);
    } catch (err) {
      logger.warn({ err, metric: nama }, "Sink metrik cache AI gagal — diabaikan");
    }
  }

  return {
    async baca(ctx, template, input) {
      const kunci = kunciCachePrompt(ctx, template, input);
      if (kunci === undefined) {
        // Masukan yang tidak bisa diserialisasi: tidak ada kunci, jadi tidak ada
        // yang bisa dibaca maupun ditulis. Dicatat sebagai miss — memang miss.
        catatMetrik(METRIK_CACHE_MISS);
        return undefined;
      }

      let mentah: string | null;
      try {
        mentah = await redis.get(kunci);
      } catch (err) {
        // GAGAL TERBUKA. Tanpa `template` di log tidak ada yang bisa
        // ditindaklanjuti; DENGAN kunci di log, jawabannya bocor lewat jalur
        // yang paling sulit dibersihkan. Jadi: id template saja.
        //
        // `namaError`, bukan `err`: error ioredis MEMBAWA kunci yang baru saja
        // diminta di `command.args` — lihat invarian di kepala berkas (baris
        // 34-36) dan catatan pada `namaError`.
        logger.warn(
          { err: namaError(err), template: template.id },
          "Cache prompt AI tak terbaca — dianggap miss",
        );
        catatMetrik(METRIK_CACHE_MISS);
        return undefined;
      }

      if (mentah === null) {
        catatMetrik(METRIK_CACHE_MISS);
        return undefined;
      }

      let terurai: unknown;
      try {
        terurai = JSON.parse(mentah);
      } catch (err) {
        // HANYA NAMANYA, dan di sinilah alasannya paling tajam: `message`
        // sebuah `SyntaxError` V8 MEMUAT cuplikan masukan yang gagal diurai,
        // dan masukan itu adalah entri cache — yaitu jawaban AI atas data
        // pengguna. Mencatat `err` di sini membocorkan isi entri justru pada
        // entri yang paling mungkin cacat karena tertulis sebagian. Invarian
        // kepala berkas (baris 34-36) melarangnya.
        logger.warn(
          { err: namaError(err), template: template.id },
          "Entri cache prompt AI cacat — dianggap miss",
        );
        catatMetrik(METRIK_CACHE_MISS);
        return undefined;
      }

      // DIPARSE ULANG LEWAT SKEMA TEMPLATE. Entri Redis adalah masukan TAK
      // TEPERCAYA begitu ia keluar: ia bisa ditulis versi kode sebelumnya
      // (skema sejak itu berubah), atau oleh siapa pun yang menyentuh instans
      // cache. Biaya zod nol dibanding satu panggilan LLM, dan `template.output`
      // membawa sanitasi keluarannya sendiri — jadi jalur hit disanitasi persis
      // sama seperti jalur provider, bukan "sudah bersih waktu disimpan".
      //
      // YANG MENAHAN ENTRI TERACUNI ADALAH PENGUPASAN KUNCI ASING. `z.object`
      // (bentuk setiap skema keluaran hari ini) MEMBUANG kunci yang tidak
      // disebutkan, jadi entri yang disisipi properti tambahan — termasuk
      // `__proto__` sebagai properti biasa hasil `JSON.parse` — tidak pernah
      // sampai ke pemanggil. Skema `.passthrough()`, `z.record()`, atau
      // `z.any()` MELEBARKAN batas kepercayaan ini: pembacaan cache adalah
      // penguraian KEDUA atas data tak tepercaya, dan skema yang meloloskan
      // kunci sembarang menjadikannya jalur masuk objek karangan orang lain.
      const hasil = template.output.safeParse(terurai);
      if (!hasil.success) {
        // Basi-skema = MISS, bukan lemparan. Melempar di sini akan mengubah
        // perubahan skema yang sah menjadi pemadaman fitur.
        logger.warn(
          { template: template.id },
          "Entri cache prompt AI tidak cocok skema template — dianggap miss",
        );
        catatMetrik(METRIK_CACHE_MISS);
        return undefined;
      }

      catatMetrik(METRIK_CACHE_HIT);
      return hasil.data;
    },

    async tulis(ctx, template, input, nilai) {
      const kunci = kunciCachePrompt(ctx, template, input);
      if (kunci === undefined) return;

      // `string | undefined`, BUKAN `string` seperti yang dijanjikan lib TS:
      // `JSON.stringify` memang mengembalikan `undefined` untuk nilai yang tidak
      // punya representasi JSON. Tipe yang jujur di sini yang membuat penjagaan
      // di bawah bisa ditulis sama sekali.
      let muatan: string | undefined;
      try {
        muatan = JSON.stringify(nilai);
      } catch (err) {
        // Sama seperti dua tempat di atas: hanya namanya. Pesan
        // "circular structure" menyebut NAMA-NAMA properti jawaban, dan itu
        // sudah cukup untuk membuat kebiasaan mencatat `err` mentah hidup lagi
        // di berkas ini.
        logger.warn(
          { err: namaError(err), template: template.id },
          "Jawaban AI tidak bisa diserialisasi — tidak di-cache",
        );
        return;
      }
      // `undefined` hasil stringify (mis. jawaban bukan objek JSON) tidak punya
      // representasi yang bisa dibaca ulang; lebih baik tidak menulis apa pun
      // daripada menulis entri yang pasti gagal parse nanti.
      if (muatan === undefined) return;

      try {
        // TTL dijepit LAGI di sini — titik cekik satu-satunya. Lihat `ttlAman`.
        await redis.set(kunci, muatan, "EX", ttlAman(template.cacheTtlDetik));
      } catch (err) {
        // Kegagalan menulis hanya berarti kehilangan penghematan pada panggilan
        // BERIKUTNYA. Jawaban yang sedang dipegang pengguna sudah jadi dan sudah
        // dibayar tokennya — ia tidak boleh dicabut demi cache.
        //
        // `namaError`, bukan `err`: inilah tempat kebocorannya paling parah.
        // `command.args` sebuah `SET` yang gagal berisi [kunci ber-`userId`,
        // MUATAN — jawaban AI utuh, "EX", ttl], dan ia tiba pada `MISCONF`,
        // `OOM`, `READONLY`, atau restart kontainer: tanpa penyerang, tanpa cara
        // mencegahnya. Log berada di luar jangkauan purge, jadi mencatatnya
        // membatalkan TTL sebagai satu-satunya kendali PDP (D10).
        logger.warn(
          { err: namaError(err), template: template.id },
          "Gagal menyimpan cache prompt AI — diabaikan",
        );
      }
    },
  };
}
