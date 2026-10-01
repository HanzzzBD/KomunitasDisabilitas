// modules/matching — kandidat lowongan untuk satu pengguna (PR-070, SDD §7.2 langkah 1–2).
//
// Service ini hanya menerjemahkan PROFIL → parameter filter lalu menyerahkannya
// ke repository. Skor, akomodasi wajib (in-memory atas data terdekripsi), dan
// re-rank adalah PR-071/072; endpoint `GET /me/matches` PR-073.
//
// SEMANTIK FILTER (keputusan owner 2026-09-30, SDD §7.2 dibaca harfiah):
//   lolos = work_mode 'remote'  ATAU  provinsi lowongan = provinsi pengguna
//           ATAU  lowongan tanpa provinsi;
//   pengguna tanpa provinsi → tanpa filter lokasi.
// `openToRemote` SENGAJA TIDAK menyaring: nilainya bawaan `false` dan mayoritas
// pengguna tidak pernah menyentuhnya, sehingga menyaring dengannya akan
// menyembunyikan lowongan remote — justru yang paling aksesibel bagi banyak
// penyandang disabilitas — dari orang yang tidak pernah memintanya. Ia menjadi
// komponen `location_fit` di PR-071. Profil memang belum punya preferensi mode
// kerja eksplisit ("remote-only"); bila kelak lahir, cukup `susunFilterKandidat`
// yang berubah — SQL-nya sudah menerima daftar mode kerja.
import { workModeSchema } from "@nawasena/schemas";
import {
  JUMLAH_KANDIDAT,
  type FilterKandidat,
  type KandidatLowongan,
  type KandidatRepository,
} from "../repositories/kandidat.repository.js";

/** Bagian profil yang menentukan filter — bukan data sensitif. */
export interface ProfilUntukFilter {
  province: string | null;
}

/** Profil → parameter hard filter. Murni; diuji tanpa DB. */
export function susunFilterKandidat(profil: ProfilUntukFilter | null): FilterKandidat {
  const provinsi = profil?.province?.trim() ?? "";
  return {
    modeDiizinkan: workModeSchema.options,
    modeBebasLokasi: ["remote"],
    provinsi: provinsi === "" ? null : provinsi,
  };
}

export interface KandidatServiceDeps {
  repo: KandidatRepository;
  /** Port pembaca profil (jalur aman, modul profiles) — dirakit composition root. */
  bacaProfil(userId: string): Promise<ProfilUntukFilter | null>;
  /** `MATCHING_HNSW_EF_SEARCH` (env, ≥ 50). */
  efSearch: number;
}

export function createKandidatService(deps: KandidatServiceDeps) {
  return {
    /**
     * Top-50 lowongan aktif terdekat yang lolos hard filter lokasi/mode kerja.
     * `null` = pengguna belum punya vektor profil — PR-073 yang memutuskan
     * jalur penggantinya, bukan fungsi ini.
     */
    async cari(userId: string): Promise<KandidatLowongan[] | null> {
      const filter = susunFilterKandidat(await deps.bacaProfil(userId));
      return deps.repo.cariKandidat(userId, filter, {
        batas: JUMLAH_KANDIDAT,
        efSearch: deps.efSearch,
      });
    },
  };
}

export type KandidatService = ReturnType<typeof createKandidatService>;
