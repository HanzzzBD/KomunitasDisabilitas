// modules/matching — fungsi skor murni (PR-071, SDD §7.2 langkah 2–3).
//
// MURNI DAN DETERMINISTIK (AC): tidak ada jam, acak, atau I/O di berkas ini.
// "Sekarang" masuk sebagai argumen; input sama → skor sama, sampai digit
// terakhir. Itulah yang membuat skor bisa diuji per komponen, dan yang membuat
// skor di cache `match_scores` (PR-072) bisa dijelaskan ulang kapan pun.
//
//   skor = w₁·kemiripan + w₂·akomodasi + w₃·lokasi + w₄·kebaruan   (Σw = 1)
//
// Seluruh keputusan nilai komponen di bawah milik owner (2026-09-30). Angka
// yang bukan bobot ditulis sebagai konstanta bernama DI SINI, bukan diselipkan
// di rumus — supaya pertanyaan "kenapa lowongan ini 0,3 lokasinya?" dijawab
// dengan membaca satu tabel.
//
// DATA SENSITIF: `kebutuhan` akomodasi pengguna (terdekripsi) HANYA dipakai
// sebagai hard filter dan TIDAK PERNAH masuk ke keluaran. `SkorLowongan` hanya
// memuat angka dan id lowongan — tidak ada alasan yang menyebut kondisi user.
import { ACCOMMODATION_NEEDS, type AccommodationNeed, type WorkMode } from "@nawasena/schemas";

export interface BobotSkor {
  kemiripan: number;
  akomodasi: number;
  lokasi: number;
  kebaruan: number;
}

/** Bobot SDD §7.2 — bawaan env; nilai efektif selalu datang dari config. */
export const BOBOT_SKOR_SDD: BobotSkor = {
  kemiripan: 0.55,
  akomodasi: 0.25,
  lokasi: 0.1,
  kebaruan: 0.1,
};

/** Tabel nilai komponen lokasi (keputusan owner 2026-09-30). */
export const NILAI_LOKASI = {
  /** Lowongan remote, pengguna mencentang "terbuka kerja jarak jauh". */
  remoteTerbuka: 1,
  /** Lowongan remote, pengguna tidak mencentangnya (bawaan). */
  remoteTidakTerbuka: 0.8,
  kotaSama: 1,
  provinsiSamaBedaKota: 0.7,
  /** Onsite/hybrid tanpa provinsi — lolos filter (PR-070), tapi tak pasti. */
  lowonganTanpaProvinsi: 0.3,
  /** Pengguna tanpa provinsi: tidak bisa dinilai, jadi netral. */
  penggunaTanpaProvinsi: 0.5,
  /** Onsite/hybrid provinsi lain — normalnya sudah tersaring SQL (PR-070). */
  provinsiLain: 0,
} as const;

/** Kebaruan bila `publishedAt` tidak diketahui — netral, bukan hukuman. */
export const KEBARUAN_TANPA_TANGGAL = 0.5;

const MS_PER_HARI = 86_400_000;

/** Bagian kandidat (PR-070) yang dinilai. */
export interface LowonganUntukSkor {
  jobId: string;
  kemiripan: number;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  accommodations: readonly AccommodationNeed[];
  publishedAt: Date | null;
}

/** Bagian profil NON-sensitif yang dinilai. */
export interface ProfilUntukSkor {
  city: string | null;
  province: string | null;
  openToRemote: boolean;
}

export interface KomponenSkor {
  kemiripan: number;
  akomodasi: number;
  lokasi: number;
  kebaruan: number;
}

export interface SkorLowongan {
  jobId: string;
  /** 0..1, dibulatkan 4 desimal — presisi kolom `match_scores.score` DECIMAL(5,4). */
  skor: number;
  /** Nilai per komponen (0..1) — bahan template penjelasan deterministik PR-073. */
  komponen: KomponenSkor;
}

export interface KonteksSkor {
  profil: ProfilUntukSkor;
  /**
   * Kebutuhan akomodasi WAJIB pengguna (terdekripsi). `null` = tidak ada data
   * atau consent dicabut → tidak menyaring apa pun (AC: tidak menghukum).
   */
  kebutuhan: readonly AccommodationNeed[] | null;
  bobot: BobotSkor;
  paruhKebaruanHari: number;
  sekarang: Date;
}

const jepit = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const bulat4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const setara = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== "";

/** Kemiripan kosinus [-1, 1] → [0, 1]; negatif = tidak mirip sama sekali. */
export function komponenKemiripan(kemiripan: number): number {
  return jepit(kemiripan);
}

/**
 * Keluasan akomodasi lowongan: jumlah akomodasi (unik, dalam taksonomi) ÷
 * ukuran taksonomi. SAMA untuk setiap pengguna — mengukur seberapa inklusif
 * pemberi kerja, bukan kecocokan kebutuhan pribadi (itu tugas hard filter).
 * Karena rumusnya tidak menyentuh data pengguna, pengguna tanpa data akomodasi
 * otomatis netral: tidak dihukum dan tidak diuntungkan (AC).
 */
export function komponenAkomodasi(akomodasiLowongan: readonly AccommodationNeed[]): number {
  const taksonomi = new Set<string>(ACCOMMODATION_NEEDS);
  const unik = new Set(akomodasiLowongan.filter((a) => taksonomi.has(a)));
  return jepit(unik.size / ACCOMMODATION_NEEDS.length);
}

/** Tabel `NILAI_LOKASI`. */
export function komponenLokasi(
  profil: ProfilUntukSkor,
  lowongan: Pick<LowonganUntukSkor, "workMode" | "city" | "province">,
): number {
  if (lowongan.workMode === "remote") {
    return profil.openToRemote ? NILAI_LOKASI.remoteTerbuka : NILAI_LOKASI.remoteTidakTerbuka;
  }
  if (lowongan.province === null || lowongan.province.trim() === "") {
    return NILAI_LOKASI.lowonganTanpaProvinsi;
  }
  if (profil.province === null || profil.province.trim() === "") {
    return NILAI_LOKASI.penggunaTanpaProvinsi;
  }
  if (!setara(profil.province, lowongan.province)) return NILAI_LOKASI.provinsiLain;
  return setara(profil.city, lowongan.city)
    ? NILAI_LOKASI.kotaSama
    : NILAI_LOKASI.provinsiSamaBedaKota;
}

/**
 * Peluruhan eksponensial: 0,5^(umur/paruh). Baru tayang = 1. Tanggal di masa
 * depan (jam antarmesin berbeda) diperlakukan sebagai baru, bukan > 1.
 */
export function komponenKebaruan(
  publishedAt: Date | null,
  sekarang: Date,
  paruhHari: number,
): number {
  if (publishedAt === null) return KEBARUAN_TANPA_TANGGAL;
  const umurHari = Math.max(0, (sekarang.getTime() - publishedAt.getTime()) / MS_PER_HARI);
  return jepit(0.5 ** (umurHari / paruhHari));
}

/**
 * HARD FILTER akomodasi: SETIAP kebutuhan wajib pengguna tersedia di lowongan
 * (kebutuhan ⊆ akomodasi lowongan). Tanpa data (`null`) atau tanpa kebutuhan
 * → selalu lolos.
 */
export function memenuhiAkomodasi(
  kebutuhan: readonly AccommodationNeed[] | null,
  akomodasiLowongan: readonly AccommodationNeed[],
): boolean {
  if (kebutuhan === null) return true;
  const tersedia = new Set(akomodasiLowongan);
  return kebutuhan.every((k) => tersedia.has(k));
}

/** Skor satu lowongan (TANPA hard filter — lihat `nilaiKandidat`). */
export function hitungSkor(lowongan: LowonganUntukSkor, konteks: KonteksSkor): SkorLowongan {
  const komponen: KomponenSkor = {
    kemiripan: komponenKemiripan(lowongan.kemiripan),
    akomodasi: komponenAkomodasi(lowongan.accommodations),
    lokasi: komponenLokasi(konteks.profil, lowongan),
    kebaruan: komponenKebaruan(lowongan.publishedAt, konteks.sekarang, konteks.paruhKebaruanHari),
  };
  const { bobot } = konteks;
  const skor =
    bobot.kemiripan * komponen.kemiripan +
    bobot.akomodasi * komponen.akomodasi +
    bobot.lokasi * komponen.lokasi +
    bobot.kebaruan * komponen.kebaruan;

  return {
    jobId: lowongan.jobId,
    skor: bulat4(jepit(skor)),
    komponen: {
      kemiripan: bulat4(komponen.kemiripan),
      akomodasi: bulat4(komponen.akomodasi),
      lokasi: bulat4(komponen.lokasi),
      kebaruan: bulat4(komponen.kebaruan),
    },
  };
}

/**
 * Hard filter akomodasi → skor → urut. Urutan: skor menurun, lalu `jobId`
 * menaik — pemecah seri yang stabil supaya dua permintaan identik tidak pernah
 * memberi urutan berbeda.
 */
export function nilaiKandidat(
  kandidat: readonly LowonganUntukSkor[],
  konteks: KonteksSkor,
): SkorLowongan[] {
  return kandidat
    .filter((l) => memenuhiAkomodasi(konteks.kebutuhan, l.accommodations))
    .map((l) => hitungSkor(l, konteks))
    .sort((a, b) => b.skor - a.skor || (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0));
}
