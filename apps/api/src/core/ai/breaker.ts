// core/ai — circuit breaker per provider (PR-042, SDD §7.1).
//
// KENAPA. Tanpa ini, provider yang tumbang tetap dihubungi pada SETIAP panggilan
// dan setiap panggilan membayar penuh batas tunggunya (GEMINI_TIMEOUT_MS). Yang
// dilindungi bukan provider-nya, melainkan pemanggil kita: 15 detik menunggu
// jawaban yang pasti tidak datang jauh lebih buruk daripada gagal seketika dan
// pindah ke cadangan.
//
// KEADAAN DI DALAM PROSES, PER REPLIKA — diterima untuk MVP. Dengan 2 replika
// (CLAUDE.md §11) masing-masing mencapai ambangnya sendiri; ini perlindungan
// per-proses, bukan jaminan sekaligus se-repo. Keadaan bersama di Redis ditunda:
// `redis-cache` (allkeys-lru) justru bisa mengusirnya di tengah gangguan dan
// `redis-queue` disediakan untuk BullMQ (ADR-004).
//
// JAM DISUNTIK, BUKAN FAKE TIMER. Pola `clock?: () => Date` dipakai di seluruh
// repo (mis. `jobs/services/expiry.service.ts`), dan modul ini sudah menghindari
// `vi.useFakeTimers()` karena `AbortSignal.timeout` tidak menghormatinya. "60
// detik terbuka" berarti membandingkan `clock()` dengan waktu pembukaan pada
// tiap percobaan — tidak ada `setTimeout`, jadi tidak ada yang perlu dipalsukan.

/** Ambang & jendela baku (SDD §7.1: buka 60 detik setelah 5 kesalahan). */
export const BREAKER_AMBANG_BAKU = 5;
export const BREAKER_JENDELA_BUKA_MS = 60_000;

/**
 * `closed` = lewatkan semua; `open` = tolak seketika; `half-open` = izinkan
 * TEPAT SATU percobaan penjajakan yang menentukan kembali ke `closed` atau
 * `open`. Tanpa batas satu itu, seluruh trafik yang tertahan akan menyerbu
 * provider yang belum tentu pulih pada detik ke-60.
 */
export type BreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Kegagalan BERTURUT-TURUT sebelum sirkuit membuka; default 5. */
  threshold?: number;
  /** Lama sirkuit terbuka sebelum penjajakan; default 60_000 ms. */
  openMs?: number;
  clock?: () => Date;
}

export interface CircuitBreaker {
  /** Keadaan tercatat. Peralihan `open` → `half-open` terjadi di `canAttempt()`. */
  state(): BreakerState;
  /** Boleh menghubungi provider sekarang? Memakai jatah penjajakan bila ada. */
  canAttempt(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}

/**
 * Hitungannya BERTURUT-TURUT, bukan jendela bergulir: yang ingin dibedakan
 * adalah "provider sedang tumbang" dari "ada beberapa kegagalan tersebar".
 * Satu keberhasilan membuktikan provider masih menjawab, jadi ia mengulang
 * hitungan dari nol — jendela bergulir justru akan tetap membuka sirkuit
 * terhadap provider yang jelas-jelas sehat.
 *
 * Berkas ini TIDAK tahu apa-apa tentang `AiErrorCode`: pemanggil (router.ts)
 * yang memutuskan kegagalan mana yang pantas dihitung sebagai sinyal kesehatan.
 */
export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreaker {
  const ambang = options.threshold ?? BREAKER_AMBANG_BAKU;
  const jendelaMs = options.openMs ?? BREAKER_JENDELA_BUKA_MS;
  const now = options.clock ?? (() => new Date());

  let keadaan: BreakerState = "closed";
  let gagalBerturut = 0;
  let dibukaPada = 0;
  /** Jatah penjajakan `half-open` sudah terpakai? */
  let penjajakanBerjalan = false;

  function buka(): void {
    keadaan = "open";
    dibukaPada = now().getTime();
    gagalBerturut = ambang;
    penjajakanBerjalan = false;
  }

  return {
    state: () => keadaan,

    canAttempt(): boolean {
      if (keadaan === "closed") return true;
      if (keadaan === "open") {
        if (now().getTime() - dibukaPada < jendelaMs) return false;
        keadaan = "half-open";
        penjajakanBerjalan = true;
        return true;
      }
      // half-open: hanya penjajak pertama yang lolos.
      if (penjajakanBerjalan) return false;
      penjajakanBerjalan = true;
      return true;
    },

    recordSuccess(): void {
      keadaan = "closed";
      gagalBerturut = 0;
      dibukaPada = 0;
      penjajakanBerjalan = false;
    },

    recordFailure(): void {
      // Penjajakan yang gagal membuka lagi SEPENUHNYA — jendela 60 detik
      // dihitung ulang dari sekarang, bukan diteruskan dari pembukaan lama.
      if (keadaan === "half-open") {
        buka();
        return;
      }
      gagalBerturut += 1;
      if (gagalBerturut >= ambang) buka();
    },
  };
}
