// Kunci label discovery (PR-093). Pola sama `@nawasena/formulir`: nama kunci =
// kunci katalog i18n web, jadi web memberi `t` dan typecheck-nya menolak kunci
// yang tidak ada; mobile memberi tabel teks sederhana (U-37).
import type { EmploymentType, WorkMode } from "@nawasena/schemas";

import type { TingkatKecocokan } from "./skor.js";

export const KUNCI_TIPE = {
  full_time: "companies.lowongan.tipe.full_time",
  part_time: "companies.lowongan.tipe.part_time",
  contract: "companies.lowongan.tipe.contract",
  internship: "companies.lowongan.tipe.internship",
  freelance: "companies.lowongan.tipe.freelance",
} as const satisfies Readonly<Record<EmploymentType, string>>;

export const KUNCI_MODE = {
  onsite: "companies.lowongan.mode.onsite",
  hybrid: "companies.lowongan.mode.hybrid",
  remote: "companies.lowongan.mode.remote",
} as const satisfies Readonly<Record<WorkMode, string>>;

export const KUNCI_TINGKAT = {
  tinggi: "beranda.feed.kartu.tingkat.tinggi",
  sedang: "beranda.feed.kartu.tingkat.sedang",
  rendah: "beranda.feed.kartu.tingkat.rendah",
} as const satisfies Readonly<Record<TingkatKecocokan, string>>;

export const KUNCI_GAJI = {
  rentang: "lowongan.detail.gaji.rentang",
  mulai: "lowongan.detail.gaji.mulai",
  hingga: "lowongan.detail.gaji.hingga",
} as const;

export type KunciLabelLowongan =
  | (typeof KUNCI_TIPE)[EmploymentType]
  | (typeof KUNCI_MODE)[WorkMode]
  | (typeof KUNCI_TINGKAT)[TingkatKecocokan]
  | (typeof KUNCI_GAJI)[keyof typeof KUNCI_GAJI];

/** Fungsi label pemanggil — bentuknya cocok dengan `t(kunci, variabel)` web. */
export type LabelLowongan = (
  kunci: KunciLabelLowongan,
  variabel?: Readonly<Record<string, string | number>>,
) => string;
