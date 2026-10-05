// Teks discovery mobile (PR-093) — murni, diuji Vitest.
//
// Label kunci `@nawasena/lowongan` dalam bahasa sederhana (setara `id-simple`
// web, U-37), plus perakit label kartu: KARTU SATU KESATUAN bagi TalkBack (AC
// PR-093) — satu ketukan, satu kalimat utuh, bukan enam potongan teks.
import {
  kalimatGaji,
  persenSkor,
  tingkatKecocokan,
  KUNCI_MODE,
  KUNCI_TINGKAT,
  KUNCI_TIPE,
  type KunciLabelLowongan,
  type LabelLowongan,
} from "@nawasena/lowongan";
import type { InclusivityStatus, JobSearchResult, MatchItem } from "@nawasena/schemas";

const LABEL: Readonly<Record<KunciLabelLowongan, string>> = {
  "companies.lowongan.tipe.full_time": "Kerja penuh waktu",
  "companies.lowongan.tipe.part_time": "Kerja paruh waktu",
  "companies.lowongan.tipe.contract": "Kerja kontrak",
  "companies.lowongan.tipe.internship": "Magang",
  "companies.lowongan.tipe.freelance": "Kerja lepas",
  "companies.lowongan.mode.onsite": "Kerja di kantor",
  "companies.lowongan.mode.hybrid": "Kadang di kantor, kadang di rumah",
  "companies.lowongan.mode.remote": "Kerja dari rumah",
  "beranda.feed.kartu.tingkat.tinggi": "Sangat cocok",
  "beranda.feed.kartu.tingkat.sedang": "Cocok",
  "beranda.feed.kartu.tingkat.rendah": "Mungkin cocok",
  "lowongan.detail.gaji.rentang": "Antara {min} dan {max} setiap bulan",
  "lowongan.detail.gaji.mulai": "Paling sedikit {min} setiap bulan",
  "lowongan.detail.gaji.hingga": "Paling banyak {max} setiap bulan",
};

/** Fungsi label untuk paket — `{nama}` diganti nilai variabel. */
export const labelLowongan: LabelLowongan = (kunci, variabel) =>
  LABEL[kunci].replace(/\{(\w+)\}/g, (_, nama: string) => String(variabel?.[nama] ?? ""));

export const teksTipe = (t: JobSearchResult["employmentType"]): string =>
  labelLowongan(KUNCI_TIPE[t]);
export const teksMode = (m: JobSearchResult["workMode"]): string => labelLowongan(KUNCI_MODE[m]);

export function teksLokasi(j: Pick<JobSearchResult, "city" | "province">): string | null {
  const bagian = [j.city, j.province].filter((x): x is string => x !== null && x !== "");
  return bagian.length === 0 ? null : bagian.join(", ");
}

export const teksGaji = (min: number | null, max: number | null): string | null =>
  kalimatGaji(labelLowongan, min, max);

/** "Sangat cocok (73%)" — paritas varian sederhana `beranda.feed.kartu.skor`. */
export function teksSkor(skor: number): string {
  return `${labelLowongan(KUNCI_TINGKAT[tingkatKecocokan(skor)])} (${String(persenSkor(skor))}%)`;
}

/**
 * Label TalkBack satu kartu. Urutannya urutan keputusan: apa pekerjaannya, di
 * mana, seberapa cocok dan kenapa. "persen" ditulis kata, bukan "%", supaya
 * dibaca sama di semua mesin TTS.
 */
export function labelKartu(
  job: JobSearchResult,
  cocok?: Pick<MatchItem, "score" | "explanation">,
): string {
  const bagian = [
    job.title,
    job.companyName,
    teksTipe(job.employmentType),
    teksMode(job.workMode),
    teksLokasi(job),
  ];
  if (cocok) {
    bagian.push(
      `${labelLowongan(KUNCI_TINGKAT[tingkatKecocokan(cocok.score)])}, ${String(persenSkor(cocok.score))} persen`,
      `Alasannya: ${cocok.explanation}`,
    );
  }
  return bagian.filter((b): b is string => b !== null && b !== "").join(". ");
}

export const TEKS_INKLUSIF: Readonly<
  Record<InclusivityStatus, { label: string; penjelasan: string }>
> = {
  verified: {
    label: "Sudah diperiksa",
    penjelasan: "Tim kami sudah memeriksa data perusahaan ini.",
  },
  self_claimed: {
    label: "Klaim sendiri, belum diperiksa",
    penjelasan: "Perusahaan ini yang menulis datanya sendiri. Belum diperiksa tim kami.",
  },
  unverified: { label: "Belum diperiksa", penjelasan: "Data ini belum diperiksa." },
};

/** Sakelar rollback feed (paritas `VITE_MATCHING_FEED_ENABLED`): hanya "false" mematikan. */
export const feedMatchingAktif = process.env.EXPO_PUBLIC_MATCHING_FEED_ENABLED !== "false";
