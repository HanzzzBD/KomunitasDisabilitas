// core/ai — mesin kuota harian AI: per pengguna DAN pagu global (PR-043,
// SDD §7.1, ADR-005).
//
// APA YANG DIJAGA. Biaya AI adalah satu-satunya biaya variabel platform ini,
// dan tier gratis provider adalah satu ember yang dipakai bersama SEMUA
// pengguna. Tanpa dua penghitung, satu akun (atau satu skrip) menghabiskan
// jatah sehari untuk semua orang dalam hitungan menit — dan yang kehilangan
// layanan adalah pengguna yang tidak melakukan apa-apa.
//
// KENAPA `redis-queue`, BUKAN `redis-cache`. ADR-004 memisahkan dua instans
// berdasarkan kebutuhan DAYA TAHAN, bukan berdasarkan nama beban kerjanya.
// Instans cache berjalan `allkeys-lru`: saat memori menipis ia MENGUSIR kunci
// sembarang — dan kunci yang terusir di sini berarti jatah seorang pengguna
// pulih penuh sekaligus pagu global kembali nol, persis pada saat trafik sedang
// paling tinggi. Kontrak instans cache adalah "kehilangan kunci ini gratis";
// penghitung yang menjaga uang tidak memenuhi kontrak itu. (Kuota ekspor PDP di
// PR-022 memang tinggal di cache — di sana kehilangan kunci hanya MENGEMBALIKAN
// jatah kepada pemiliknya sendiri, risiko yang lain sama sekali.)
//
// Dua penjaga membuat penumpang non-antrean di instans queue tetap aman:
// (1) prefiks `ai:kuota:` mustahil bertabrakan dengan namespace `bull:`;
// (2) SETIAP kunci diberi TTL, jadi jumlah kunci terbatas (pengguna×fitur per
//     hari + satu global) dan instans `noeviction` tidak pernah terdorong ke
//     keadaan menolak tulisan — yang justru akan mematikan antrean.
//
// GAGAL TERTUTUP (fail closed). Redis tak terjangkau → panggilan AI DITOLAK.
// Setiap fitur AI wajib punya jalur non-AI (ADR-005), jadi menolak adalah
// DEGRADASI, bukan pemadaman; sedangkan gagal terbuka mencabut seluruh kendali
// biaya untuk semua pengguna sekaligus, tanpa terukur, tepat ketika tidak ada
// yang bisa membaca penghitungnya. Operator tetap punya tuas sadar:
// `AI_QUOTA_FAIL_OPEN=true`.
import { appError, type AppError, type ErrorCode } from "../http/index.js";
import type { Logger } from "../logger/index.js";
import { AI_FEATURES, type AiQuotaConfig, type AiQuotaFeature } from "./quota-config.js";
import { AiProviderError, type AiErrorCode } from "./types.js";
import { detikKeTengahMalamWib, hariWib } from "./waktu-wib.js";

/** Kode katalog penolakan kuota — satu tempat, dipakai pelempar & pemeriksa. */
export const KODE_KUOTA_HABIS = "KUOTA_AI_HABIS" as const satisfies ErrorCode;

/**
 * Prefiks kunci. Berversi (`v1`) supaya perubahan bentuk kunci kelak tidak
 * pernah membaca sisa penghitung berformat lama sebagai angka hari ini.
 * `userId` ditulis apa adanya — UUID acak, sudah muncul sebagai `actor_id` di
 * `audit_logs`; menyamarkannya tidak menambah perlindungan, hanya membuat
 * operasi (menyetel ulang jatah satu pengguna) mustahil.
 */
export const AI_QUOTA_PREFIX = "ai:kuota:v1:";

/**
 * Kelonggaran TTL di atas jarak ke tengah malam. TTL di sini MURNI pengumpul
 * sampah, bukan mekanisme reset (lihat waktu-wib.ts): kunci hari kemarin sudah
 * tidak pernah dibaca lagi begitu tanggal berganti. Satu jam kelonggaran
 * menjaga selisih jam antar replika tidak menghapus kunci yang masih dipakai.
 */
export const AI_QUOTA_TTL_GRACE_DETIK = 3_600;

/** `Retry-After` saat penghitung tak terbaca — pendek, sebab ini gangguan, bukan jatah habis. */
export const AI_QUOTA_RETRY_GAGAL_DETIK = 60;

/**
 * Irisan perintah Redis yang dipakai mesin ini. Sengaja sempit (pola
 * `ExportRedisLike`, PR-022): klien ioredis nyata memenuhinya, dan unit test
 * memakai fake in-memory tanpa server — jadi kuota TIDAK ikut rombongan test
 * yang melewati dirinya sendiri saat Docker mati.
 */
export interface QuotaRedisLike {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
}

export interface AiQuotaDeps {
  /** WAJIB klien `redis.queue` (noeviction + AOF) — lihat catatan kepala berkas. */
  redis: QuotaRedisLike;
  config: AiQuotaConfig;
  logger: Pick<Logger, "warn" | "error">;
  /** Pola repo (`core/ai/breaker.ts`): jam disuntik, bukan fake timer. */
  clock?: () => Date;
  /** Tuas operator `AI_QUOTA_FAIL_OPEN` — default false (gagal tertutup). */
  failOpen?: boolean;
}

/** Siapa memakai apa. Tidak ada saluran lain: identitas datang dari sesi. */
export interface AiQuotaPemakaian {
  userId: string;
  feature: AiQuotaFeature;
  /**
   * Lewati PAGU GLOBAL — jatah pribadi TETAP dipotong (PR-044b).
   *
   * Absen/false = perilaku hari ini, dan itu yang benar untuk semua pemanggil
   * kecuali satu: cache hit prompt (`AiClient.prompt`). Alasannya adalah fungsi
   * masing-masing penghitung. Jatah per pengguna adalah kendali ANTI-ABUSE —
   * jawaban dari cache tetap sebuah permintaan, dan membiarkannya gratis
   * membuat satu skrip memanen ulang jawabannya tanpa batas. Pagu global adalah
   * kendali BIAYA, dan cache hit tidak berbiaya sepeser pun: menaikkannya akan
   * memakan anggaran bersama untuk panggilan yang tidak pernah sampai ke
   * provider.
   */
  lewatiGlobal?: boolean;
}

/**
 * Bukti pemakaian yang sudah dicatat — satu-satunya cara mengembalikannya.
 * Membawa `hari` yang dihitung SEKALI di awal panggilan supaya pemeriksaan,
 * penambahan, dan pengembalian tidak pernah jatuh di dua sisi tengah malam.
 */
export interface AiQuotaReservasi {
  readonly hari: string;
  readonly userId: string;
  readonly feature: AiQuotaFeature;
  /** false = kuota dilewati (fail open); tidak ada yang perlu dikembalikan. */
  readonly tercatat: boolean;
  /**
   * Apakah pagu global BENAR-BENAR naik pada reservasi ini (PR-044b).
   *
   * Satu bit `tercatat` tidak cukup begitu `lewatiGlobal` ada: ia menjawab
   * "adakah yang dicatat", bukan "penghitung yang MANA". Tanpa bit kedua ini,
   * reservasi tanpa-global yang kemudian dikembalikan akan men-DECR pagu global
   * yang tidak pernah naik — yaitu MENCETAK anggaran bersama, satu unit setiap
   * kali. Lantai nol di `turunkan` tidak melindungi apa pun di sini: penghitung
   * global pada trafik nyata duduk jauh di atas nol, jadi DECR liarnya mendarat
   * mulus dan tak terlihat sampai tagihan datang. Ini persis kelas bug yang
   * dibayar PR-043b pada jalur jatah pribadi.
   */
  readonly global: boolean;
}

export interface AiQuotaFitur {
  fitur: AiQuotaFeature;
  batas: number;
  terpakai: number;
  sisa: number;
}

export interface AiQuotaRingkasan {
  /** Tanggal WIB yang sedang dihitung, `YYYY-MM-DD`. */
  hari: string;
  resetDalamDetik: number;
  fitur: AiQuotaFitur[];
  /**
   * Pagu global sengaja hanya berupa BOOLEAN. Sisa anggaran bersama adalah data
   * operasional (PR-103, `/internal/*`): memberitahukannya kepada pengguna sama
   * dengan memberi tahu penyalahguna kapan anggaran sedang tipis.
   */
  globalTersedia: boolean;
}

export interface AiQuota {
  /**
   * Catat pemakaian LEBIH DULU, baru panggil provider (reserve-then-refund).
   * Urutan ini bukan gaya: pemeriksaan setelah panggilan membuat sepuluh
   * permintaan bersamaan sama-sama lolos karena semuanya membaca angka lama.
   * Melempar AppError `KUOTA_AI_HABIS` (429 + Retry-After) bila jatah habis.
   */
  periksaDanPakai(pemakaian: AiQuotaPemakaian): Promise<AiQuotaReservasi>;
  /** Kembalikan jatah yang sudah dicatat (pengguna tidak menerima apa pun). */
  kembalikan(reservasi: AiQuotaReservasi): Promise<void>;
  /** Kembalikan HANYA bila jenis kegagalannya memang layak — lihat `bolehDikembalikan`. */
  kembalikanBila(reservasi: AiQuotaReservasi, err: unknown): Promise<void>;
  /** Jawaban `GET /api/v1/ai/quota` untuk SATU pengguna: pemanggilnya sendiri. */
  ringkasan(userId: string): Promise<AiQuotaRingkasan>;
}

/**
 * Predikat resmi "ini penolakan kuota".
 *
 * Pemanggil WAJIB memakai ini, JANGAN membandingkan kelas. PR-046 akan
 * mengkanonkan kontrak degradasi (`DegradedError`, `meta.degraded`) dan boleh
 * menurunkannya dari `AppError` selama kodenya tetap sama — predikat yang
 * membaca `code` tetap benar, `err instanceof AppError` di kode pemanggil belum
 * tentu.
 */
export function isKuotaHabis(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === KODE_KUOTA_HABIS
  );
}

/**
 * Kegagalan yang PANTAS mengembalikan jatah: pengguna tidak menerima apa pun
 * dan provider tidak pernah memproses permintaannya.
 *
 * `AI_SAFETY_BLOCK` SENGAJA TIDAK ADA di sini. Penolakan penyaring keamanan
 * adalah PUTUSAN atas isi permintaan — mengembalikan jatahnya membuat
 * penjajakan batas penyaring menjadi gratis dan tak terbatas.
 * `AI_INVALID_OUTPUT` juga tidak: model sudah menjawab, tokennya sudah
 * terbakar. `AI_RATE_LIMIT` pun tidak: ia berarti anggaran bersama sedang
 * tertekan, dan mengembalikan jatah di saat itu justru mengundang percobaan
 * ulang seketika yang memperburuk keadaannya.
 */
export const KODE_LAYAK_DIKEMBALIKAN = [
  "AI_PROVIDER_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_NETWORK_ERROR",
  "AI_NOT_CONFIGURED",
] as const satisfies readonly AiErrorCode[];

export function bolehDikembalikan(err: unknown): boolean {
  return (
    err instanceof AiProviderError &&
    (KODE_LAYAK_DIKEMBALIKAN as readonly AiErrorCode[]).includes(err.code)
  );
}

/** Kunci penghitung satu pengguna satu fitur pada satu hari WIB. */
export function kunciKuotaUser(hari: string, userId: string, feature: AiQuotaFeature): string {
  return `${AI_QUOTA_PREFIX}${hari}:u:${userId}:${feature}`;
}

/** Kunci pagu global satu hari WIB. */
export function kunciKuotaGlobal(hari: string): string {
  return `${AI_QUOTA_PREFIX}${hari}:global`;
}

function tolak(retryAfterSeconds: number, override?: { message: string; hint: string }): AppError {
  return appError(KODE_KUOTA_HABIS, { retryAfterSeconds, ...(override ?? {}) });
}

/**
 * Kegagalan yang terjadi SESUDAH INCR mendarat (penyetelan TTL gagal).
 *
 * Bedanya dengan kegagalan `redis.incr` itu sendiri bersifat menentukan, dan
 * itulah seluruh alasan kelas ini ada: hanya kenaikan yang BENAR-BENAR mendarat
 * yang boleh dikembalikan. Mengembalikan kenaikan yang tak pernah terjadi
 * menurunkan penghitung harian milik pengguna yang penghitungnya sudah berjalan
 * — satu unit jatah cuma-cuma, persis pada saat Redis sedang sakit.
 */
class KenaikanTerpasang extends Error {
  constructor(readonly nilai: number, override readonly cause: unknown) {
    super("Kenaikan kuota AI mendarat, penyetelan TTL gagal");
    this.name = "KenaikanTerpasang";
  }
}

export function createAiQuota(deps: AiQuotaDeps): AiQuota {
  const { redis, config, logger } = deps;
  const clock = deps.clock ?? (() => new Date());
  const failOpen = deps.failOpen ?? false;

  /**
   * Jatah satu fitur. Nilai yang tidak dikenal ATAU negatif dibaca sebagai NOL,
   * tidak pernah sebagai "tak terbatas": fitur yang lahir sebelum jatahnya
   * ditetapkan harus tertutup, bukan terbuka lebar (deny-by-default).
   */
  function batasUser(feature: AiQuotaFeature): number {
    const nilai: number | undefined = config.perUserPerDay[feature];
    return nilai === undefined || nilai < 0 ? 0 : nilai;
  }

  /**
   * INCR + pastikan kunci punya TTL (lihat AI_QUOTA_TTL_GRACE_DETIK).
   *
   * Melempar dua JENIS kegagalan yang tidak boleh tertukar: `redis.incr` yang
   * gagal (kenaikan TIDAK mendarat — dilempar apa adanya) versus kegagalan
   * sesudahnya (kenaikan SUDAH mendarat — dibungkus `KenaikanTerpasang`).
   * Pemanggil memakai perbedaan itu untuk memutuskan boleh-tidaknya refund.
   */
  async function naikkan(key: string, ttlDetik: number): Promise<number> {
    // Di luar try: kegagalan di sini berarti kenaikannya tidak pernah terjadi.
    const nilai = await redis.incr(key);
    try {
      if (nilai === 1) {
        await redis.expire(key, ttlDetik);
        return nilai;
      }
      // TTL -1 = kunci tanpa kedaluwarsa (mis. EXPIRE gagal saat Redis sekarat).
      // Di instans `noeviction` kunci abadi adalah kebocoran memori, jadi ia
      // dipasang ulang — dan TIDAK PERNAH dibaca sebagai "jatah baru".
      if ((await redis.ttl(key)) < 0) await redis.expire(key, ttlDetik);
      return nilai;
    } catch (err) {
      throw new KenaikanTerpasang(nilai, err);
    }
  }

  /** DECR berlantai nol; kegagalannya dicatat, tidak pernah menggagalkan pemanggil. */
  async function turunkan(key: string, ttlDetik: number): Promise<void> {
    try {
      const nilai = await redis.decr(key);
      if (nilai < 0) await redis.incr(key); // lantai 0: jangan pernah menabung jatah negatif
      if (nilai <= 0 && (await redis.ttl(key)) < 0) await redis.expire(key, ttlDetik);
    } catch (err) {
      // Jatah yang gagal dikembalikan hanya merugikan satu pengguna sampai
      // tengah malam; melempar di sini akan menutupi error asli yang sedang
      // ditangani pemanggil.
      logger.warn({ err }, "Gagal mengembalikan jatah kuota AI");
    }
  }

  /** Redis tak terjangkau: tolak (baku) atau lewatkan (tuas operator). */
  function saatRedisGagal(
    err: unknown,
    reservasiKosong: AiQuotaReservasi,
  ): AiQuotaReservasi {
    if (failOpen) {
      logger.warn(
        { err, failOpen: true },
        "Penghitung kuota AI tak terbaca — panggilan DILEWATKAN karena AI_QUOTA_FAIL_OPEN",
      );
      return reservasiKosong;
    }
    logger.error({ err }, "Penghitung kuota AI tak terbaca — panggilan AI ditolak");
    throw tolak(AI_QUOTA_RETRY_GAGAL_DETIK, {
      message: "Bantuan AI sedang tidak bisa dipakai",
      hint: "Coba lagi beberapa saat, atau lanjutkan tanpa bantuan AI",
    });
  }

  /** Reservasi yang sudah dikembalikan — penjaga agar refund tidak dobel. */
  const sudahDikembalikan = new WeakSet<AiQuotaReservasi>();

  /**
   * Fungsi bernama, bukan `this.kembalikan`: objek yang dikembalikan di bawah
   * boleh saja di-destructure pemanggilnya, dan `this` yang lepas akan gagal
   * justru pada jalur pengembalian jatah — jalur yang paling jarang diuji
   * manusia.
   */
  async function kembalikan(reservasi: AiQuotaReservasi): Promise<void> {
    if (!reservasi.tercatat) return;
    if (sudahDikembalikan.has(reservasi)) return; // dobel refund = jatah gratis
    sudahDikembalikan.add(reservasi);

    const ttl = detikKeTengahMalamWib(clock()) + AI_QUOTA_TTL_GRACE_DETIK;
    // Jatah pribadi: TANPA syarat. `tercatat === true` sudah berarti kenaikannya
    // mendarat (lihat `periksaDanPakai`).
    await turunkan(kunciKuotaUser(reservasi.hari, reservasi.userId, reservasi.feature), ttl);
    // Pagu global: HANYA bila ia memang naik. Syarat ini bukan kerapian — lihat
    // `AiQuotaReservasi.global`: menurunkan penghitung yang tidak pernah naik
    // adalah mencetak anggaran bersama, dan lantai nol tidak menangkapnya.
    if (reservasi.global) await turunkan(kunciKuotaGlobal(reservasi.hari), ttl);
  }

  return {
    async periksaDanPakai({ userId, feature, lewatiGlobal = false }) {
      const sekarang = clock();
      // `hari` dihitung SEKALI dan dibawa terus: pemeriksaan, penambahan, dan
      // pengembalian tidak boleh jatuh di dua tanggal berbeda.
      const hari = hariWib(sekarang);
      const resetDetik = detikKeTengahMalamWib(sekarang);
      const ttl = resetDetik + AI_QUOTA_TTL_GRACE_DETIK;
      const batas = batasUser(feature);
      // `global: false` — tidak ada penghitung yang naik pada jalur ini, jadi
      // tidak ada pula yang boleh diturunkan bila reservasinya dikembalikan.
      const dilewati: AiQuotaReservasi = {
        hari,
        userId,
        feature,
        tercatat: false,
        global: false,
      };

      // Jatah nol = tuas darurat "AI dimatikan" (phase-06 PR-043 Rollback).
      // Ditolak SEBELUM menyentuh Redis: tidak ada yang perlu dihitung.
      if (batas === 0 || config.globalPerDay === 0) {
        throw tolak(resetDetik, {
          message: "Bantuan AI sedang dimatikan sementara",
          hint: "Lanjutkan tanpa bantuan AI; fitur ini akan kembali setelah pemeriksaan",
        });
      }

      const kunciUser = kunciKuotaUser(hari, userId, feature);

      let terpakaiUser: number;
      try {
        terpakaiUser = await naikkan(kunciUser, ttl);
      } catch (err) {
        // KEGAGALAN PARSIAL (utang PR-043a, dibayar PR-043b). `naikkan` melempar
        // juga ketika INCR-nya SUDAH berhasil dan yang gagal adalah EXPIRE/TTL
        // sesudahnya — dan tanpa pengembalian ini, jalur gagal-tertutup di bawah
        // menolak panggilan sambil meninggalkan satu unit jatah terpotong milik
        // pengguna yang tidak menerima apa pun. `turunkan` menelan kegagalannya
        // sendiri, jadi Redis yang benar-benar mati tetap jatuh ke `saatRedisGagal`.
        //
        // Syaratnya KETAT: hanya kenaikan yang benar-benar mendarat. Bila
        // `redis.incr` sendiri yang gagal, DECR di sini akan menurunkan
        // penghitung yang tidak pernah naik — membagikan jatah gratis.
        if (err instanceof KenaikanTerpasang) await turunkan(kunciUser, ttl);
        return saatRedisGagal(err, dilewati);
      }
      if (terpakaiUser > batas) {
        await turunkan(kunciUser, ttl);
        throw tolak(resetDetik);
      }

      // PAGU GLOBAL — SELURUH bloknya dilewati bila pemanggil memintanya
      // (`lewatiGlobal`, PR-044b). Yang dilewati adalah INCR-nya, bukan
      // pemeriksaan `globalPerDay === 0` di atas: tuas darurat "AI dimatikan"
      // tetap menolak semua jalur, termasuk jalur cache.
      if (!lewatiGlobal) {
        const kunciGlobal = kunciKuotaGlobal(hari);
        let terpakaiGlobal: number;
        try {
          terpakaiGlobal = await naikkan(kunciGlobal, ttl);
        } catch (err) {
          // Pagu global: sama seperti di atas, hanya kenaikan yang mendarat.
          if (err instanceof KenaikanTerpasang) await turunkan(kunciGlobal, ttl);
          // Jatah pribadi TANPA syarat: kenaikannya sudah pasti mendarat beberapa
          // baris di atas, jadi meninggalkannya terpotong merugikan pengguna yang
          // tidak menerima apa pun.
          await turunkan(kunciUser, ttl);
          return saatRedisGagal(err, dilewati);
        }
        if (terpakaiGlobal > config.globalPerDay) {
          await turunkan(kunciGlobal, ttl);
          await turunkan(kunciUser, ttl);
          // Pesannya TIDAK menyebut pagu global — lihat catatan `globalTersedia`.
          throw tolak(resetDetik, {
            message: "Bantuan AI sedang penuh hari ini",
            hint: "Coba lagi besok, atau lanjutkan tanpa bantuan AI",
          });
        }
      }

      // `global` merekam APA YANG TERJADI, bukan apa yang diminta: hanya di
      // cabang di atas pagu global benar-benar naik. `kembalikan` membacanya.
      return { hari, userId, feature, tercatat: true, global: !lewatiGlobal };
    },

    kembalikan,

    async kembalikanBila(reservasi, err) {
      if (!bolehDikembalikan(err)) return;
      await kembalikan(reservasi);
    },

    async ringkasan(userId) {
      const sekarang = clock();
      const hari = hariWib(sekarang);
      const resetDalamDetik = detikKeTengahMalamWib(sekarang);

      const angka = (raw: string | null): number => {
        if (raw === null) return 0;
        const nilai = Number(raw);
        return Number.isFinite(nilai) && nilai > 0 ? Math.trunc(nilai) : 0;
      };

      try {
        const fitur: AiQuotaFitur[] = [];
        for (const f of AI_FEATURES) {
          const batas = batasUser(f);
          const terpakai = angka(await redis.get(kunciKuotaUser(hari, userId, f)));
          fitur.push({ fitur: f, batas, terpakai, sisa: Math.max(0, batas - terpakai) });
        }
        const terpakaiGlobal = angka(await redis.get(kunciKuotaGlobal(hari)));

        return {
          hari,
          resetDalamDetik,
          fitur,
          globalTersedia: config.globalPerDay > 0 && terpakaiGlobal < config.globalPerDay,
        };
      } catch (err) {
        // 503, BUKAN angka yang dikarang. Kuota yang dilaporkan tanpa bisa
        // diperiksa akan membuat klien menjanjikan jatah yang mungkin tidak ada.
        logger.error({ err }, "Penghitung kuota AI tak terbaca saat menyusun ringkasan");
        throw appError("BELUM_SIAP", {
          message: "Jatah bantuan AI belum bisa ditampilkan",
          hint: "Coba lagi beberapa saat",
        });
      }
    },
  };
}
