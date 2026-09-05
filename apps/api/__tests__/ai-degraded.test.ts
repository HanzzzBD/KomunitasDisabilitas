// Kontrak degradasi lintas fitur (PR-046).
//
// AC yang dijaga berkas ini:
// - AC-1 `withDegradation` mengembalikan fallback saat `DegradedError`;
// - AC-2 kegagalan NON-degradasi tidak pernah tertelan — dilempar apa adanya.
//
// Yang TIDAK dibuktikan di sini, dan sengaja: bahwa jalur fallback aman secara
// akses. Itu bukan sifat yang bisa diuji dari helper ini, melainkan akibat dari
// helper ini tidak menyentuh apa pun — tidak ada `req`, `res`, middleware, atau
// guard di seluruh `degraded.ts`. Test terakhir di berkas ini menjaga persis
// fakta itu dengan membaca berkasnya, sebab yang bisa hilang di kemudian hari
// adalah kemurniannya, bukan hasil satu panggilan.
//
// Murni: tanpa Docker, tanpa Redis, tanpa jaringan.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, appError } from "../src/core/http/errors.js";
import {
  AiProviderError,
  createAiQuota,
  DegradedError,
  isDegradedError,
  withDegradation,
  type AiErrorCode,
  type AiQuotaFeature,
} from "../src/core/ai/index.js";
import { redisKuotaPalsu } from "./helpers/redis-kuota.js";

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PENGGUNA = "018f4c1e-0000-7000-8000-00000000dddd";
/** 05:00Z = 12:00 WIB — jauh dari batas hari, jadi tidak ada pergantian jatah. */
const SIANG = new Date("2026-08-31T05:00:00.000Z");
const JATAH_UJI: Record<AiQuotaFeature, number> = {
  cv_chat: 3,
  cv_finalize: 2,
  cv_check: 2,
  simplify_text: 2,
  interview_sim: 2,
  rerank: 1,
  embed: 5,
};

/** Ketujuh kode provider — tidak satu pun boleh dianggap degradasi di sini. */
const KODE_PROVIDER: readonly AiErrorCode[] = [
  "AI_RATE_LIMIT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_SAFETY_BLOCK",
  "AI_TIMEOUT",
  "AI_NETWORK_ERROR",
  "AI_INVALID_OUTPUT",
  "AI_NOT_CONFIGURED",
];

describe("DegradedError", () => {
  it("tetap AppError: envelope Bahasa Indonesia + status + Retry-After utuh", () => {
    const err = new DegradedError("KUOTA_AI_HABIS", { retryAfterSeconds: 42 });

    // Turunan AppError → `errorHandler` global tetap memetakannya ke 429
    // beserta envelope-nya, bukan ke 500 "Terjadi kesalahan".
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DegradedError");
    expect(err.code).toBe("KUOTA_AI_HABIS");
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(42);
    expect(err.envelope).toEqual({
      code: "KUOTA_AI_HABIS",
      message: "Jatah bantuan AI Anda hari ini sudah habis",
      hint: "Coba lagi besok, atau lanjutkan tanpa bantuan AI",
    });
  });

  it("pesannya tidak menyebut nama provider mana pun", () => {
    const teks = `${new DegradedError("KUOTA_AI_HABIS").message} ${
      new DegradedError("KUOTA_AI_HABIS").hint ?? ""
    }`.toLowerCase();
    for (const nama of ["gemini", "groq", "google", "openai"]) {
      expect(teks).not.toContain(nama);
    }
  });
});

describe("isDegradedError", () => {
  it("mengenali penanda `degraded`, bukan kelasnya", () => {
    expect(isDegradedError(new DegradedError("KUOTA_AI_HABIS"))).toBe(true);
    // Salinan modul kedua (bundler/symlink/mock) menghasilkan objek seperti ini:
    // kelasnya beda, penandanya sama. Predikatnya harus tetap benar.
    expect(isDegradedError({ code: "KUOTA_AI_HABIS", degraded: true })).toBe(true);
  });

  it("menolak kegagalan lain — termasuk nilai yang bukan Error sama sekali", () => {
    expect(isDegradedError(appError("TIDAK_BERHAK"))).toBe(false);
    expect(isDegradedError(new AiProviderError("AI_TIMEOUT", "uji"))).toBe(false);
    expect(isDegradedError(new Error("apa saja"))).toBe(false);
    expect(isDegradedError("kuota habis")).toBe(false);
    expect(isDegradedError(null)).toBe(false);
    expect(isDegradedError(undefined)).toBe(false);
    expect(isDegradedError({ degraded: "true" })).toBe(false);
  });
});

describe("withDegradation — AC-1: fallback saat DegradedError", () => {
  it("mengembalikan hasil asli bila tidak ada kegagalan (fallback tak tersentuh)", async () => {
    const fallback = vi.fn(() => "cadangan");
    const hasil = await withDegradation(async () => "asli", fallback);

    expect(hasil).toBe("asli");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("mengembalikan fallback berbentuk NILAI saat DegradedError", async () => {
    const hasil = await withDegradation(async () => {
      throw new DegradedError("KUOTA_AI_HABIS", { retryAfterSeconds: 60 });
    }, "formulir manual");

    expect(hasil).toBe("formulir manual");
  });

  it("mengembalikan fallback berbentuk FUNGSI, dan baru memanggilnya saat gagal", async () => {
    const fallback = vi.fn(async () => ["lowongan tanpa peringkat"]);
    const hasil = await withDegradation(async () => {
      throw new DegradedError("KUOTA_AI_HABIS");
    }, fallback);

    expect(hasil).toEqual(["lowongan tanpa peringkat"]);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("menangkap penolakan kuota SUNGGUHAN dari core/ai/quota.ts", async () => {
    // Ikatan nyata PR-046 ke PR-043: `tolak()` di quota.ts melempar kelas ini.
    // Bila kelak seseorang mengembalikannya menjadi `appError(...)` biasa,
    // janji "setiap fitur AI punya jalur non-AI" putus tanpa suara — dan test
    // kuota yang hanya membaca `.code` tidak akan menyadarinya.
    const quota = createAiQuota({
      redis: redisKuotaPalsu(),
      config: { perUserPerDay: { ...JATAH_UJI, cv_chat: 1 }, globalPerDay: 100 },
      logger: { warn: vi.fn(), error: vi.fn() },
      clock: () => SIANG,
    });
    const pakai = { userId: PENGGUNA, feature: "cv_chat" } as const;
    await quota.periksaDanPakai(pakai); // jatah 1 terpakai

    const hasil = await withDegradation(async () => {
      await quota.periksaDanPakai(pakai); // ke-2 → ditolak
      return "jawaban AI";
    }, "formulir manual");

    expect(hasil).toBe("formulir manual");
  });
});

describe("withDegradation — AC-2: kegagalan lain tidak tertelan", () => {
  it.each(KODE_PROVIDER)("melempar ulang AiProviderError %s apa adanya", async (kode) => {
    const asli = new AiProviderError(kode, "uji");
    const fallback = vi.fn(() => "cadangan");

    const err = await withDegradation<string>(async () => {
      throw asli;
    }, fallback).catch((e: unknown) => e);

    expect(err).toBe(asli); // objek yang SAMA — tidak dibungkus ulang
    expect(fallback).not.toHaveBeenCalled();
  });

  it("melempar ulang AppError non-degradasi — fallback TIDAK boleh memberi akses", async () => {
    // Inti syarat keamanan PR-046: menurunkan 403 menjadi jawaban cadangan
    // berarti menjawab permintaan yang sudah ditolak.
    const asli = appError("TIDAK_BERHAK");
    const err = await withDegradation<string>(async () => {
      throw asli;
    }, "data rahasia").catch((e: unknown) => e);

    expect(err).toBe(asli);
    expect((err as AppError).status).toBe(403);
  });

  it("melempar ulang Error biasa dan nilai non-Error", async () => {
    const biasa = new Error("bug di kode kita");
    await expect(
      withDegradation<string>(async () => {
        throw biasa;
      }, "cadangan"),
    ).rejects.toBe(biasa);

    await expect(
      withDegradation<string>(async () => {
        throw "string telanjang";
      }, "cadangan"),
    ).rejects.toBe("string telanjang");
  });

  it("kegagalan fallback SENDIRI naik apa adanya — tidak ada cadangan dari cadangan", async () => {
    const gagalCadangan = new Error("DB juga sedang mati");
    await expect(
      withDegradation<string>(
        async () => {
          throw new DegradedError("KUOTA_AI_HABIS");
        },
        () => {
          throw gagalCadangan;
        },
      ),
    ).rejects.toBe(gagalCadangan);
  });
});

describe("degraded.ts tetap murni (syarat keamanan PR-046)", () => {
  it("tidak menyentuh express, middleware, guard, logger, Prisma, maupun Redis", () => {
    const isi = readFileSync(resolve(apiDir, "src/core/ai/degraded.ts"), "utf8");
    const impor = [...isi.matchAll(/^import .*?from "(.+?)";$/gm)].map((m) => m[1]);

    // Satu-satunya impornya adalah katalog error — sumber envelope Bahasa
    // Indonesia. Apa pun selain itu berarti helper ini mulai punya kuasa atas
    // permintaan, dan degradasi bisa mulai menggeser kontrol akses.
    expect(impor).toEqual(["../http/index.js"]);
  });
});
