// modules/admin — metrik pilot (PR-080, KPI PRD §15).
//
// CACHE 5 MENIT PER PERIODE, di Redis CACHE (allkeys-lru): metrik yang terusir
// hanya berarti satu kali hitung ulang. Redis yang sakit TIDAK menggagalkan
// permintaan — metrik dihitung langsung dan peringatannya dicatat (fail-open,
// pola `apply.service.ts`). Yang di-cache adalah respons utuh, termasuk
// `generatedAt`, supaya layar bisa jujur menyebut umur angkanya.
//
// DLQ BOLEH TIDAK TERJANGKAU: `dlqTotal: null`, bukan 500. Antrean yang sakit
// justru saat admin paling perlu melihat angka funnel.
import type { AdminMetrics, AdminMetricsPeriod } from "@nawasena/schemas";
import { adminMetricsSchema } from "@nawasena/schemas";
import type { Logger } from "../../../core/logger/index.js";
import type { JendelaMetrik, MetricsRepository } from "../repositories/metrics.repository.js";

export const METRICS_POLICY = {
  /** AC PR-080: "Cache 5 menit". */
  cacheDetik: 5 * 60,
  /** Retensi baris mentah `ai_usage` (SDD §6.4) — batas jendela AI untuk `semua`. */
  retensiAiHari: 90,
} as const;

const HARI_MS = 24 * 60 * 60 * 1000;
const PANJANG_PERIODE_HARI: Readonly<Record<Exclude<AdminMetricsPeriod, "semua">, number>> = {
  "7d": 7,
  "30d": 30,
};

/** Irisan ioredis yang dipakai — fake in-memory memenuhinya di test. */
export interface MetricsCacheLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", detik: number): Promise<unknown>;
}

export interface MetricsServiceDeps {
  repo: MetricsRepository;
  cache: MetricsCacheLike;
  /** Total DLQ seluruh antrean (`internal` QueuesService). */
  bacaDlqTotal(): Promise<number>;
  logger: Pick<Logger, "warn">;
  clock?: () => Date;
}

export function jendelaDari(periode: AdminMetricsPeriod, sekarang: Date): JendelaMetrik {
  if (periode === "semua") return { dari: null, sampai: sekarang };
  return {
    dari: new Date(sekarang.getTime() - PANJANG_PERIODE_HARI[periode] * HARI_MS),
    sampai: sekarang,
  };
}

/** Jendela tepat sebelum `j`, sama panjang — `null` untuk `semua`. */
export function jendelaSebelumnya(j: JendelaMetrik): (JendelaMetrik & { dari: Date }) | null {
  if (j.dari === null) return null;
  const panjang = j.sampai.getTime() - j.dari.getTime();
  return { dari: new Date(j.dari.getTime() - panjang), sampai: j.dari };
}

/** Jendela AI: sama dengan periode, tetapi tidak pernah lebih tua dari retensi. */
export function jendelaAi(j: JendelaMetrik): JendelaMetrik & { dari: Date } {
  const batasRetensi = new Date(j.sampai.getTime() - METRICS_POLICY.retensiAiHari * HARI_MS);
  const dari = j.dari === null || j.dari < batasRetensi ? batasRetensi : j.dari;
  return { dari, sampai: j.sampai };
}

// v2 (PR-081): bentuk respons bertambah `previous` — isi v1 lama tidak dibaca ulang.
export const kunciCache = (periode: AdminMetricsPeriod) => `admin:metrics:v2:${periode}`;

export function createMetricsService(deps: MetricsServiceDeps) {
  const now = deps.clock ?? (() => new Date());

  async function hitung(periode: AdminMetricsPeriod): Promise<AdminMetrics> {
    const sekarang = now();
    const j = jendelaDari(periode, sekarang);
    const ai = jendelaAi(j);
    const lalu = jendelaSebelumnya(j);
    const [funnel, northStar, funnelLalu, northStarLalu, fitur, dlqTotal] = await Promise.all([
      deps.repo.funnel(j),
      deps.repo.northStar(j),
      lalu === null ? null : deps.repo.funnel(lalu),
      lalu === null ? null : deps.repo.northStar(lalu),
      deps.repo.aiUsage(ai),
      deps.bacaDlqTotal().catch((err: unknown) => {
        deps.logger.warn({ err }, "DLQ tidak terjangkau — metrik admin tanpa dlqTotal");
        return null;
      }),
    ]);
    // Di-parse: bentuk yang di-cache adalah kontrak, bukan apa pun yang
    // kebetulan dikembalikan driver.
    return adminMetricsSchema.parse({
      period: periode,
      from: j.dari?.toISOString() ?? null,
      to: j.sampai.toISOString(),
      generatedAt: sekarang.toISOString(),
      funnel,
      northStar,
      previous:
        lalu === null || funnelLalu === null || northStarLalu === null
          ? null
          : {
              from: lalu.dari.toISOString(),
              to: lalu.sampai.toISOString(),
              funnel: funnelLalu,
              confirmedInPeriod: northStarLalu.confirmedInPeriod,
            },
      aiUsage: { since: ai.dari.toISOString(), features: fitur },
      dlqTotal,
    });
  }

  return {
    /** GET /admin/metrics — dari cache bila ada, selain itu dihitung lalu disimpan. */
    async get(periode: AdminMetricsPeriod): Promise<AdminMetrics> {
      const kunci = kunciCache(periode);
      try {
        const tersimpan = await deps.cache.get(kunci);
        if (tersimpan !== null) {
          const hasil = adminMetricsSchema.safeParse(JSON.parse(tersimpan));
          if (hasil.success) return hasil.data;
        }
      } catch (err) {
        deps.logger.warn({ err }, "Cache metrik admin tidak terbaca — dihitung langsung");
      }

      const metrik = await hitung(periode);
      try {
        await deps.cache.set(kunci, JSON.stringify(metrik), "EX", METRICS_POLICY.cacheDetik);
      } catch (err) {
        deps.logger.warn({ err }, "Cache metrik admin tidak tersimpan");
      }
      return metrik;
    },
  };
}

export type MetricsService = ReturnType<typeof createMetricsService>;
