// modules/matching — penilaian kandidat untuk satu pengguna (PR-071, SDD §7.2 langkah 2–3).
//
// Satu-satunya tempat di matching yang MENYENTUH data sensitif: kebutuhan
// akomodasi pengguna, terdekripsi, untuk hard filter "kebutuhan ⊆ akomodasi
// lowongan". Konsekuensi ADR-007: kolomnya ciphertext, jadi filter ini tidak
// bisa di SQL (PR-070) dan dievaluasi di memori atas top-50.
//
// JALUR BACANYA `sensitiveAccess.bacaSensitif` ber-tujuan `matching` (dokumen
// phase; docs/akses-data-sensitif.md) — bukan `snapshotFor` pemilik, walau
// feed diminta pemiliknya sendiri. Alasannya: pembacanya adalah MESIN
// pencocokan, bukan layar profil; tujuan `matching` dicatat teragregasi per
// hari (satu baris per pelaku per hari, bukan satu per permintaan), jadi tetap
// terjawab "berapa kali data ini dibaca untuk pencocokan".
//
// YANG DIAMBIL HANYA `tags`. `bacaSensitif` mengembalikan profil lengkap
// (termasuk ragam disabilitas dan catatan bebas) — semuanya dibuang di fungsi
// ini, sebelum apa pun sampai ke fungsi skor. Tidak ada yang ditulis ke log.
import type { AccommodationNeed } from "@nawasena/schemas";
// Lewat berkas SERVICE modul profiles, bukan index-nya: antar-modul hanya
// service → service (boundaries PR-002); index mengekspor ulang repository.
import type { ProfilesActor } from "../../profiles/services/profiles.service.js";
import type { SensitiveAccess } from "../../profiles/services/sensitive-access.service.js";
import {
  nilaiKandidat,
  type BobotSkor,
  type LowonganUntukSkor,
  type ProfilUntukSkor,
  type SkorLowongan,
} from "./skor.js";

/** Alasan audit tetap untuk pembacaan tujuan `matching` (1–200 karakter). */
export const ALASAN_AKSES_MATCHING =
  "Hard filter akomodasi feed matching (PR-071): kebutuhan wajib pengguna ⊆ akomodasi lowongan";

export interface PembacaAkomodasi {
  /** `null` = tanpa profil, tanpa consent, atau belum pernah mengisi. */
  kebutuhanWajib(actor: ProfilesActor): Promise<AccommodationNeed[] | null>;
}

export function createPembacaAkomodasi(deps: {
  sensitiveAccess: Pick<SensitiveAccess, "bacaSensitif">;
}): PembacaAkomodasi {
  return {
    async kebutuhanWajib(actor) {
      const profil = await deps.sensitiveAccess.bacaSensitif(actor, actor.userId, {
        purpose: "matching",
        reason: ALASAN_AKSES_MATCHING,
      });
      // Consent dicabut → `sensitive` null di `keProfil` (consent menang atas
      // isi kolom) → diperlakukan sama dengan "tidak ada data": tidak menyaring.
      const tags = profil?.sensitive?.accommodationNeeds.tags ?? null;
      return tags === null || tags.length === 0 ? null : [...tags];
    },
  };
}

export interface PenilaianServiceDeps {
  akomodasi: PembacaAkomodasi;
  /** Dari env `MATCHING_WEIGHT_*` — jumlahnya sudah dijamin 1 oleh gerbang env. */
  bobot: BobotSkor;
  /** `MATCHING_RECENCY_HALF_LIFE_DAYS`. */
  paruhKebaruanHari: number;
  clock?: () => Date;
}

export function createPenilaianService(deps: PenilaianServiceDeps) {
  const now = deps.clock ?? (() => new Date());

  return {
    /**
     * Hard filter akomodasi + skor + urut atas kandidat PR-070. Profil yang
     * diterima di sini hanya bagian NON-sensitif (lokasi); bagian sensitif
     * dibaca sendiri lewat jalur ber-audit.
     */
    async nilai(
      actor: ProfilesActor,
      profil: ProfilUntukSkor,
      kandidat: readonly LowonganUntukSkor[],
    ): Promise<SkorLowongan[]> {
      if (kandidat.length === 0) return [];
      const kebutuhan = await deps.akomodasi.kebutuhanWajib(actor);
      return nilaiKandidat(kandidat, {
        profil,
        kebutuhan,
        bobot: deps.bobot,
        paruhKebaruanHari: deps.paruhKebaruanHari,
        sekarang: now(),
      });
    },
  };
}

export type PenilaianService = ReturnType<typeof createPenilaianService>;

/** Env → bobot. Satu tempat pemetaan nama variabel ke komponen. */
export function bobotDariEnv(env: {
  MATCHING_WEIGHT_SIMILARITY: number;
  MATCHING_WEIGHT_ACCOMMODATION: number;
  MATCHING_WEIGHT_LOCATION: number;
  MATCHING_WEIGHT_RECENCY: number;
}): BobotSkor {
  return {
    kemiripan: env.MATCHING_WEIGHT_SIMILARITY,
    akomodasi: env.MATCHING_WEIGHT_ACCOMMODATION,
    lokasi: env.MATCHING_WEIGHT_LOCATION,
    kebaruan: env.MATCHING_WEIGHT_RECENCY,
  };
}
