// modules/matching — wiring modul (DI manual via factory, ADR-002).
//
// Lahir di PR-069 dengan DUA bagian yang hidup di proses berbeda:
//   - pemicu (proses API): berlangganan `profile.updated`, `job.published`,
//     `job.updated` lalu meng-enqueue `ai-embed` — `createMatchingModule`;
//   - service embedding (proses worker): dirakit langsung oleh
//     `apps/worker` dari ekspor di bawah, dengan pembaca profil/lowongan yang
//     disuntik composition root (antar-modul lewat service, ADR-001).
//   - query kandidat (PR-070): `createKandidatService`, dirakit bersama
//     endpoint feed di PR-073.
//   - re-rank + cache (PR-072): `createFeedCacheService` (proses API —
//     kebijakan cache/refresh, memotong jatah `rerank`, produser
//     `ai-rerank-feed`) dan `createRerankService` (proses worker — panggilan
//     LLM `rerank.v1`, menulis `rank`/`explanation`).
//   - feed (PR-073): `createMatchingFeedModule` — `GET /me/matches` +
//     `POST /me/matches/refresh`, merakit seluruh rantai di atas. Pembaca
//     profil/keahlian/lowongan disuntik composition root (antar-modul lewat
//     service, ADR-001).
import type { Router } from "express";
import type { AiQuota } from "../../core/ai/index.js";
import type { RouteRegistrar } from "../../core/auth/index.js";
import type { AppPrisma } from "../../core/db/index.js";
import type { EventBus } from "../../core/events/index.js";
import type { Logger } from "../../core/logger/index.js";
import type { QueueRegistry } from "../../core/queue/index.js";
import { createMatchesController } from "./controllers/matches.controller.js";
import { createKandidatRepository } from "./repositories/kandidat.repository.js";
import { createMatchScoresRepository } from "./repositories/match-scores.repository.js";
import { createMatchingRouter } from "./routers/index.js";
import {
  createFeedCacheService,
  createPenandaRerank,
  createRerankJobs,
  type PenandaRedisLike,
} from "./services/feed-cache.service.js";
import { createKandidatService } from "./services/kandidat.service.js";
import {
  createHitungFeed,
  createMatchesService,
  type LowonganUntukFeed,
  type MatchesService,
  type ProfilUntukFeed,
} from "./services/matches.service.js";
import { createPembacaAkomodasi, createPenilaianService } from "./services/penilaian.service.js";
import { daftarkanPemicuEmbedding } from "./services/pemicu-embedding.js";
import type { BobotSkor } from "./services/skor.js";

export interface MatchingModuleDeps {
  events: EventBus;
  /** Produser `ai-embed`; konsumennya proses apps/worker (ADR-004). */
  queues: Pick<QueueRegistry, "enqueue">;
}

export function createMatchingModule(deps: MatchingModuleDeps): void {
  daftarkanPemicuEmbedding(deps);
}

export interface MatchingFeedModuleDeps {
  prisma: AppPrisma;
  routes: RouteRegistrar;
  /** Produser `ai-rerank-feed`; konsumennya apps/worker. */
  queues: Pick<QueueRegistry, "enqueue">;
  /** Kuota AI yang SAMA dengan fitur AI lain (`redis.queue`). */
  quota: Pick<AiQuota, "periksaDanPakai" | "kembalikan" | "ringkasan">;
  /** `redis.cache` — penanda nasib re-rank per angkatan. */
  redis: PenandaRedisLike;
  logger: Pick<Logger, "error" | "warn">;
  /** Jalur ber-audit (tujuan `matching`) untuk hard filter akomodasi (PR-071). */
  sensitiveAccess: Parameters<typeof createPembacaAkomodasi>[0]["sensitiveAccess"];
  /** Profil jalur AMAN (modul profiles). */
  bacaProfil(userId: string): Promise<ProfilUntukFeed | null>;
  bacaKeahlian(userId: string): Promise<ReadonlyArray<{ name: string }>>;
  /** `jobsService.bacaUntukFeed`. */
  bacaLowongan(ids: readonly string[]): Promise<LowonganUntukFeed[]>;
  config: {
    efSearch: number;
    bobot: BobotSkor;
    paruhKebaruanHari: number;
    /** `MATCHING_RERANK_ENABLED`. */
    rerankAktif: boolean;
  };
}

export interface MatchingFeedModule {
  router: Router;
  service: MatchesService;
}

export function createMatchingFeedModule(deps: MatchingFeedModuleDeps): MatchingFeedModule {
  const kandidat = createKandidatService({
    repo: createKandidatRepository(deps.prisma),
    bacaProfil: deps.bacaProfil,
    efSearch: deps.config.efSearch,
  });
  const penilaian = createPenilaianService({
    akomodasi: createPembacaAkomodasi({ sensitiveAccess: deps.sensitiveAccess }),
    bobot: deps.config.bobot,
    paruhKebaruanHari: deps.config.paruhKebaruanHari,
  });
  const feed = createFeedCacheService({
    repo: createMatchScoresRepository(deps.prisma),
    quota: deps.quota,
    jobs: createRerankJobs(deps.queues),
    hitung: createHitungFeed({ kandidat, penilaian, bacaProfil: deps.bacaProfil }),
    aktif: deps.config.rerankAktif,
    penanda: createPenandaRerank({ redis: deps.redis, logger: deps.logger }),
    logger: deps.logger,
  });
  const service = createMatchesService({
    feed,
    bacaProfil: deps.bacaProfil,
    bacaKeahlian: deps.bacaKeahlian,
    bacaLowongan: deps.bacaLowongan,
  });
  return { router: createMatchingRouter(createMatchesController(service), deps.routes), service };
}

export {
  createEmbeddingsRepository,
  DIMENSI_KOLOM_VEKTOR,
  type EmbeddingsRepository,
} from "./repositories/embeddings.repository.js";
export {
  createEmbeddingService,
  type EmbeddingService,
  type EmbeddingServiceDeps,
  type HasilEmbedding,
  type SumberLowongan,
} from "./services/embedding.service.js";
export {
  BATAS_TEKS_EMBEDDING,
  teksLowongan,
  teksProfil,
  type LowonganUntukEmbedding,
  type ProfilUntukEmbedding,
} from "./services/teks-embedding.js";
export {
  JARAK_EMBED_ULANG_MS,
  PORSI_PAGU_EMBED_ULANG,
  createEmbedUlangService,
  maksEmbedUlangBawaan,
  type EmbedUlangDeps,
  type EmbedUlangService,
  type JenisEmbedUlang,
  type LaporanEmbedUlang,
  type OpsiEmbedUlang,
} from "./services/embed-ulang.service.js";
export {
  JEDA_EMBED_MS,
  antrekanEmbedding,
  daftarkanPemicuEmbedding,
  kunciEmbedding,
  type PemicuEmbeddingDeps,
} from "./services/pemicu-embedding.js";
export {
  JUMLAH_KANDIDAT,
  createKandidatRepository,
  kondisiKandidat,
  sqlKandidat,
  vektorProfil,
  type FilterKandidat,
  type KandidatLowongan,
  type KandidatRepository,
  type OpsiKandidat,
} from "./repositories/kandidat.repository.js";
export {
  createKandidatService,
  susunFilterKandidat,
  type KandidatService,
  type KandidatServiceDeps,
  type ProfilUntukFilter,
} from "./services/kandidat.service.js";
export {
  BOBOT_SKOR_SDD,
  KEBARUAN_TANPA_TANGGAL,
  NILAI_LOKASI,
  hitungSkor,
  komponenAkomodasi,
  komponenKebaruan,
  komponenKemiripan,
  komponenLokasi,
  memenuhiAkomodasi,
  nilaiKandidat,
  type BobotSkor,
  type KomponenSkor,
  type KonteksSkor,
  type LowonganUntukSkor,
  type ProfilUntukSkor,
  type SkorLowongan,
} from "./services/skor.js";
export {
  ALASAN_AKSES_MATCHING,
  bobotDariEnv,
  createPembacaAkomodasi,
  createPenilaianService,
  type PembacaAkomodasi,
  type PenilaianService,
  type PenilaianServiceDeps,
} from "./services/penilaian.service.js";
export {
  createMatchScoresRepository,
  type BarisFeed,
  type MatchScoresRepository,
  type PembaruanRerank,
  type RingkasanAngkatan,
  type SkorUntukCache,
} from "./repositories/match-scores.repository.js";
export {
  JUMLAH_RERANK,
  LABEL_AKOMODASI,
  MAKS_PENJELASAN,
  MAKS_TEKS_LOWONGAN,
  rapikanPenjelasan,
  susunMasukanRerank,
  uraiHasilRerank,
  type HasilRerank,
  type LowonganUntukRerank,
  type MasukanRerank,
  type ProfilUntukRerank,
} from "./services/rerank.js";
export {
  UMUR_CACHE_FEED_MS,
  createFeedCacheService,
  createPenandaRerank,
  createRerankJobs,
  kunciPenandaRerank,
  type PenandaRedisLike,
  type PenandaRerank,
  type FeedCacheService,
  type FeedCacheServiceDeps,
  type HasilSegarkan,
  type RerankJobs,
  type StatusRerank,
} from "./services/feed-cache.service.js";
export {
  createRerankService,
  type HasilJobRerank,
  type RerankService,
  type RerankServiceDeps,
} from "./services/rerank.service.js";
export {
  BATAS_TUNGGU_RERANK_MS,
  createHitungFeed,
  createMatchesService,
  type LowonganUntukFeed,
  type MatchesService,
  type MatchesServiceDeps,
  type MatchingActor,
  type ProfilUntukFeed,
} from "./services/matches.service.js";
export {
  PENJELASAN_UMUM,
  keahlianCocok,
  templatePenjelasan,
  type LowonganUntukTemplate,
  type ProfilUntukTemplate,
} from "./services/penjelasan-template.js";
export { menyebutKondisi } from "./services/rerank.js";
export {
  createMatchesController,
  type MatchesController,
} from "./controllers/matches.controller.js";
export { createMatchingRouter } from "./routers/index.js";
