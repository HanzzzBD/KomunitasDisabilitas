// Metrik admin (PR-080) — unit: jendela periode, cache 5 menit, fail-open
// Redis/DLQ, dan penjaga "query tidak menyentuh kolom terenkripsi".
// Angka funnel di database sungguhan: `admin-metrics-db.test.ts`.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMetricsService,
  jendelaAi,
  jendelaDari,
  jendelaSebelumnya,
  kunciCache,
  kueriAiUsage,
  kueriFunnel,
  kueriNorthStar,
  METRICS_POLICY,
} from "../src/modules/admin/index.js";
import type { MetricsRepository } from "../src/modules/admin/repositories/metrics.repository.js";

const SEKARANG = new Date("2026-10-02T00:00:00.000Z");
const HARI = 24 * 60 * 60 * 1000;

function repoPalsu(): MetricsRepository & { panggilan: number } {
  const repo = {
    panggilan: 0,
    funnel: vi.fn(async () => {
      repo.panggilan += 1;
      return { registered: 10, profileReady: 6, applied: 4, interviewed: 2, hired: 1 };
    }),
    northStar: vi.fn(async () => ({ confirmedInPeriod: 1, confirmedTotal: 3 })),
    aiUsage: vi.fn(async () => [
      { feature: "cv_chat" as const, requests: 5, tokensIn: 100, tokensOut: 200 },
    ]),
  };
  return repo;
}

function cachePalsu() {
  const isi = new Map<string, string>();
  return {
    isi,
    get: vi.fn(async (k: string) => isi.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, _m: "EX", _d: number) => {
      isi.set(k, v);
      return "OK";
    }),
  };
}

const logger = { warn: vi.fn() };

describe("jendela periode", () => {
  it("7d / 30d mundur dari sekarang; semua = tanpa batas bawah", () => {
    expect(jendelaDari("7d", SEKARANG)).toEqual({
      dari: new Date(SEKARANG.getTime() - 7 * HARI),
      sampai: SEKARANG,
    });
    expect(jendelaDari("30d", SEKARANG).dari).toEqual(new Date(SEKARANG.getTime() - 30 * HARI));
    expect(jendelaDari("semua", SEKARANG)).toEqual({ dari: null, sampai: SEKARANG });
  });

  it("jendela sebelumnya (tren PR-081): tepat sebelum, sama panjang; 'semua' tidak punya", () => {
    const j = jendelaDari("30d", SEKARANG);
    expect(jendelaSebelumnya(j)).toEqual({
      dari: new Date(SEKARANG.getTime() - 60 * HARI),
      sampai: j.dari,
    });
    expect(jendelaSebelumnya(jendelaDari("semua", SEKARANG))).toBeNull();
  });

  it("jendela AI dipotong ke retensi ai_usage (90 hari) — 'semua' tidak berpura-pura", () => {
    const batas = new Date(SEKARANG.getTime() - METRICS_POLICY.retensiAiHari * HARI);
    expect(jendelaAi(jendelaDari("semua", SEKARANG)).dari).toEqual(batas);
    expect(jendelaAi(jendelaDari("30d", SEKARANG)).dari).toEqual(
      new Date(SEKARANG.getTime() - 30 * HARI),
    );
  });
});

describe("metrics service", () => {
  it("hit kedua dalam 5 menit dilayani cache — query berat tidak diulang", async () => {
    const repo = repoPalsu();
    const cache = cachePalsu();
    const svc = createMetricsService({
      repo,
      cache,
      bacaDlqTotal: async () => 2,
      logger,
      clock: () => SEKARANG,
    });

    const pertama = await svc.get("30d");
    const kedua = await svc.get("30d");
    // Satu hitungan = funnel jendela ini + jendela sebelumnya (tren, PR-081).
    expect(repo.panggilan).toBe(2);
    expect(kedua).toEqual(pertama);
    expect(cache.set).toHaveBeenCalledWith(
      kunciCache("30d"),
      expect.any(String),
      "EX",
      METRICS_POLICY.cacheDetik,
    );
    expect(METRICS_POLICY.cacheDetik).toBe(300);

    // Periode lain = kunci lain = hitung sendiri.
    await svc.get("7d");
    expect(repo.panggilan).toBe(4);
  });

  it("bentuk respons: North Star, AI per fitur, DLQ, jendela", async () => {
    const svc = createMetricsService({
      repo: repoPalsu(),
      cache: cachePalsu(),
      bacaDlqTotal: async () => 4,
      logger,
      clock: () => SEKARANG,
    });
    const m = await svc.get("7d");
    expect(m).toMatchObject({
      period: "7d",
      to: SEKARANG.toISOString(),
      generatedAt: SEKARANG.toISOString(),
      funnel: { registered: 10, hired: 1 },
      northStar: { confirmedInPeriod: 1, confirmedTotal: 3 },
      aiUsage: { features: [{ feature: "cv_chat", requests: 5 }] },
      dlqTotal: 4,
      previous: { funnel: { registered: 10 }, confirmedInPeriod: 1 },
    });
    expect((await svc.get("semua")).previous).toBeNull();
  });

  it("Redis sakit → tetap menjawab (dihitung langsung), peringatan dicatat", async () => {
    const repo = repoPalsu();
    const svc = createMetricsService({
      repo,
      cache: {
        get: () => Promise.reject(new Error("redis mati")),
        set: () => Promise.reject(new Error("redis mati")),
      },
      bacaDlqTotal: async () => 0,
      logger,
      clock: () => SEKARANG,
    });
    expect((await svc.get("30d")).funnel.registered).toBe(10);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("antrean tak terjangkau → dlqTotal null, bukan galat", async () => {
    const svc = createMetricsService({
      repo: repoPalsu(),
      cache: cachePalsu(),
      bacaDlqTotal: () => Promise.reject(new Error("antrean mati")),
      logger,
      clock: () => SEKARANG,
    });
    expect((await svc.get("30d")).dlqTotal).toBeNull();
  });

  it("isi cache yang rusak diabaikan, bukan dikembalikan", async () => {
    const repo = repoPalsu();
    const cache = cachePalsu();
    cache.isi.set(kunciCache("30d"), JSON.stringify({ bukan: "metrik" }));
    const svc = createMetricsService({
      repo,
      cache,
      bacaDlqTotal: async () => 0,
      logger,
      clock: () => SEKARANG,
    });
    expect((await svc.get("30d")).funnel.registered).toBe(10);
    expect(repo.panggilan).toBe(2);
  });
});

describe("query metrik tidak menyentuh kolom terenkripsi (AC PR-080)", () => {
  // Daftar kolom dibaca dari SUMBER KEBENARANNYA, bukan ditulis ulang di sini:
  // kolom terenkripsi baru (`Bytes` / berkomentar CIPHERTEXT) otomatis ikut dijaga.
  const SKEMA = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "schema.prisma"),
    "utf8",
  );

  function kolomTerenkripsi(): string[] {
    const baris = SKEMA.split("\n");
    const hasil = new Set<string>();
    let tandai = false;
    for (const b of baris) {
      const t = b.trim();
      if (t.startsWith("///")) {
        if (t.includes("CIPHERTEXT")) tandai = true;
        continue;
      }
      const map = /@map\("([a-z_]+)"\)/.exec(t)?.[1];
      const bytes = /^\w+\s+Bytes\??(\s|$)/.test(t);
      if ((tandai || bytes) && map !== undefined) hasil.add(map);
      if (t !== "") tandai = false;
    }
    return [...hasil];
  }

  it("penjaga menemukan kolom terenkripsi yang diketahui (tidak lulus hampa)", () => {
    expect(kolomTerenkripsi()).toEqual(
      expect.arrayContaining(["disability_types", "accommodation_needs", "disclosure_snapshot"]),
    );
  });

  it.each([
    ["funnel", kueriFunnel],
    ["northStar", kueriNorthStar],
    ["aiUsage", kueriAiUsage],
  ])("%s", (_nama, kueri) => {
    const sql = kueri({ dari: null, sampai: SEKARANG }).sql;
    for (const kolom of kolomTerenkripsi()) expect(sql).not.toContain(kolom);
    // Agregat, bukan baris: tidak ada identitas pengguna yang di-SELECT keluar.
    for (const pii of ['"phone"', '"email"', '"full_name"']) expect(sql).not.toContain(pii);
  });
});
