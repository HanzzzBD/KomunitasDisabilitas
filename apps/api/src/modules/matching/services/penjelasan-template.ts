// modules/matching — penjelasan TEMPLATE deterministik (PR-073, SDD §7.2 "DEGRADASI").
//
// Dipakai untuk setiap item feed yang tidak punya penjelasan LLM: kuota habis,
// AI dimatikan, re-rank gagal/belum selesai, atau di luar top-20. Janji
// degradasinya: feed tetap bermakna walau AI mati total.
//
// SUMBERNYA DATA, BUKAN KOMPONEN SKOR (keputusan owner 2026-09-30): keahlian
// pengguna yang namanya muncul di teks lowongan, mode kerja remote, lokasi yang
// sama, dan fasilitas lowongan — paling banyak DUA alasan, contoh
// "Cocok: bisa kerja dari rumah (remote), sesuai keahlian Excel."
//
// TIDAK PERNAH MENYEBUT KONDISI PENGGUNA (AC PR-073). Bahannya hanya profil
// jalur aman (lokasi, nama keahlian) dan data lowongan publik — tidak ada data
// disabilitas/akomodasi pengguna yang bisa sampai ke sini. Nama keahlian adalah
// teks bebas, jadi keahlian yang memuat istilah kondisi DILEWATI; fasilitas
// lowongan ("juru bahasa isyarat") adalah data lowongan, bukan kondisi.
//
// MURNI: tanpa I/O, tanpa jam.
import type { JobSearchResult } from "@nawasena/schemas";
import { LABEL_AKOMODASI, menyebutKondisi } from "./rerank.js";

/** Profil jalur aman yang dibaca template. */
export interface ProfilUntukTemplate {
  city: string | null;
  province: string | null;
  keahlian: ReadonlyArray<{ name: string }>;
}

export interface LowonganUntukTemplate {
  kartu: Pick<JobSearchResult, "title" | "workMode" | "city" | "province" | "accommodations">;
  requirements: string | null;
  description: string;
}

/** Kalimat bila tidak ada satu pun alasan konkret. */
export const PENJELASAN_UMUM = "Cocok dengan profil Anda.";

/** Nama keahlian terpanjang yang disebut apa adanya. */
const MAKS_NAMA_KEAHLIAN = 40;

const setara = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.trim() !== "" && a.trim().toLowerCase() === b.trim().toLowerCase();

const escapeRegex = (teks: string): string => teks.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Keahlian pertama (urutan profil) yang muncul sebagai KATA UTUH di judul,
 * persyaratan, atau deskripsi lowongan. "Excel" cocok dengan "menguasai Excel",
 * tidak dengan "Excellent"; beda huruf besar-kecil diabaikan.
 */
export function keahlianCocok(
  keahlian: ReadonlyArray<{ name: string }>,
  lowongan: Pick<LowonganUntukTemplate, "kartu" | "requirements" | "description">,
): string | null {
  const teks = [lowongan.kartu.title, lowongan.requirements ?? "", lowongan.description].join("\n");
  for (const { name } of keahlian) {
    const nama = name.replace(/\s+/g, " ").trim();
    // Nama yang memecah kalimat ("x. Y") membuat penjelasan lebih dari satu kalimat.
    if (nama.length < 2 || nama.length > MAKS_NAMA_KEAHLIAN || /[.!?](\s|$)/.test(nama)) continue;
    if (menyebutKondisi(nama)) continue;
    const pola = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(nama)}($|[^\\p{L}\\p{N}])`, "iu");
    if (pola.test(teks)) return nama;
  }
  return null;
}

/** Satu kalimat template untuk satu lowongan. */
export function templatePenjelasan(
  profil: ProfilUntukTemplate,
  lowongan: LowonganUntukTemplate,
): string {
  const { kartu } = lowongan;
  const alasan: string[] = [];

  if (kartu.workMode === "remote") {
    alasan.push("bisa kerja dari rumah (remote)");
  } else if (setara(profil.city, kartu.city) && kartu.city !== null) {
    alasan.push(`lokasi di ${kartu.city.trim()}`);
  } else if (setara(profil.province, kartu.province) && kartu.province !== null) {
    alasan.push(`lokasi di ${kartu.province.trim()}`);
  }

  const keahlian = keahlianCocok(profil.keahlian, lowongan);
  if (keahlian !== null) alasan.push(`sesuai keahlian ${keahlian}`);

  const fasilitas = kartu.accommodations[0];
  if (alasan.length < 2 && fasilitas !== undefined) {
    alasan.push(`menyediakan ${LABEL_AKOMODASI[fasilitas]}`);
  }

  return alasan.length === 0 ? PENJELASAN_UMUM : `Cocok: ${alasan.slice(0, 2).join(", ")}.`;
}
