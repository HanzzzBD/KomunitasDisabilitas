// Cache jawaban prompt (PR-044b).
//
// AC yang dijaga berkas ini:
// - AC-1 "naikkan versi prompt → cache lama tidak terpakai" — dan lebih dari
//   itu: menyunting ISI template tanpa menaikkan versi pun membatalkan entrinya;
// - AC-5 "cache hit tercatat (metrik hemat kuota)".
//
// Serta keputusan yang menyertainya dan tidak boleh diam-diam berubah:
// - kunci TIDAK PERNAH dihitung dari `AiChatRequest` (nonce acak per panggilan);
// - hit memotong jatah PENGGUNA, tidak memotong pagu GLOBAL (keputusan owner);
// - hit TIDAK menulis baris `ai_usage`;
// - setiap kegagalan cache = MISS (gagal terbuka), tidak pernah lemparan.
//
// Konvensi: tanpa server (Redis palsu in-memory seukuran `CacheRedisLike`),
// tanpa jaringan, waktu lewat `clock` yang disuntik — BUKAN fake timer. Mesin
// kuotanya NYATA di atas Redis kuota palsu, supaya yang diuji penegakan kuota
// yang sebenarnya, bukan stub yang mencocoki dirinya sendiri.
import { describe, it, expect, vi } from "vitest";
import { Writable } from "node:stream";
import { createLogger } from "../src/core/logger/index.js";
import {
  AI_CACHE_PREFIX,
  createAiClient,
  createAiPromptCache,
  createAiQuota,
  definePrompt,
  isKuotaHabis,
  kunciCachePrompt,
  kunciKuotaGlobal,
  kunciKuotaUser,
  METRIK_CACHE_HIT,
  METRIK_CACHE_MISS,
  PROMPT_CACHE_TTL_DEFAULT_DETIK,
  PROMPT_CACHE_TTL_MAKS_DETIK,
  spesimenKeluaranSchema,
  spesimenV1,
  type AiJsonResponse,
  type AiPromptCache,
  type AiProvider,
  type AiQuotaConfig,
  type AiUsage,
  type AiUsagePeristiwa,
  type AiUsageRecorder,
  type CacheRedisLike,
  type PromptTemplate,
  type SpesimenInput,
  type SpesimenKeluaran,
} from "../src/core/ai/index.js";
import { redisKuotaPalsu, type RedisKuotaPalsu } from "./helpers/redis-kuota.js";

const USER = "018f4c1e-0000-7000-8000-00000000aa01";
const USER_LAIN = "018f4c1e-0000-7000-8000-00000000aa02";
const ID_BARIS = "018f4c1e-0000-7000-8000-00000000bb02";

/** 05:00Z = 12:00 WIB — jauh dari batas hari, seperti di ai-quota.test.ts. */
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const HARI = "2026-08-31";

const KONTEKS = { userId: USER, feature: "cv_check" } as const;
const MASUKAN: SpesimenInput = {
  bahasa: "id",
  pertanyaan: "Apa keterampilan utama saya?",
  kutipan: ["lima tahun sebagai admin", "terbiasa memakai pembaca layar"],
};
const JAWABAN: SpesimenKeluaran = { ringkasan: "Admin berpengalaman.", yakin: true };
/**
 * Isi entri cache yang CACAT — dipakai untuk membuktikan bahwa isi entri tidak
 * pernah sampai ke log lewat `message` sebuah `SyntaxError`. Pendek dengan
 * sengaja: V8 menyalin cuplikan ~20 karakter, jadi teks yang lebih panjang
 * hanya muncul sebagian dan assertion-nya berhenti bisa merah.
 */
const RAHASIA_ENTRI = "jawaban-rahasia";
const USAGE: AiUsage = { promptTokens: 7, completionTokens: 11, totalTokens: 18 };

/**
 * Redis in-memory seukuran kontrak `CacheRedisLike`.
 *
 * Ditulis di berkas ini, bukan di `helpers/`, karena hanya berkas ini yang
 * memakainya — helper bersama lahir saat pemakai keduanya ada, bukan sebelum.
 * Ia menyimpan TTL yang dipasang supaya test bisa membuktikan bahwa setiap
 * entri memang diberi kedaluwarsa: entri abadi berisi jawaban AI atas data
 * pengguna adalah kebocoran PDP yang tidak punya jalur purge (lihat cache.ts).
 */
interface RedisCachePalsu extends CacheRedisLike {
  ambil(key: string): { nilai: string; ttl: number } | undefined;
  /** Tanam nilai mentah tanpa lewat jalur tulis — untuk entri cacat/basi. */
  tanam(key: string, nilai: string): void;
  daftarKunci(): string[];
  matikan(): void;
  jumlahGet(): number;
}

/**
 * Galat berbentuk GALAT IOREDIS SUNGGUHAN — bukan `new Error("gagal")` polos.
 *
 * Ini bukan hiasan realisme. ioredis MENEMPELKAN perintah beserta ARGUMENNYA ke
 * error yang ia tolak (`err.command = { name, args }`), dan serializer bawaan
 * pino menyalin setiap properti enumerable sebuah error ke baris log. Untuk
 * `SET`, `args` berisi [kunci ber-`userId`, MUATAN — jawaban AI utuh, "EX",
 * ttl]. Fake yang menolak dengan Error polos membuat setiap assertion
 * "log tidak memuat X" HIJAU TANPA SYARAT: tidak ada X untuk dibocorkan, jadi
 * penjaganya tidak menguji apa pun. Bentuk inilah yang membuat penjaga itu
 * bergigi.
 *
 * Pesannya sengaja `READONLY`: salah satu pemicu yang tiba tanpa tindakan siapa
 * pun, sederet dengan `MISCONF`, `OOM`, `NOAUTH`, dan restart kontainer.
 */
function galatIoredis(perintah: string, args: readonly unknown[]): Error {
  const err = new Error("READONLY You can't write against a read only replica.");
  return Object.assign(err, { command: { name: perintah, args: [...args] } });
}

function redisCachePalsu(): RedisCachePalsu {
  const isi = new Map<string, { nilai: string; ttl: number }>();
  let mati = false;
  let get = 0;

  return {
    get: (key) => {
      get += 1;
      if (mati) return Promise.reject(galatIoredis("get", [key]));
      return Promise.resolve(isi.get(key)?.nilai ?? null);
    },
    set: (key, value, _mode, seconds) => {
      if (mati) return Promise.reject(galatIoredis("set", [key, value, "EX", seconds]));
      isi.set(key, { nilai: value, ttl: seconds });
      return Promise.resolve("OK");
    },
    ambil: (key) => isi.get(key),
    tanam: (key, nilai) => {
      isi.set(key, { nilai, ttl: 1 });
    },
    daftarKunci: () => [...isi.keys()].sort(),
    matikan: () => {
      mati = true;
    },
    jumlahGet: () => get,
  };
}

function metrikPalsu() {
  const dicacah: string[] = [];
  return {
    metrics: {
      increment: (nama: string) => {
        dicacah.push(nama);
      },
    },
    dicacah,
  };
}

/**
 * Logger PINO SUNGGUHAN, hasilnya ditangkap sebagai teks.
 *
 * `vi.fn()` TIDAK bisa dipakai untuk penjaga kebocoran log: ia menyimpan
 * argumen apa adanya dan tidak pernah menjalankan serializer, sedangkan
 * kebocoran yang dijaga di sini justru LAHIR dari serializer (pino menyalin
 * setiap properti enumerable error, termasuk `command.args` milik ioredis).
 * Yang harus diperiksa adalah BARIS YANG BENAR-BENAR DITULIS — termasuk apakah
 * redaction di `core/logger` berlaku. Pola penangkapannya dipinjam dari
 * `logger.test.ts`.
 */
function loggerTertangkap() {
  const potongan: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      potongan.push(chunk.toString("utf8"));
      cb();
    },
  });
  const logger = createLogger({ LOG_LEVEL: "warn" }, { destination });
  return { logger, teks: () => potongan.join("") };
}

function rakitCache(opsi: { redis?: RedisCachePalsu } = {}) {
  const redis = opsi.redis ?? redisCachePalsu();
  const logger = { warn: vi.fn() };
  const metrik = metrikPalsu();
  const cache = createAiPromptCache({ redis, logger, metrics: metrik.metrics });
  return { cache, redis, logger, dicacah: metrik.dicacah };
}

/** Template spesimen dengan versi/isi yang bisa digeser — bahan uji AC-1. */
function templateUji(
  versi: number,
  system = "Ringkas kutipan menjadi satu kalimat.",
  lingkup?: "bersama",
): PromptTemplate<SpesimenInput, SpesimenKeluaran> {
  return definePrompt<SpesimenInput, SpesimenKeluaran>({
    nama: "uji-cache",
    versi,
    system,
    output: spesimenKeluaranSchema,
    tepercaya: ["bahasa"],
    ...(lingkup === undefined ? {} : { lingkup }),
  });
}

/**
 * Template yang HANYA berbeda pada pertahanan anti-injeksinya (`tepercaya` /
 * `maksKarakter`) — `nama`, `versi`, `system`, dan `output` sengaja identik,
 * supaya perbedaan sidik yang terlihat memang berasal dari yang sedang diuji.
 */
function sidikUji(opsi: {
  tepercaya?: readonly (keyof SpesimenInput)[];
  maksKarakter?: number;
}): PromptTemplate<SpesimenInput, SpesimenKeluaran> {
  return definePrompt<SpesimenInput, SpesimenKeluaran>({
    nama: "uji-sidik",
    versi: 1,
    system: "Ringkas kutipan menjadi satu kalimat.",
    output: spesimenKeluaranSchema,
    tepercaya: opsi.tepercaya ?? ["bahasa"],
    ...(opsi.maksKarakter === undefined ? {} : { maksKarakter: opsi.maksKarakter }),
  });
}

/** Kunci yang PASTI ada — `kunciCachePrompt` boleh mengembalikan undefined. */
function kunci<I, O>(ctx: { userId: string; feature: "cv_check" }, t: PromptTemplate<I, O>, i: I) {
  const hasil = kunciCachePrompt(ctx, t, i);
  expect(hasil).toBeDefined();
  return hasil as string;
}

describe("kunci cache — bahan dan sifatnya", () => {
  it("KUNCI TIDAK BERASAL DARI messages: bangun() berbeda tiap kali, kuncinya tidak", () => {
    // Penjaga paling penting di berkas ini. `bangun()` menempelkan nonce ACAK
    // pada setiap blok data tak tepercaya (guard.ts), jadi kunci yang dihitung
    // dari `AiChatRequest` akan berbeda pada setiap panggilan: hit-rate NOL,
    // lulus setiap test yang membandingkan dirinya sendiri, mati di produksi.
    const satu = JSON.stringify(spesimenV1.bangun(MASUKAN).messages);
    const dua = JSON.stringify(spesimenV1.bangun(MASUKAN).messages);
    expect(satu).not.toBe(dua);

    expect(kunci(KONTEKS, spesimenV1, MASUKAN)).toBe(kunci(KONTEKS, spesimenV1, MASUKAN));
  });

  it("urutan penulisan kunci objek TIDAK mengubah kunci", () => {
    // `JSON.stringify` mengikuti urutan penyisipan, jadi masukan yang dirakit
    // dinamis (`{...dasar, tambahan}`) akan meleset dari yang ditulis literal —
    // miss abadi tanpa satu pun gejala.
    const a: SpesimenInput = { bahasa: "id", pertanyaan: "p", kutipan: ["x"] };
    const b: SpesimenInput = { kutipan: ["x"], pertanyaan: "p", bahasa: "id" };
    expect(kunci(KONTEKS, spesimenV1, a)).toBe(kunci(KONTEKS, spesimenV1, b));
  });

  it("urutan LARIK mengubah kunci — di larik, urutan itu bermakna", () => {
    const a: SpesimenInput = { bahasa: "id", pertanyaan: "p", kutipan: ["x", "y"] };
    const b: SpesimenInput = { bahasa: "id", pertanyaan: "p", kutipan: ["y", "x"] };
    expect(kunci(KONTEKS, spesimenV1, a)).not.toBe(kunci(KONTEKS, spesimenV1, b));
  });

  it("Date dibaca sebagai waktunya, dan properti undefined = properti absen", () => {
    const waktu = new Date("2026-08-31T05:00:00.000Z");
    const dengan = { bahasa: "id", pertanyaan: "p", kutipan: [], sejak: waktu, catatan: undefined };
    const tanpa = { bahasa: "id", pertanyaan: "p", kutipan: [], sejak: new Date(waktu.getTime()) };
    expect(kunciCachePrompt(KONTEKS, spesimenV1, dengan as unknown as SpesimenInput)).toBe(
      kunciCachePrompt(KONTEKS, spesimenV1, tanpa as unknown as SpesimenInput),
    );
  });

  it("masukan berbeda → kunci berbeda (penjaga anti-hampa)", () => {
    const lain: SpesimenInput = { ...MASUKAN, pertanyaan: "pertanyaan lain" };
    expect(kunci(KONTEKS, spesimenV1, MASUKAN)).not.toBe(kunci(KONTEKS, spesimenV1, lain));
  });

  it("masukan yang tidak bisa diserialisasi tidak punya kunci (bukan lemparan)", () => {
    const aneh = { bahasa: "id", pertanyaan: "p", kutipan: [], jumlah: 1n };
    expect(kunciCachePrompt(KONTEKS, spesimenV1, aneh as unknown as SpesimenInput)).toBeUndefined();
  });
});

describe("AC-1 — versi prompt naik → cache lama tidak terpakai", () => {
  it("versi berbeda menghasilkan kunci berbeda", () => {
    expect(kunci(KONTEKS, templateUji(1), MASUKAN)).not.toBe(
      kunci(KONTEKS, templateUji(2), MASUKAN),
    );
  });

  it("entri v1 tidak pernah terbaca oleh v2 — dibuktikan lewat cache sungguhan", async () => {
    const { cache } = rakitCache();
    await cache.tulis(KONTEKS, templateUji(1), MASUKAN, JAWABAN);

    await expect(cache.baca(KONTEKS, templateUji(1), MASUKAN)).resolves.toEqual(JAWABAN);
    await expect(cache.baca(KONTEKS, templateUji(2), MASUKAN)).resolves.toBeUndefined();
  });

  it("MENYUNTING isi template tanpa menaikkan versi juga membatalkan entrinya", async () => {
    // Kasus nyata yang tidak punya penjaga lain: `id` tetap sama, perilakunya
    // berubah, dan tanpa sidik ini jawaban prompt LAMA disajikan sebagai jawaban
    // prompt BARU. Sidik hanya bisa menyebabkan miss tambahan — tidak pernah hit
    // basi — jadi arah kesalahannya selalu yang aman.
    const lama = templateUji(1, "Ringkas kutipan menjadi satu kalimat.");
    const baru = templateUji(1, "Ringkas kutipan menjadi TIGA kalimat.");
    expect(lama.id).toBe(baru.id);
    expect(lama.sidik).not.toBe(baru.sidik);

    const { cache } = rakitCache();
    await cache.tulis(KONTEKS, lama, MASUKAN, JAWABAN);
    await expect(cache.baca(KONTEKS, baru, MASUKAN)).resolves.toBeUndefined();
  });

  it("sidik dihitung sekali di definisi dan stabil antar template identik", () => {
    expect(templateUji(1).sidik).toBe(templateUji(1).sidik);
    expect(spesimenV1.sidik).toBe(spesimenV1.sidik);
    expect(spesimenV1.sidik).toMatch(/^[0-9a-f]{16}$/);
  });

  it("MENCABUT kunci dari `tepercaya` membatalkan entri lama", () => {
    // Mencabut sebuah kunci dari `tepercaya` BUKAN perubahan gaya: sejak saat
    // itu field tersebut dibungkus penanda ber-nonce dan dipotong — yaitu ia
    // perbaikan atas paparan injeksi PR-044a. Tanpa `tepercaya` di dalam sidik,
    // perbaikan itu tidak menjangkau masukan yang sudah ter-cache sampai TTL
    // habis, dan yang disajikan adalah jawaban yang lahir di bawah pembungkusan
    // yang lebih longgar.
    const longgar = sidikUji({ tepercaya: ["bahasa", "pertanyaan"] });
    const ketat = sidikUji({ tepercaya: ["bahasa"] });
    expect(longgar.sidik).not.toBe(ketat.sidik);
  });

  it("URUTAN penulisan `tepercaya` TIDAK mengubah sidik", () => {
    // Kalau urutan ikut berpengaruh, menata ulang satu daftar akan membuang
    // seluruh cache template itu tanpa satu pun perubahan perilaku.
    const a = sidikUji({ tepercaya: ["bahasa", "pertanyaan"] });
    const b = sidikUji({ tepercaya: ["pertanyaan", "bahasa"] });
    expect(a.sidik).toBe(b.sidik);
  });

  it("mengecilkan `maksKarakter` membatalkan entri lama", () => {
    // Alasan yang sama: batas potong adalah pertahanan anti-injeksi, dan
    // jawaban lama lahir dari masukan yang dipotong lebih longgar.
    const panjang = sidikUji({ maksKarakter: 4_000 });
    const pendek = sidikUji({ maksKarakter: 500 });
    expect(panjang.sidik).not.toBe(pendek.sidik);
  });
});

describe("lingkup entri — ber-userId sebagai default", () => {
  it("dua pengguna TIDAK berbagi entri pada template biasa", async () => {
    const { cache } = rakitCache();
    await cache.tulis(KONTEKS, spesimenV1, MASUKAN, JAWABAN);

    await expect(
      cache.baca({ userId: USER_LAIN, feature: "cv_check" }, spesimenV1, MASUKAN),
    ).resolves.toBeUndefined();
  });

  it("default template yang tidak menulis apa pun = 'pengguna'", () => {
    expect(spesimenV1.lingkup).toBe("pengguna");
    expect(templateUji(1).lingkup).toBe("pengguna");
  });

  it("lingkup 'bersama' menghapus userId dari kunci — dan hanya itu bedanya", async () => {
    const bersama = templateUji(1, "Ringkas kutipan.", "bersama");
    expect(bersama.lingkup).toBe("bersama");
    expect(kunci(KONTEKS, bersama, MASUKAN)).toBe(
      kunci({ userId: USER_LAIN, feature: "cv_check" }, bersama, MASUKAN),
    );

    const { cache } = rakitCache();
    await cache.tulis(KONTEKS, bersama, MASUKAN, JAWABAN);
    await expect(
      cache.baca({ userId: USER_LAIN, feature: "cv_check" }, bersama, MASUKAN),
    ).resolves.toEqual(JAWABAN);
  });

  it("userId KOSONG pada lingkup pengguna = tidak bisa di-cache, bukan satu entri bersama", () => {
    // `userId: ""` menghasilkan sufiks `…:u::<hash>` yang SAMA bagi setiap
    // pemanggil yang melakukannya — lingkup bersama de facto, tanpa satu pun
    // template menyentuh `lingkup` dan tanpa penjaga allow-list pernah
    // melihatnya. Pemanggil yang paling mungkin melakukannya bukan HTTP
    // (userId-nya dari sesi) melainkan worker dengan id sistem sintetis.
    expect(
      kunciCachePrompt({ userId: "", feature: "cv_check" }, spesimenV1, MASUKAN),
    ).toBeUndefined();
  });

  it("userId BUKAN string juga ditolak — `tsc` tidak menjaga pemanggil JavaScript", () => {
    const konteks = { userId: undefined, feature: "cv_check" } as unknown as typeof KONTEKS;
    expect(kunciCachePrompt(konteks, spesimenV1, MASUKAN)).toBeUndefined();
  });

  it("userId kosong TIDAK menyentuh Redis sama sekali (baca maupun tulis)", async () => {
    const { cache, redis } = rakitCache();
    const kosong = { userId: "", feature: "cv_check" } as const;

    await expect(cache.baca(kosong, spesimenV1, MASUKAN)).resolves.toBeUndefined();
    await cache.tulis(kosong, spesimenV1, MASUKAN, JAWABAN);

    expect(redis.jumlahGet()).toBe(0);
    expect(redis.daftarKunci()).toEqual([]);
  });

  it("pada lingkup 'bersama' userId kosong TIDAK menghalangi — di sana ia memang tak dipakai", () => {
    // Cabang keduanya, supaya penjagaan di atas tidak diam-diam melebar menjadi
    // "cache mati kalau tidak ada userId" pada template yang memang tak
    // membutuhkannya.
    const bersama = templateUji(1, "Ringkas kutipan.", "bersama");
    const dariKosong = kunciCachePrompt({ userId: "", feature: "cv_check" }, bersama, MASUKAN);
    expect(dariKosong).toBeDefined();
    expect(dariKosong).toBe(kunci(KONTEKS, bersama, MASUKAN));
  });

  it("fitur ikut menentukan kunci — satu template tidak bocor lintas fitur", () => {
    const a = kunciCachePrompt({ userId: USER, feature: "cv_check" }, spesimenV1, MASUKAN);
    const b = kunciCachePrompt({ userId: USER, feature: "cv_chat" }, spesimenV1, MASUKAN);
    expect(a).not.toBe(b);
  });
});

describe("baca/tulis — TTL, sanitasi ulang, dan metrik", () => {
  it("tulis lalu baca = hit, dan entrinya SELALU diberi TTL", async () => {
    const { cache, redis, dicacah } = rakitCache();
    await cache.tulis(KONTEKS, spesimenV1, MASUKAN, JAWABAN);

    const entri = redis.ambil(kunci(KONTEKS, spesimenV1, MASUKAN));
    expect(entri?.ttl).toBe(PROMPT_CACHE_TTL_DEFAULT_DETIK);

    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toEqual(JAWABAN);
    expect(dicacah).toEqual([METRIK_CACHE_HIT]);
  });

  it("TTL template dipakai, dan dijepit ke plafon 24 jam (mitigasi PDP)", async () => {
    const panjang = definePrompt<SpesimenInput, SpesimenKeluaran>({
      nama: "uji-ttl",
      versi: 1,
      system: "Ringkas.",
      output: spesimenKeluaranSchema,
      tepercaya: ["bahasa"],
      cacheTtlDetik: 999_999,
    });
    expect(panjang.cacheTtlDetik).toBe(PROMPT_CACHE_TTL_MAKS_DETIK);

    const pendek = definePrompt<SpesimenInput, SpesimenKeluaran>({
      nama: "uji-ttl",
      versi: 2,
      system: "Ringkas.",
      output: spesimenKeluaranSchema,
      tepercaya: ["bahasa"],
      cacheTtlDetik: 60,
    });

    const { cache, redis } = rakitCache();
    await cache.tulis(KONTEKS, pendek, MASUKAN, JAWABAN);
    expect(redis.ambil(kunci(KONTEKS, pendek, MASUKAN))?.ttl).toBe(60);
  });

  it("TTL nol/negatif dijepit ke 1 detik, bukan diteruskan ke Redis", () => {
    // `SET … EX 0` ditolak Redis nyata; entri yang gagal ditulis diam-diam akan
    // membuat template itu selamanya miss tanpa satu pun gejala.
    const nol = definePrompt<SpesimenInput, SpesimenKeluaran>({
      nama: "uji-ttl-nol",
      versi: 1,
      system: "Ringkas.",
      output: spesimenKeluaranSchema,
      tepercaya: ["bahasa"],
      cacheTtlDetik: 0,
    });
    expect(nol.cacheTtlDetik).toBe(1);
  });

  it("template RAKITAN TANGAN ber-TTL setahun tetap dijepit di titik tulis", async () => {
    // `PromptTemplate` adalah interface yang diekspor barrel dan
    // `cacheTtlDetik: number` menerima angka apa pun — tidak ada apa pun di
    // tingkat tipe yang memaksa sebuah template lahir dari `definePrompt`. TTL
    // adalah SATU-SATUNYA kendali PDP atas entri cache (D10: purge akun tidak
    // menjangkau Redis), jadi ia dijepit di titik cekik, bukan hanya di titik
    // niat. Tanpa jepitan kedua ini, jawaban AI atas data pengguna tersimpan
    // setahun, melewati penghapusan akun, tanpa satu pun test merah.
    const setahun: PromptTemplate<SpesimenInput, SpesimenKeluaran> = {
      ...templateUji(1),
      cacheTtlDetik: 31_536_000,
    };
    const { cache, redis } = rakitCache();
    await cache.tulis(KONTEKS, setahun, MASUKAN, JAWABAN);
    expect(redis.ambil(kunci(KONTEKS, setahun, MASUKAN))?.ttl).toBe(PROMPT_CACHE_TTL_MAKS_DETIK);
  });

  it("TTL rakitan tangan yang nol/negatif/NaN tidak pernah sampai ke Redis apa adanya", async () => {
    // `SET … EX 0` (dan negatif) ditolak Redis nyata; `EX NaN` sama saja.
    // Ketiganya akan menjadi kegagalan tulis yang DIAM — gagal terbuka, jadi
    // template itu selamanya miss tanpa satu pun gejala selain tagihan.
    const kasus: ReadonlyArray<{ ttl: number; harap: number }> = [
      { ttl: 0, harap: 1 },
      { ttl: -5, harap: 1 },
      { ttl: Number.NaN, harap: PROMPT_CACHE_TTL_DEFAULT_DETIK },
      { ttl: Number.POSITIVE_INFINITY, harap: PROMPT_CACHE_TTL_DEFAULT_DETIK },
    ];

    for (const [i, k] of kasus.entries()) {
      // Versi digeser supaya keempat kasus tidak menimpa kunci yang sama.
      const t: PromptTemplate<SpesimenInput, SpesimenKeluaran> = {
        ...templateUji(i + 1),
        cacheTtlDetik: k.ttl,
      };
      const { cache, redis } = rakitCache();
      await cache.tulis(KONTEKS, t, MASUKAN, JAWABAN);
      expect(redis.ambil(kunci(KONTEKS, t, MASUKAN))?.ttl).toBe(k.harap);
    }
  });

  it("nilai dari cache DIPARSE ULANG lewat skema template — sanitasi ikut berjalan", async () => {
    // Entri Redis adalah masukan tak tepercaya begitu ia keluar. Di sini ia
    // ditanam mentah berisi <script>; yang keluar wajib sudah bersih, persis
    // seperti jalur provider.
    const { cache, redis } = rakitCache();
    redis.tanam(
      kunci(KONTEKS, spesimenV1, MASUKAN),
      JSON.stringify({ ringkasan: "<script>alert(1)</script>Halo", yakin: true }),
    );

    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toEqual({
      ringkasan: "Halo",
      yakin: true,
    });
  });

  it("entri basi-skema = MISS, bukan lemparan", async () => {
    const { cache, redis, dicacah } = rakitCache();
    redis.tanam(kunci(KONTEKS, spesimenV1, MASUKAN), JSON.stringify({ ringkasan: 5 }));

    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toBeUndefined();
    expect(dicacah).toEqual([METRIK_CACHE_MISS]);
  });

  it("entri JSON cacat = MISS, bukan lemparan", async () => {
    const { cache, redis } = rakitCache();
    redis.tanam(kunci(KONTEKS, spesimenV1, MASUKAN), "{bukan json");

    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toBeUndefined();
  });

  it("GAGAL TERBUKA: Redis mati → miss, tanpa melempar, baik saat baca maupun tulis", async () => {
    const redis = redisCachePalsu();
    const { cache, logger } = rakitCache({ redis });
    redis.matikan();

    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toBeUndefined();
    await expect(cache.tulis(KONTEKS, spesimenV1, MASUKAN, JAWABAN)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("masukan tak terserialisasi tidak menyentuh Redis sama sekali", async () => {
    const aneh = { bahasa: "id", pertanyaan: "p", kutipan: [], jumlah: 1n } as unknown;
    const { cache, redis } = rakitCache();

    await expect(cache.baca(KONTEKS, spesimenV1, aneh as SpesimenInput)).resolves.toBeUndefined();
    await cache.tulis(KONTEKS, spesimenV1, aneh as SpesimenInput, JAWABAN);

    expect(redis.jumlahGet()).toBe(0);
    expect(redis.daftarKunci()).toEqual([]);
  });

  it("miss dicacah sebagai miss (AC-5: rasio hemat bisa dibaca)", async () => {
    const { cache, dicacah } = rakitCache();
    await cache.baca(KONTEKS, spesimenV1, MASUKAN);
    expect(dicacah).toEqual([METRIK_CACHE_MISS]);
  });

  it("sink metrik yang melempar tidak menjatuhkan jalur panas", async () => {
    const redis = redisCachePalsu();
    const cache = createAiPromptCache({
      redis,
      logger: { warn: vi.fn() },
      metrics: {
        increment: () => {
          throw new Error("sink metrik rusak");
        },
      },
    });

    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toBeUndefined();
  });

  it("tanpa sink metrik pun berjalan (port-nya opsional)", async () => {
    const cache = createAiPromptCache({ redis: redisCachePalsu(), logger: { warn: vi.fn() } });
    await cache.tulis(KONTEKS, spesimenV1, MASUKAN, JAWABAN);
    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toEqual(JAWABAN);
  });

  it("LOG TIDAK PERNAH memuat kunci mentah, userId, isi prompt, atau jawaban", async () => {
    // Kunci memuat sidik masukan pengguna dan (pada lingkup pengguna) userId-nya.
    // Mencatatnya akan memindahkan data itu ke tempat yang paling sulit
    // dibersihkan — dan purge akun tidak menjangkau log maupun Redis.
    //
    // Penjaga ini dijalankan lewat logger pino SUNGGUHAN dan galat berbentuk
    // GALAT IOREDIS (`command.args` berisi kunci + muatan). Versi sebelumnya
    // memakai `vi.fn()` dan Error polos, sehingga assertion di bawah hijau
    // tanpa syarat — hampa persis di tempat kebocorannya berada.
    const redis = redisCachePalsu();
    const { logger, teks } = loggerTertangkap();
    const cache = createAiPromptCache({ redis, logger });
    redis.matikan();

    await cache.baca(KONTEKS, spesimenV1, MASUKAN);
    await cache.tulis(KONTEKS, spesimenV1, MASUKAN, JAWABAN);

    const dicatat = teks();
    // Ada baris yang benar-benar ditulis — kalau tidak, semua `not.toContain`
    // di bawah lulus karena tidak ada apa-apa.
    expect(dicatat).not.toBe("");
    expect(dicatat).not.toContain(USER);
    expect(dicatat).not.toContain(spesimenV1.sidik);
    expect(dicatat).not.toContain(MASUKAN.pertanyaan);
    expect(dicatat).not.toContain(JAWABAN.ringkasan);
    expect(dicatat).not.toContain(AI_CACHE_PREFIX);
    // Yang boleh — dan wajib — ada: identitas template, supaya kegagalannya
    // bisa ditindaklanjuti sama sekali.
    expect(dicatat).toContain(spesimenV1.id);
  });

  it("field `err` yang dicatat adalah NAMA error, bukan objeknya — penjaga lapis lokal", async () => {
    // KENAPA test ini terpisah dari yang di atas, dan kenapa ia tidak boleh
    // digabung. Dua lapis menjaga kebocoran yang sama: penyempitan lokal
    // (`namaError`) dan jalur redaksi pino (`err.command.args`). Test di atas
    // lulus selama SALAH SATU dari keduanya masih hidup — jadi mencabut
    // `namaError` sendirian tidak membuatnya merah. Lapisan yang tidak punya
    // test yang gagal ketika ia dihapus adalah lapisan yang membusuk diam-diam,
    // dan pertahanan berlapis yang satu lapisnya sudah mati bukan lagi berlapis.
    //
    // Yang ini menguji penyempitan lokal SENDIRIAN, tanpa bergantung pada
    // redaksi: `err` yang sudah disempitkan adalah STRING (nama error-nya),
    // sedangkan `err` mentah diserialisasi pino menjadi OBJEK
    // (`{type,message,stack,command}`). Bedanya kasat mata di tipe, bukan di isi
    // — jadi ia tetap merah meski redaksi menyensor seluruh muatannya.
    const redis = redisCachePalsu();
    const { logger, teks } = loggerTertangkap();
    const cache = createAiPromptCache({ redis, logger });
    redis.matikan();

    await cache.tulis(KONTEKS, spesimenV1, MASUKAN, JAWABAN);

    const baris = teks()
      .split("\n")
      .filter((b) => b.trim() !== "")
      .map((b) => JSON.parse(b) as { err?: unknown });
    // Anti-hampa: tanpa baris, perulangan di bawah tidak memeriksa apa pun.
    expect(baris.length).toBeGreaterThan(0);
    for (const rec of baris) {
      expect(typeof rec.err).toBe("string");
    }
  });

  it("LOG entri cacat tidak memuat isi entri — pesan SyntaxError pun membawanya", async () => {
    // Jalur kedua, dan yang paling mudah terlewat: `message` sebuah
    // `SyntaxError` V8 MENYALIN cuplikan masukan yang gagal diurai
    // (`Unexpected token 'r', "…" is not valid JSON`). Masukan itu di sini
    // adalah entri cache — yaitu jawaban AI. Tidak ada redaction yang bisa
    // menolongnya: kebocorannya ada di dalam teks pesan, jadi satu-satunya
    // granularitas yang benar adalah `err.name`.
    //
    // Entri ditanam PENDEK dan tanpa tanda kutip penutup dengan sengaja: V8
    // hanya menyalin cuplikan pada varian "is not valid JSON". Entri yang
    // terpotong di tengah string menghasilkan "Unterminated string in JSON at
    // position N" yang TIDAK membawa isi — bentuk yang terlihat menguji tetapi
    // tidak bisa merah. Jangan "menyederhanakan" tanaman ini.
    const redis = redisCachePalsu();
    const { logger, teks } = loggerTertangkap();
    const cache = createAiPromptCache({ redis, logger });
    redis.tanam(kunci(KONTEKS, spesimenV1, MASUKAN), RAHASIA_ENTRI);

    await expect(cache.baca(KONTEKS, spesimenV1, MASUKAN)).resolves.toBeUndefined();

    const dicatat = teks();
    expect(dicatat).not.toBe("");
    expect(dicatat).not.toContain(RAHASIA_ENTRI);
    expect(dicatat).toContain(spesimenV1.id);
  });
});

// ===========================================================================
// AiClient.prompt — urutan cache → kuota → provider → jejak biaya → cache tulis
// ===========================================================================

function konfigurasi(perUser: Partial<Record<string, number>> = {}): AiQuotaConfig {
  return {
    perUserPerDay: {
      cv_chat: 3,
      cv_finalize: 2,
      cv_check: 3,
      simplify_text: 2,
      interview_sim: 2,
      rerank: 1,
      embed: 5,
      ...perUser,
    } as AiQuotaConfig["perUserPerDay"],
    globalPerDay: 100,
  };
}

function providerPalsu(nama = "gemini") {
  const chatJson = vi.fn(
    (): Promise<AiJsonResponse<SpesimenKeluaran>> =>
      Promise.resolve({ data: JAWABAN, provider: nama, model: `model-${nama}`, usage: USAGE }),
  );
  return { provider: { name: nama, chatJson } as unknown as AiProvider, chatJson };
}

function recorderPalsu() {
  const dicatat: AiUsagePeristiwa[] = [];
  const catat = vi.fn((peristiwa: AiUsagePeristiwa): Promise<void> => {
    dicatat.push(peristiwa);
    return Promise.resolve();
  });
  return { recorder: { catat } as AiUsageRecorder, catat, dicatat };
}

function rakitKlien(
  opsi: {
    cache?: AiPromptCache;
    redisKuota?: RedisKuotaPalsu;
    config?: AiQuotaConfig;
  } = {},
) {
  const redisKuota = opsi.redisKuota ?? redisKuotaPalsu();
  const p = providerPalsu();
  const rec = recorderPalsu();
  const quota = createAiQuota({
    redis: redisKuota,
    config: opsi.config ?? konfigurasi(),
    logger: { warn: vi.fn(), error: vi.fn() },
    clock: () => SIANG,
  });
  const client = createAiClient({
    provider: p.provider,
    quota,
    recorder: rec.recorder,
    logger: { error: vi.fn() },
    ids: () => ID_BARIS,
    clock: () => SIANG,
    ...(opsi.cache === undefined ? {} : { cache: opsi.cache }),
  });
  return { client, redisKuota, chatJson: p.chatJson, rec };
}

describe("AiClient.prompt — MISS", () => {
  it("memanggil provider, mencatat ai_usage ber-promptVersion, lalu MENGISI cache", async () => {
    const { cache, redis } = rakitCache();
    const { client, chatJson, rec, redisKuota } = rakitKlien({ cache });

    const hasil = await client.prompt(KONTEKS, spesimenV1, MASUKAN);

    expect(hasil.dariCache).toBe(false);
    expect(hasil.data).toEqual(JAWABAN);
    // Metadata biaya HANYA ada di jalur yang benar-benar berbiaya.
    expect(hasil.provider).toBe("gemini");
    expect(hasil.usage).toEqual(USAGE);
    expect(chatJson).toHaveBeenCalledTimes(1);
    // `template.id` mengisi kolom yang sejak PR-043b selalu NULL.
    expect(rec.dicatat[0]).toMatchObject({ promptVersion: spesimenV1.id, tokensIn: 7 });
    expect(redis.daftarKunci()).toEqual([kunci(KONTEKS, spesimenV1, MASUKAN)]);
    // Miss memotong KEDUA penghitung — ia panggilan berbiaya biasa.
    expect(redisKuota.nilai(kunciKuotaUser(HARI, USER, "cv_check"))).toBe(1);
    expect(redisKuota.nilai(kunciKuotaGlobal(HARI))).toBe(1);
  });

  it("tanpa dep cache: perilakunya persis seperti sebelum PR-044b", async () => {
    const { client, chatJson, rec } = rakitKlien();

    await client.prompt(KONTEKS, spesimenV1, MASUKAN);
    await client.prompt(KONTEKS, spesimenV1, MASUKAN);

    expect(chatJson).toHaveBeenCalledTimes(2);
    expect(rec.catat).toHaveBeenCalledTimes(2);
  });

  it("cache yang tumbang tidak pernah mencabut jawaban AI (gagal terbuka, ujung ke ujung)", async () => {
    const redis = redisCachePalsu();
    const { cache } = rakitCache({ redis });
    redis.matikan();
    const { client, chatJson } = rakitKlien({ cache });

    await expect(client.prompt(KONTEKS, spesimenV1, MASUKAN)).resolves.toMatchObject({
      dariCache: false,
    });
    expect(chatJson).toHaveBeenCalledTimes(1);
  });
});

describe("AiClient.prompt — HIT", () => {
  it("panggilan kedua tidak menyentuh provider dan tidak menulis baris ai_usage", async () => {
    const { cache } = rakitCache();
    const { client, chatJson, rec, redisKuota } = rakitKlien({ cache });

    await client.prompt(KONTEKS, spesimenV1, MASUKAN);
    const kedua = await client.prompt(KONTEKS, spesimenV1, MASUKAN);

    expect(kedua.dariCache).toBe(true);
    expect(kedua.data).toEqual(JAWABAN);
    expect(chatJson).toHaveBeenCalledTimes(1);
    // Keputusan owner (c): hit cukup METRIK. Baris 0-token akan merusak
    // rekonsiliasi tagihan PR-043b, tempat 0/0 sudah berarti "embed".
    // Konsekuensi yang harus diketahui pembaca angka: cacah panggilan TIDAK
    // lagi sama dengan cacah baris `ai_usage`.
    expect(rec.catat).toHaveBeenCalledTimes(1);
    expect(redisKuota.nilai(kunciKuotaUser(HARI, USER, "cv_check"))).toBe(2);
    // Keputusan owner (b): pagu global TIDAK naik pada hit — hit tidak berbiaya.
    expect(redisKuota.nilai(kunciKuotaGlobal(HARI))).toBe(1);
  });

  it("hit TIDAK membawa provider/model/usage — ketiganya memang tidak ada", async () => {
    const { cache } = rakitCache();
    const { client } = rakitKlien({ cache });

    await client.prompt(KONTEKS, spesimenV1, MASUKAN);
    const kedua = await client.prompt(KONTEKS, spesimenV1, MASUKAN);

    expect(kedua.provider).toBeUndefined();
    expect(kedua.model).toBeUndefined();
    expect(kedua.usage).toBeUndefined();
  });

  it("AC-5 — hit tercacah sebagai metrik hemat kuota", async () => {
    const { cache, dicacah } = rakitCache();
    const { client } = rakitKlien({ cache });

    await client.prompt(KONTEKS, spesimenV1, MASUKAN);
    await client.prompt(KONTEKS, spesimenV1, MASUKAN);

    expect(dicacah).toEqual([METRIK_CACHE_MISS, METRIK_CACHE_HIT]);
  });

  it("jatah pengguna habis → hit pun DITOLAK (kendali anti-abuse, bukan cacat)", async () => {
    // Kalau hit boleh lewat tanpa jatah, cache menjadi API tanpa batas bagi
    // siapa pun yang bisa menebak masukan yang pernah dipakai. Jangan
    // "perbaiki" ini tanpa membaca keputusan owner 2026-09-03.
    const { cache } = rakitCache();
    const { client, chatJson } = rakitKlien({ cache, config: konfigurasi({ cv_check: 1 }) });

    await client.prompt(KONTEKS, spesimenV1, MASUKAN);
    await expect(client.prompt(KONTEKS, spesimenV1, MASUKAN)).rejects.toSatisfy(isKuotaHabis);
    expect(chatJson).toHaveBeenCalledTimes(1);
  });

  it("pengguna LAIN tidak pernah menerima entri milik orang lain", async () => {
    const { cache } = rakitCache();
    const { client, chatJson } = rakitKlien({ cache });

    await client.prompt(KONTEKS, spesimenV1, MASUKAN);
    const lain = await client.prompt(
      { userId: USER_LAIN, feature: "cv_check" },
      spesimenV1,
      MASUKAN,
    );

    expect(lain.dariCache).toBe(false);
    expect(chatJson).toHaveBeenCalledTimes(2);
  });

  it("versi template naik → hit lama tidak dipakai, provider dipanggil lagi (AC-1 ujung ke ujung)", async () => {
    const { cache } = rakitCache();
    const { client, chatJson } = rakitKlien({ cache });

    await client.prompt(KONTEKS, templateUji(1), MASUKAN);
    await client.prompt(KONTEKS, templateUji(1), MASUKAN);
    expect(chatJson).toHaveBeenCalledTimes(1);

    await client.prompt(KONTEKS, templateUji(2), MASUKAN);
    expect(chatJson).toHaveBeenCalledTimes(2);
  });
});
