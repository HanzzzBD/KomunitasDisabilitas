// Konfigurasi kuota AI (PR-043, AC-5: "semua angka kuota dari config, bukan
// hardcode") + tuas darurat mematikan AI tanpa deploy.
import { describe, it, expect } from "vitest";
import { EnvError } from "../src/core/config/index.js";
import {
  AI_FEATURES,
  AI_QUOTA_BUFFER_RATIO,
  AI_QUOTA_DEFAULTS,
  AI_QUOTA_FREE_TIER_PER_DAY,
  AI_QUOTA_GLOBAL_ENV_VAR,
  aiQuotaEnvVar,
  aiQuotaEnvVars,
  loadAiQuotaConfig,
} from "../src/core/ai/quota-config.js";
import { bacaSchemaPrisma } from "./helpers/prisma-schema.js";

describe("daftar fitur berkuota", () => {
  it("penjaga ini tidak lulus secara hampa", () => {
    expect(AI_FEATURES.length).toBeGreaterThan(3);
    expect(AI_FEATURES).toContain("cv_chat");
  });

  it("sama persis dengan enum AiFeature di schema.prisma", () => {
    // Daftarnya ditulis ulang di core/ai (tidak boleh mengimpor @prisma/client
    // di jalur gerbang boot), jadi penjaga kesamaannya adalah test ini. Tanpa
    // ini, fitur baru bisa lahir di skema DB tanpa pernah punya jatah — dan
    // "tanpa jatah" dibaca mesin kuota sebagai NOL, yaitu fitur yang mati diam.
    const enumAi = /enum\s+AiFeature\s*\{([\s\S]*?)\}/.exec(bacaSchemaPrisma());
    expect(enumAi).not.toBeNull();
    const nilai = (enumAi?.[1] ?? "")
      .split("\n")
      .map((baris) => baris.trim())
      .filter((baris) => baris.length > 0 && !baris.startsWith("//"));
    expect([...AI_FEATURES].sort()).toEqual(nilai.sort());
  });

  it("setiap fitur punya jatah bawaan yang eksplisit", () => {
    for (const fitur of AI_FEATURES) {
      expect(AI_QUOTA_DEFAULTS.perUserPerDay[fitur], fitur).toBeTypeOf("number");
    }
  });
});

describe("default = angka SDD §7.1", () => {
  it("cv-chat 30, finalize 5, simplify-text 20, rerank 3", () => {
    expect(AI_QUOTA_DEFAULTS.perUserPerDay.cv_chat).toBe(30);
    expect(AI_QUOTA_DEFAULTS.perUserPerDay.cv_finalize).toBe(5);
    expect(AI_QUOTA_DEFAULTS.perUserPerDay.simplify_text).toBe(20);
    expect(AI_QUOTA_DEFAULTS.perUserPerDay.rerank).toBe(3);
  });

  it("pagu global = tier gratis dikurangi buffer 20% (AC-4)", () => {
    expect(AI_QUOTA_BUFFER_RATIO).toBe(0.2);
    expect(AI_QUOTA_DEFAULTS.globalPerDay).toBe(
      Math.floor(AI_QUOTA_FREE_TIER_PER_DAY * (1 - AI_QUOTA_BUFFER_RATIO)),
    );
    // Bukan sekadar rumus yang mencocoki dirinya sendiri: pagu harus benar-benar
    // di BAWAH tier gratis, itulah gunanya buffer.
    expect(AI_QUOTA_DEFAULTS.globalPerDay).toBeLessThan(AI_QUOTA_FREE_TIER_PER_DAY);
  });

  it("env kosong → default apa adanya", () => {
    expect(loadAiQuotaConfig({})).toEqual(AI_QUOTA_DEFAULTS);
  });
});

describe("override env", () => {
  it("nama variabelnya berpola AI_QUOTA_<FITUR>_PER_DAY", () => {
    expect(aiQuotaEnvVar("cv_chat")).toBe("AI_QUOTA_CV_CHAT_PER_DAY");
    expect(aiQuotaEnvVar("simplify_text")).toBe("AI_QUOTA_SIMPLIFY_TEXT_PER_DAY");
    expect(aiQuotaEnvVars()).toContain(AI_QUOTA_GLOBAL_ENV_VAR);
    expect(aiQuotaEnvVars()).toHaveLength(AI_FEATURES.length + 1);
  });

  it("satu fitur bisa ditimpa tanpa mengubah yang lain", () => {
    const config = loadAiQuotaConfig({ AI_QUOTA_CV_CHAT_PER_DAY: "1" });
    expect(config.perUserPerDay.cv_chat).toBe(1);
    expect(config.perUserPerDay.cv_finalize).toBe(AI_QUOTA_DEFAULTS.perUserPerDay.cv_finalize);
    expect(config.globalPerDay).toBe(AI_QUOTA_DEFAULTS.globalPerDay);
  });

  it("pagu global bisa ditimpa", () => {
    expect(loadAiQuotaConfig({ AI_QUOTA_GLOBAL_PER_DAY: "50" }).globalPerDay).toBe(50);
  });

  it("nilai 0 SAH — inilah tuas darurat mematikan AI tanpa deploy", () => {
    expect(loadAiQuotaConfig({ AI_QUOTA_GLOBAL_PER_DAY: "0" }).globalPerDay).toBe(0);
    expect(loadAiQuotaConfig({ AI_QUOTA_RERANK_PER_DAY: "0" }).perUserPerDay.rerank).toBe(0);
  });

  it("string kosong diperlakukan sebagai tidak di-set", () => {
    expect(loadAiQuotaConfig({ AI_QUOTA_CV_CHAT_PER_DAY: "   " }).perUserPerDay.cv_chat).toBe(30);
  });
});

describe("konfigurasi salah → boot GAGAL (EnvError), bukan diam-diam default", () => {
  it("bukan angka", () => {
    expect(() => loadAiQuotaConfig({ AI_QUOTA_CV_CHAT_PER_DAY: "banyak" })).toThrow(EnvError);
    try {
      loadAiQuotaConfig({ AI_QUOTA_CV_CHAT_PER_DAY: "banyak" });
    } catch (err) {
      expect((err as EnvError).message).toContain("AI_QUOTA_CV_CHAT_PER_DAY");
    }
  });

  it("negatif ditolak — 'jatah minus' bukan konfigurasi yang bisa dijalankan", () => {
    expect(() => loadAiQuotaConfig({ AI_QUOTA_GLOBAL_PER_DAY: "-1" })).toThrow(EnvError);
  });

  it("pecahan ditolak — penghitung naik satu-satu", () => {
    expect(() => loadAiQuotaConfig({ AI_QUOTA_EMBED_PER_DAY: "2.5" })).toThrow(EnvError);
  });

  it("semua variabel bermasalah dilaporkan sekaligus", () => {
    try {
      loadAiQuotaConfig({ AI_QUOTA_CV_CHAT_PER_DAY: "x", AI_QUOTA_GLOBAL_PER_DAY: "y" });
      expect.unreachable("seharusnya melempar");
    } catch (err) {
      expect((err as EnvError).issues.map(([nama]) => nama)).toEqual([
        "AI_QUOTA_CV_CHAT_PER_DAY",
        "AI_QUOTA_GLOBAL_PER_DAY",
      ]);
    }
  });
});
