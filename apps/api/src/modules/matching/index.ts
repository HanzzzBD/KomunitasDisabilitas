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
// Belum ada route: feed `GET /me/matches` lahir di PR-073.
import type { EventBus } from "../../core/events/index.js";
import type { QueueRegistry } from "../../core/queue/index.js";
import { daftarkanPemicuEmbedding } from "./services/pemicu-embedding.js";

export interface MatchingModuleDeps {
  events: EventBus;
  /** Produser `ai-embed`; konsumennya proses apps/worker (ADR-004). */
  queues: Pick<QueueRegistry, "enqueue">;
}

export function createMatchingModule(deps: MatchingModuleDeps): void {
  daftarkanPemicuEmbedding(deps);
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
