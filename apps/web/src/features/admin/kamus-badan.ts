// Pemetaan nilai formulir ↔ badan permintaan kamus BISINDO (PR-085b). Pola sama
// `jobs-badan.ts`: tanpa DOM, bisa diuji tanpa merender apa pun.
//
// Key media TIDAK ADA di formulir: key hanya lahir dari unggahan (slot unggah),
// tidak pernah diketik. Status juga tidak — Terbitkan/Tarik adalah tombol.
import type { SignVideoAdmin, SignVideoCategory } from "@nawasena/schemas";
import type { BuatEntriKamus, UbahEntriKamus } from "@nawasena/api-client";
import type { KunciTeks } from "../../shared/i18n/index.js";

export const KATEGORI_KAMUS: readonly SignVideoCategory[] = [
  "salam",
  "perkenalan",
  "wawancara",
  "tempat_kerja",
  "akomodasi",
  "waktu",
  "angka",
  "umum",
];

export interface NilaiKamus {
  phrase: string;
  category: SignVideoCategory | "";
  transcript: string;
}

export const NILAI_KOSONG: NilaiKamus = { phrase: "", category: "", transcript: "" };

export function keNilai(entri: SignVideoAdmin): NilaiKamus {
  return {
    phrase: entri.phrase,
    category: entri.category ?? "",
    transcript: entri.transcript ?? "",
  };
}

/** `""` dikirim apa adanya agar zod menolaknya dengan pesan Bahasa Indonesia. */
export function keBadanBuat(nilai: NilaiKamus): BuatEntriKamus {
  const transkrip = nilai.transcript.trim();
  return {
    phrase: nilai.phrase,
    category: nilai.category as SignVideoCategory,
    ...(transkrip === "" ? {} : { transcript: transkrip }),
  };
}

/** Transkrip kosong = hapus (`null`); server menolaknya 422 bila entri sudah terbit. */
export function keBadanUbah(nilai: NilaiKamus): UbahEntriKamus {
  const transkrip = nilai.transcript.trim();
  return {
    phrase: nilai.phrase,
    category: nilai.category as SignVideoCategory,
    transcript: transkrip === "" ? null : transkrip,
  };
}

/**
 * Yang masih kurang untuk terbit — cermin `kekuranganTerbit` server (PR-084).
 * Diperiksa atas entri TERSIMPAN, bukan isian formulir: yang diterbitkan adalah
 * yang sudah ada di server (alasan sama dengan akomodasi di `admin-jobs-formulir`).
 */
export function kekuranganKamus(entri: SignVideoAdmin): KunciTeks[] {
  const kurang: KunciTeks[] = [];
  if (entri.videoKey === null) kurang.push("admin.kamus.kurang.video");
  if (entri.captionKey === null) kurang.push("admin.kamus.kurang.caption");
  if (entri.transcript === null || entri.transcript.trim() === "") {
    kurang.push("admin.kamus.kurang.transkrip");
  }
  return kurang;
}
