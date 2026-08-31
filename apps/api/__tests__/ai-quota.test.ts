// Mesin kuota AI (PR-043).
//
// AC yang dijaga berkas ini:
// - AC-1 kuota habis → error berbentuk degradasi (429 + Retry-After), bukan 500;
// - AC-2 penghitung berganti tepat di tengah malam WIB (jam disuntik);
// - AC-4 pagu global menghentikan panggilan meski jatah pribadi masih ada;
// - urutan reserve-then-refund, termasuk yang TIDAK dikembalikan.
//
// Tidak butuh Docker: mesinnya menerima `QuotaRedisLike` (lihat helper).
import { describe, it, expect, vi } from "vitest";
import { AppError } from "../src/core/http/errors.js";
import { AiProviderError } from "../src/core/ai/types.js";
import {
  AI_QUOTA_RETRY_GAGAL_DETIK,
  AI_QUOTA_TTL_GRACE_DETIK,
  bolehDikembalikan,
  createAiQuota,
  isKuotaHabis,
  kunciKuotaGlobal,
  kunciKuotaUser,
  type AiQuotaConfig,
  type AiQuotaFeature,
} from "../src/core/ai/index.js";
import { redisKuotaPalsu, type RedisKuotaPalsu } from "./helpers/redis-kuota.js";

const A = "018f4c1e-0000-7000-8000-00000000aaaa";
const B = "018f4c1e-0000-7000-8000-00000000bbbb";

/** 05:00Z = 12:00 WIB tanggal 31 Agustus — jauh dari batas hari. */
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const HARI = "2026-08-31";

interface KonfigurasiUji {
  perUserPerDay?: Partial<Record<AiQuotaFeature, number>>;
  globalPerDay?: number;
}

function konfigurasi(overrides: KonfigurasiUji = {}): AiQuotaConfig {
  return {
    perUserPerDay: {
      cv_chat: 3,
      cv_finalize: 2,
      cv_check: 2,
      simplify_text: 2,
      interview_sim: 2,
      rerank: 1,
      embed: 5,
      ...(overrides.perUserPerDay ?? {}),
    },
    globalPerDay: overrides.globalPerDay ?? 100,
  };
}

const loggerSenyap = { warn: vi.fn(), error: vi.fn() };

function mesin(
  options: {
    redis?: RedisKuotaPalsu;
    config?: AiQuotaConfig;
    waktu?: () => Date;
    failOpen?: boolean;
  } = {},
) {
  const redis = options.redis ?? redisKuotaPalsu();
  const quota = createAiQuota({
    redis,
    config: options.config ?? konfigurasi(),
    logger: { warn: vi.fn(), error: vi.fn() },
    clock: options.waktu ?? (() => SIANG),
    ...(options.failOpen === undefined ? {} : { failOpen: options.failOpen }),
  });
  return { quota, redis };
}

describe("AC-1 — jatah pribadi habis", () => {
  it("panggilan ke-4 dari jatah 3 ditolak 429 + Retry-After, bukan 500", async () => {
    const { quota } = mesin();
    for (let i = 0; i < 3; i += 1) {
      await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).resolves.toMatchObject(
        { tercatat: true, hari: HARI },
      );
    }

    const err = await quota
      .periksaDanPakai({ userId: A, feature: "cv_chat" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    const app = err as AppError;
    expect(app.status).toBe(429);
    expect(app.code).toBe("KUOTA_AI_HABIS");
    expect(app.retryAfterSeconds).toBeGreaterThan(0);
    // 12:00 WIB → 12 jam menuju tengah malam.
    expect(app.retryAfterSeconds).toBe(43_200);
    expect(app.envelope).toEqual({
      code: "KUOTA_AI_HABIS",
      message: expect.any(String),
      hint: expect.any(String),
    });
  });

  it("predikat isKuotaHabis mengenalinya (pemanggil tidak membandingkan kelas)", async () => {
    const { quota } = mesin({ config: konfigurasi({ perUserPerDay: { rerank: 0 } }) });
    const err = await quota
      .periksaDanPakai({ userId: A, feature: "rerank" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(isKuotaHabis(err)).toBe(true);
    // Objek apa pun berkode sama ikut dikenali — itulah gunanya predikat: PR-046
    // boleh mengganti kelasnya tanpa memutus satu pun pemanggil.
    expect(isKuotaHabis({ code: "KUOTA_AI_HABIS" })).toBe(true);
    expect(isKuotaHabis(new Error("biasa"))).toBe(false);
    expect(isKuotaHabis(undefined)).toBe(false);
  });

  it("jatah 0 ditolak TANPA menyentuh Redis (tuas darurat 'AI dimatikan')", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis, config: konfigurasi({ perUserPerDay: { cv_chat: 0 } }) });

    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).rejects.toThrow(
      AppError,
    );
    expect(redis.jumlahPerintah()).toBe(0);
  });

  it("pagu global 0 mematikan seluruh fitur sekaligus", async () => {
    const { quota } = mesin({ config: konfigurasi({ globalPerDay: 0 }) });
    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).rejects.toSatisfy(
      isKuotaHabis,
    );
  });

  it("jatah 0 tetap menolak walau AI_QUOTA_FAIL_OPEN=true (tuas darurat tidak boleh kalah oleh tuas gangguan Redis)", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({
      redis,
      config: konfigurasi({ perUserPerDay: { cv_chat: 0 } }),
      failOpen: true,
    });

    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).rejects.toSatisfy(
      isKuotaHabis,
    );
    // Ditolak sebelum menyentuh Redis sama sekali — failOpen hanya relevan
    // untuk KEGAGALAN Redis, bukan untuk kuota yang memang sengaja nol.
    expect(redis.jumlahPerintah()).toBe(0);
  });

  it("fitur yang tidak dikenal ditolak, tidak pernah dianggap tak terbatas", async () => {
    const { quota } = mesin();
    const err = await quota
      // Sengaja menembus tipe: nilainya bisa datang dari data lama/DB.
      .periksaDanPakai({ userId: A, feature: "fitur_hantu" as unknown as AiQuotaFeature })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isKuotaHabis(err)).toBe(true);
  });
});

describe("AC-2 — penghitung dikelompokkan per hari WIB", () => {
  it("kunci memuat tanggal WIB dan setiap kunci diberi TTL", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis });
    await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });

    const kunciUser = kunciKuotaUser(HARI, A, "cv_chat");
    expect(redis.daftarKunci()).toEqual([kunciKuotaGlobal(HARI), kunciUser].sort());
    // TTL = jarak ke tengah malam + kelonggaran. Wajib ada: kunci abadi di
    // instans `noeviction` adalah kebocoran memori yang bisa mematikan antrean.
    expect(redis.ttlTerpasang(kunciUser)).toBe(43_200 + AI_QUOTA_TTL_GRACE_DETIK);
    expect(redis.ttlTerpasang(kunciKuotaGlobal(HARI))).toBeGreaterThan(0);
  });

  it("melewati tengah malam WIB → jatah penuh lagi, tanpa job terjadwal", async () => {
    const redis = redisKuotaPalsu();
    let sekarang = new Date("2026-08-31T16:59:59.000Z"); // 23:59:59 WIB
    const { quota } = mesin({ redis, waktu: () => sekarang });

    for (let i = 0; i < 3; i += 1) {
      await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    }
    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).rejects.toSatisfy(
      isKuotaHabis,
    );

    sekarang = new Date("2026-08-31T17:00:00.000Z"); // 00:00:00 WIB, hari baru
    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).resolves.toMatchObject({
      hari: "2026-09-01",
      tercatat: true,
    });
    // Kunci kemarin TIDAK dihapus — ia kedaluwarsa sendiri; yang penting
    // penghitung hari ini mulai dari nol.
    expect(redis.nilai(kunciKuotaUser("2026-09-01", A, "cv_chat"))).toBe(1);
    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(3);
  });

  it("kunci tanpa TTL (EXPIRE pernah gagal) dipasangi TTL, bukan dibaca sebagai jatah baru", async () => {
    // Kunci sudah bernilai 3 (jatah habis) dan tanpa kedaluwarsa.
    const redis = redisKuotaPalsu({ [kunciKuotaUser(HARI, A, "cv_chat")]: 3 });
    const { quota } = mesin({ redis });

    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).rejects.toSatisfy(
      isKuotaHabis,
    );
    expect(redis.ttlTerpasang(kunciKuotaUser(HARI, A, "cv_chat"))).toBeGreaterThan(0);
  });

  it("ringkasan melaporkan hari WIB, sisa per fitur, dan waktu reset", async () => {
    const { quota } = mesin();
    await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    const ringkasan = await quota.ringkasan(A);

    expect(ringkasan.hari).toBe(HARI);
    expect(ringkasan.resetDalamDetik).toBe(43_200);
    expect(ringkasan.fitur.find((f) => f.fitur === "cv_chat")).toEqual({
      fitur: "cv_chat",
      batas: 3,
      terpakai: 1,
      sisa: 2,
    });
    expect(ringkasan.globalTersedia).toBe(true);
  });
});

describe("AC-4 — pagu global", () => {
  it("menghentikan pengguna yang jatah pribadinya masih tersisa", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis, config: konfigurasi({ globalPerDay: 2 }) });

    await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    await quota.periksaDanPakai({ userId: B, feature: "cv_chat" });

    const err = await quota
      .periksaDanPakai({ userId: A, feature: "cv_chat" }) // jatah pribadi A masih 1 lagi
      .then(() => null)
      .catch((e: unknown) => e);

    expect(isKuotaHabis(err)).toBe(true);
    expect((err as AppError).status).toBe(429);
    // Jatah pribadi A dikembalikan: ia tidak boleh ikut terpotong oleh pagu
    // yang bukan miliknya.
    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(1);
    expect(redis.nilai(kunciKuotaGlobal(HARI))).toBe(2);
  });

  it("pesannya tidak membocorkan sisa anggaran bersama", async () => {
    const { quota } = mesin({ config: konfigurasi({ globalPerDay: 1 }) });
    await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    const err = (await quota
      .periksaDanPakai({ userId: B, feature: "cv_chat" })
      .catch((e: unknown) => e)) as AppError;

    expect(`${err.message} ${err.hint ?? ""}`).not.toMatch(/\d/);
  });

  it("satu akun tidak bisa menguras anggaran bersama (jatah pribadi lebih dulu habis)", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis, config: konfigurasi({ globalPerDay: 1_000 }) });

    for (let i = 0; i < 3; i += 1) {
      await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    }
    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).rejects.toSatisfy(
      isKuotaHabis,
    );
    // Pagu global nyaris tak tersentuh — pengguna LAIN masih punya anggaran.
    expect(redis.nilai(kunciKuotaGlobal(HARI))).toBe(3);
    await expect(quota.periksaDanPakai({ userId: B, feature: "cv_chat" })).resolves.toMatchObject({
      tercatat: true,
    });
  });

  it("globalTersedia false saat pagu tercapai (tanpa menyebut angkanya)", async () => {
    const { quota } = mesin({ config: konfigurasi({ globalPerDay: 1 }) });
    await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    const ringkasan = await quota.ringkasan(B);

    expect(ringkasan.globalTersedia).toBe(false);
    expect(JSON.stringify(ringkasan)).not.toContain("globalTerpakai");
  });
});

describe("reserve-then-refund", () => {
  it("kegagalan provider yang membuat pengguna tidak menerima apa pun → jatah kembali", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis });
    const reservasi = await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(1);

    await quota.kembalikanBila(reservasi, new AiProviderError("AI_TIMEOUT", "gemini"));

    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(0);
    expect(redis.nilai(kunciKuotaGlobal(HARI))).toBe(0);
  });

  it("AI_SAFETY_BLOCK TIDAK dikembalikan — menjajaki penyaring keamanan tidak boleh gratis", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis });
    const reservasi = await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });

    await quota.kembalikanBila(reservasi, new AiProviderError("AI_SAFETY_BLOCK", "gemini"));

    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(1);
    expect(bolehDikembalikan(new AiProviderError("AI_SAFETY_BLOCK", "gemini"))).toBe(false);
    expect(bolehDikembalikan(new AiProviderError("AI_INVALID_OUTPUT", "gemini"))).toBe(false);
    expect(bolehDikembalikan(new AiProviderError("AI_RATE_LIMIT", "gemini"))).toBe(false);
    expect(bolehDikembalikan(new Error("bukan error provider"))).toBe(false);
    expect(bolehDikembalikan(new AiProviderError("AI_NETWORK_ERROR", "groq"))).toBe(true);
  });

  it("pengembalian dua kali tidak melahirkan jatah gratis", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis });
    const reservasi = await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });

    await quota.kembalikan(reservasi);
    await quota.kembalikan(reservasi);

    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(0);
  });

  it("pengembalian berlantai nol (kunci sudah kedaluwarsa lebih dulu)", async () => {
    // Redis KOSONG: meniru kunci yang sudah lenyap sebelum sempat dikembalikan.
    // Tanpa lantai nol, DECR akan menyisakan -1 — yaitu satu jatah gratis yang
    // menunggu pemakai berikutnya.
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis });

    await quota.kembalikan({ hari: HARI, userId: A, feature: "cv_chat", tercatat: true });

    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(0);
    expect(redis.nilai(kunciKuotaGlobal(HARI))).toBe(0);
    // Kunci yang lahir dari DECR tetap diberi TTL, bukan dibiarkan abadi.
    expect(redis.ttlTerpasang(kunciKuotaUser(HARI, A, "cv_chat"))).toBeGreaterThan(0);
  });

  it("reservasi 'tidak tercatat' tidak mengembalikan apa pun", async () => {
    const redis = redisKuotaPalsu();
    const { quota } = mesin({ redis, failOpen: true });
    redis.matikan();
    const reservasi = await quota.periksaDanPakai({ userId: A, feature: "cv_chat" });
    expect(reservasi.tercatat).toBe(false);

    redis.hidupkan();
    await quota.kembalikan(reservasi);
    expect(redis.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(0);
  });
});

describe("Redis tak terjangkau", () => {
  it("baku: GAGAL TERTUTUP — panggilan AI ditolak dengan Retry-After pendek", async () => {
    const redis = redisKuotaPalsu();
    redis.matikan();
    const { quota } = mesin({ redis });

    const err = await quota
      .periksaDanPakai({ userId: A, feature: "cv_chat" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(isKuotaHabis(err)).toBe(true);
    expect((err as AppError).status).toBe(429);
    expect((err as AppError).retryAfterSeconds).toBe(AI_QUOTA_RETRY_GAGAL_DETIK);
  });

  it("AI_QUOTA_FAIL_OPEN=true: dilewatkan, dan dicatat di log", async () => {
    const redis = redisKuotaPalsu();
    redis.matikan();
    const logger = { warn: vi.fn(), error: vi.fn() };
    const quota = createAiQuota({
      redis,
      config: konfigurasi(),
      logger,
      clock: () => SIANG,
      failOpen: true,
    });

    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).resolves.toMatchObject({
      tercatat: false,
      hari: HARI,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("ringkasan menjawab 503 BELUM_SIAP — bukan angka kuota yang tidak bisa diperiksa", async () => {
    const redis = redisKuotaPalsu();
    redis.matikan();
    const { quota } = mesin({ redis });

    const err = await quota
      .ringkasan(A)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(503);
    expect((err as AppError).code).toBe("BELUM_SIAP");
  });

  it("gagal saat menaikkan pagu global → jatah pribadi tidak tertinggal terpotong", async () => {
    // Redis yang hanya sanggup melayani perintah pertama.
    const dasar = redisKuotaPalsu();
    let sisaPerintah = 1; // hanya INCR pertama (penghitung pengguna) yang dilayani
    const redis = {
      ...dasar,
      incr: (key: string) => {
        if (sisaPerintah <= 0) return Promise.reject(new Error("mati di tengah jalan"));
        sisaPerintah -= 1;
        return dasar.incr(key);
      },
    };
    const quota = createAiQuota({
      redis,
      config: konfigurasi(),
      logger: loggerSenyap,
      clock: () => SIANG,
    });

    await expect(quota.periksaDanPakai({ userId: A, feature: "cv_chat" })).rejects.toSatisfy(
      isKuotaHabis,
    );
    // Kenaikan pertama dibatalkan lewat DECR (yang masih dilayani fake).
    expect(dasar.nilai(kunciKuotaUser(HARI, A, "cv_chat"))).toBe(0);
  });
});
