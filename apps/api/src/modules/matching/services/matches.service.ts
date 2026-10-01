// modules/matching — feed `GET /me/matches` + `POST /me/matches/refresh` (PR-073, SDD §7.2, §12.2).
//
// ORKESTRASI: kandidat (PR-070) → hard filter akomodasi + skor (PR-071) →
// cache + re-rank asinkron (PR-072) → di sini: kartu lowongan aktif +
// penjelasan (LLM bila ada, template bila tidak) + meta.
//
// SATU KONTRAK UNTUK KEDUA MODE (AC). Mode normal dan turun menghasilkan item
// dan meta dengan kunci yang sama persis; yang berbeda hanya NILAI
// `explanationSource`, `degraded`, dan `aiMenyusun`.
//
// `degraded` vs `aiMenyusun` (keputusan owner 2026-09-30):
//   - angkatan sudah punya `rank`            → normal (keduanya false);
//   - re-rank dijadwalkan & belum lewat batas → `aiMenyusun: true`;
//   - selain itu (kuota habis, flag mati, antrean/LLM gagal, penanda hilang)
//                                            → `degraded: true`.
//
// URUTAN STABIL ANTARHALAMAN. Cursor mengikat angkatan (`computedAt`) DAN
// basis urutannya (`rank` atau `skor`) yang dipakai halaman 1. Re-rank yang
// selesai di antara halaman 1 dan 2 karena itu tidak mengacak urutan: halaman
// 2 tetap diurutkan menurut basis halaman 1. Angkatan yang sudah diganti →
// cursor ditolak (400, "muat ulang dari awal").
//
// DATA SENSITIF: tidak ada yang keluar. Hard filter akomodasi terjadi di
// `penilaianService` (jalur ber-audit); penjelasan hanya dibangun dari profil
// jalur aman dan data lowongan publik.
import type {
  JobSearchResult,
  MatchItem,
  MatchesEmptyReason,
  MatchesQuery,
  MatchesResponse,
} from "@nawasena/schemas";
import {
  decodeKursor,
  encodeKursor,
  KursorTidakValidError,
} from "../../../core/pagination/index.js";
import type { ProfilesActor } from "../../profiles/services/profiles.service.js";
import type { BarisFeed } from "../repositories/match-scores.repository.js";
import type { FeedCacheService, HasilSegarkan } from "./feed-cache.service.js";
import type { KandidatService } from "./kandidat.service.js";
import type { PenilaianService } from "./penilaian.service.js";
import {
  templatePenjelasan,
  type LowonganUntukTemplate,
  type ProfilUntukTemplate,
} from "./penjelasan-template.js";
import type { ProfilUntukSkor, SkorLowongan } from "./skor.js";

/**
 * Batas tunggu re-rank sebelum angkatan tanpa `rank` dianggap turun. Queue
 * `ai-rerank-feed`: 2 percobaan × 30 dtk tanpa backoff — dua menit memberi
 * ruang antrean mengantre di atasnya.
 */
export const BATAS_TUNGGU_RERANK_MS = 2 * 60 * 1000;

type BasisUrutan = "rank" | "skor";

/** Pemanggil feed — alias supaya controller tidak mengimpor service modul lain (boundaries). */
export type MatchingActor = ProfilesActor;

/** Profil jalur aman yang dibutuhkan feed (skor lokasi + template). */
export type ProfilUntukFeed = ProfilUntukSkor;

/** Kartu lowongan aktif + teks pencocokan keahlian (`jobsService.bacaUntukFeed`). */
export interface LowonganUntukFeed extends LowonganUntukTemplate {
  kartu: JobSearchResult;
}

/**
 * Kandidat → hard filter + skor — `FeedCacheService.hitung`. Pabrik sendiri
 * supaya composition root bisa merakit feed-cache SEBELUM service feed
 * (keduanya saling membutuhkan bila digabung).
 */
export function createHitungFeed(deps: {
  kandidat: Pick<KandidatService, "cari">;
  penilaian: Pick<PenilaianService, "nilai">;
  bacaProfil(userId: string): Promise<ProfilUntukFeed | null>;
}): (actor: ProfilesActor) => Promise<SkorLowongan[] | null> {
  return async (actor) => {
    const kandidat = await deps.kandidat.cari(actor.userId);
    if (kandidat === null) return null;
    const profil = await deps.bacaProfil(actor.userId);
    return deps.penilaian.nilai(
      actor,
      {
        city: profil?.city ?? null,
        province: profil?.province ?? null,
        openToRemote: profil?.openToRemote ?? false,
      },
      kandidat,
    );
  };
}

export interface MatchesServiceDeps {
  feed: FeedCacheService;
  /** Jalur AMAN modul profiles (tanpa kolom sensitif). `null` = belum ada profil. */
  bacaProfil(userId: string): Promise<ProfilUntukFeed | null>;
  /** Nama keahlian pengguna (modul profiles) — hanya untuk template. */
  bacaKeahlian(userId: string): Promise<ReadonlyArray<{ name: string }>>;
  /** Kartu lowongan AKTIF di antara `ids` (modul jobs); urutan tak dijamin. */
  bacaLowongan(ids: readonly string[]): Promise<LowonganUntukFeed[]>;
  clock?: () => Date;
}

function encodeCursor(computedAt: Date, basis: BasisUrutan, offset: number): string {
  return encodeKursor({ sortAt: computedAt, id: `${basis}:${String(offset)}` });
}

function decodeCursor(cursor: string): { computedAt: Date; basis: BasisUrutan; offset: number } {
  const { sortAt, id } = decodeKursor(cursor);
  const [basis, angka] = id.split(":");
  const offset = Number(angka);
  if ((basis !== "rank" && basis !== "skor") || !Number.isInteger(offset) || offset < 0) {
    throw new KursorTidakValidError();
  }
  return { computedAt: sortAt, basis, offset };
}

function urutkan(feed: readonly BarisFeed[], basis: BasisUrutan): BarisFeed[] {
  const menurutSkor = (a: BarisFeed, b: BarisFeed) =>
    b.score - a.score || (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0);
  return [...feed].sort(
    basis === "skor"
      ? menurutSkor
      : (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || menurutSkor(a, b),
  );
}

export function createMatchesService(deps: MatchesServiceDeps) {
  const now = deps.clock ?? (() => new Date());

  function statusAi(
    hasil: HasilSegarkan,
    feed: readonly BarisFeed[],
  ): { degraded: boolean; aiMenyusun: boolean } {
    if (feed.length === 0) return { degraded: false, aiMenyusun: false };
    if (feed.some((b) => b.rank !== null)) return { degraded: false, aiMenyusun: false };
    const status = hasil.rerank === "tidak-perlu" ? hasil.rerankAngkatan : hasil.rerank;
    const umur =
      hasil.computedAt === null ? Infinity : now().getTime() - hasil.computedAt.getTime();
    if (status === "dijadwalkan" && umur < BATAS_TUNGGU_RERANK_MS) {
      return { degraded: false, aiMenyusun: true };
    }
    return { degraded: true, aiMenyusun: false };
  }

  function alasanKosong(hasil: HasilSegarkan): MatchesEmptyReason {
    return hasil.rerank === "profil-belum-siap" ? "profil-belum-siap" : "tanpa-kecocokan";
  }

  async function susun(
    actor: ProfilesActor,
    hasil: HasilSegarkan,
    posisi: { basis: BasisUrutan; offset: number } | null,
    limit: number,
  ): Promise<MatchesResponse> {
    const basis: BasisUrutan =
      posisi?.basis ?? (hasil.feed.some((b) => b.rank !== null) ? "rank" : "skor");
    const offset = posisi?.offset ?? 0;

    // Lowongan yang ditutup sesudah angkatan dihitung disaring DI SINI (risiko
    // PR-072) — cache tidak menunggu invalidasi untuk berhenti menyajikannya.
    const lowongan = await deps.bacaLowongan(hasil.feed.map((b) => b.jobId));
    const peta = new Map(lowongan.map((l) => [l.kartu.id, l]));
    const aktif = urutkan(hasil.feed, basis).filter((b) => peta.has(b.jobId));
    const halaman = aktif.slice(offset, offset + limit);

    const butuhTemplate = halaman.some((b) => b.rank === null || b.explanation === null);
    let profilTemplate: ProfilUntukTemplate | null = null;
    if (butuhTemplate) {
      const [profil, keahlian] = await Promise.all([
        deps.bacaProfil(actor.userId),
        deps.bacaKeahlian(actor.userId),
      ]);
      profilTemplate = {
        city: profil?.city ?? null,
        province: profil?.province ?? null,
        keahlian,
      };
    }

    const data: MatchItem[] = halaman.flatMap((b) => {
      const l = peta.get(b.jobId);
      if (l === undefined) return [];
      const dariAi = b.rank !== null && b.explanation !== null;
      return [
        {
          job: l.kartu,
          score: b.score,
          explanation:
            dariAi && b.explanation !== null
              ? b.explanation
              : templatePenjelasan(
                  profilTemplate ?? { city: null, province: null, keahlian: [] },
                  l,
                ),
          explanationSource: dariAi ? ("ai" as const) : ("template" as const),
        },
      ];
    });

    const berikut = offset + limit;
    return {
      data,
      meta: {
        nextCursor:
          hasil.computedAt !== null && berikut < aktif.length
            ? encodeCursor(hasil.computedAt, basis, berikut)
            : null,
        ...statusAi(hasil, aktif),
        sisaRefresh: hasil.sisaRefresh,
        diperbaruiPada: hasil.computedAt?.toISOString() ?? null,
        alasanKosong: aktif.length === 0 ? alasanKosong(hasil) : null,
      },
    };
  }

  return {
    /** GET /me/matches. Tanpa cursor = halaman 1 (boleh menghitung ulang cache basi). */
    async lihat(actor: ProfilesActor, query: MatchesQuery): Promise<MatchesResponse> {
      if (query.cursor === undefined) {
        return susun(actor, await deps.feed.segarkan(actor, { paksa: false }), null, query.limit);
      }
      // Melempar `KursorTidakValidError` — controller memetakannya ke 400.
      const posisi = decodeCursor(query.cursor);
      const hasil = await deps.feed.baca(actor.userId);
      if (hasil.computedAt?.getTime() !== posisi.computedAt.getTime()) {
        throw new KursorTidakValidError();
      }
      return susun(actor, hasil, posisi, query.limit);
    },

    /** POST /me/matches/refresh — memakai satu jatah bila tersisa (PR-072). */
    async segarkan(actor: ProfilesActor, limit: number): Promise<MatchesResponse> {
      return susun(actor, await deps.feed.segarkan(actor, { paksa: true }), null, limit);
    },
  };
}

export type MatchesService = ReturnType<typeof createMatchesService>;
