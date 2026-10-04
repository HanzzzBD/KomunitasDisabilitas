// modules/ai — "Sederhanakan" teks lowongan (PR-087, Gap G1, SDD §4.3 & §11).
//
// ALUR: rujukan lowongan → teks dibaca server dari lowongan AKTIF (lewat
// service modul jobs yang disuntik composition root, ADR-001) → SATU panggilan
// `simplify.v1` lewat `AiClient.prompt` (cache → kuota → provider → jejak biaya)
// → penjaga fakta → teks polos.
//
// DEGRADASI = TIDAK ADA VERSI SEDERHANA (tabel pola degradasi PR-046). Kuota
// habis, penyedia gagal, hasil ditolak penjaga, atau fitur dimatikan: semuanya
// menjadi hasil sah ber-`alasan`, bukan error. Teks asli tidak pernah dikirim
// ulang — ia sudah ada di klien. Yang TETAP error: lowongan tidak ada (404) dan
// kegagalan non-AI (DB) — itu bukan kegagalan lapisan AI.
//
// PENJAGA FAKTA (keputusan owner 2026-10-04: prompt + cek angka). Larangan
// mengubah fakta di prompt hanya permintaan; yang ditegakkan mesin di sini
// adalah: SETIAP ANGKA di hasil wajib ada di teks asli. Itu menangkap gaji,
// jam, tanggal, dan lama pengalaman yang dikarang model. Ia TIDAK menangkap
// syarat yang dihapus atau kata yang diganti maknanya — mitigasinya label "oleh
// AI" + satu klik kembali ke teks asli di klien (Risks PR-087).
//
// BATAS YANG DITERIMA: hasil yang ditolak penjaga sudah tersimpan di cache
// (`AiClient.prompt` menulisnya sebelum berkas ini melihatnya), jadi konten
// yang sama terus ditolak sampai TTL entri habis. Penolakan deterministik itu
// lebih aman daripada mencoba ulang — jawaban kedua model tidak lebih tepercaya.
import type { AiSimplifyBagianLowongan, AiSimplifyTextResult } from "@nawasena/schemas";
import {
  AiProviderError,
  isKuotaHabis,
  simplifyV1,
  type AiClient,
  type PromptTemplate,
  type SimplifyInput,
  type SimplifyKeluaran,
} from "../../../core/ai/index.js";
import { appError } from "../../../core/http/index.js";
import type { Logger } from "../../../core/logger/index.js";

/** Teks satu lowongan aktif. Melempar `LOWONGAN_TIDAK_DITEMUKAN` bila tidak ada. */
export interface TeksLowongan {
  description: string;
  requirements: string | null;
}

export interface SimplifyServiceDeps {
  ai: Pick<AiClient, "prompt">;
  /** `jobs.service.getPublic` — hanya lowongan published & belum lewat tenggat. */
  bacaLowongan(id: string): Promise<TeksLowongan>;
  /** `env.AI_SIMPLIFY_ENABLED` — tuas rollback. */
  aktif: boolean;
  logger: Pick<Logger, "warn">;
  /** Disuntik di test; bawaan `simplify.v1`. */
  template?: PromptTemplate<SimplifyInput, SimplifyKeluaran>;
}

export interface SimplifyActor {
  userId: string;
}

export interface PermintaanSimplify {
  sumber: "lowongan";
  id: string;
  bagian: AiSimplifyBagianLowongan;
}

/**
 * Bilangan di teks: deret digit, boleh dipisah `.` atau `,` (ribuan, desimal,
 * jam "08.00"). Dibandingkan TANPA pemisah, jadi "5.000.000" dan "5000000"
 * dianggap sama — model boleh menulis ulang format, tidak boleh nilainya.
 */
const POLA_ANGKA = /\d+(?:[.,]\d+)*/g;

/**
 * Penomoran daftar di awal baris ("1. ", "2) ") dibuang dulu: menulis ulang
 * daftar sebagai daftar bernomor itu sah, dan nomornya bukan fakta.
 */
const POLA_NOMOR_DAFTAR = /^[ \t]*\d{1,2}[.)][ \t]+/gm;

function normal(angka: string): string {
  return angka.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
}

/**
 * Semua bentuk angka yang SAH dipakai hasil: nilai utuhnya, plus SEGMEN
 * pertamanya — supaya "Rp5.000.000" boleh ditulis "Rp5 juta". Segmen lain
 * ("000") sengaja tidak ikut: ia akan meloloskan hampir semua angka karangan.
 */
function angkaSah(teks: string): Set<string> {
  const sah = new Set<string>();
  for (const cocok of teks.matchAll(POLA_ANGKA)) {
    sah.add(normal(cocok[0]));
    const pertama = cocok[0].split(/[.,]/)[0];
    if (pertama !== undefined) sah.add(normal(pertama));
  }
  return sah;
}

/**
 * `true` bila setiap angka di `hasil` ada di `asli`. Diekspor untuk unit test —
 * aturan ini yang memikul AC "fakta kunci tidak berubah".
 */
export function angkaTerjaga(asli: string, hasil: string): boolean {
  const sah = angkaSah(asli);
  const tanpaNomor = hasil.replace(POLA_NOMOR_DAFTAR, "");
  for (const cocok of tanpaNomor.matchAll(POLA_ANGKA)) {
    if (!sah.has(normal(cocok[0]))) return false;
  }
  return true;
}

/**
 * Buang sisa markdown yang lolos larangan prompt. HTML sudah dibuang
 * `bersihkanKeluaran` (definePrompt); ini hanya kerapian — klien merender
 * hasilnya sebagai teks, jadi `**` akan tampil apa adanya sebagai bintang.
 */
export function teksPolos(teks: string): string {
  return teks
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[ \t]*[*•][ \t]+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function degradasi(alasan: NonNullable<AiSimplifyTextResult["alasan"]>): AiSimplifyTextResult {
  return { teks: null, alasan };
}

export function createSimplifyService(deps: SimplifyServiceDeps) {
  const { ai, logger } = deps;
  const template = deps.template ?? simplifyV1;

  return {
    async sederhanakan(
      actor: SimplifyActor,
      permintaan: PermintaanSimplify,
    ): Promise<AiSimplifyTextResult> {
      // Dimatikan = tanpa membaca lowongan, tanpa kuota, tanpa penyedia.
      if (!deps.aktif) return degradasi("dimatikan");

      const lowongan = await deps.bacaLowongan(permintaan.id);
      const asli = permintaan.bagian === "deskripsi" ? lowongan.description : lowongan.requirements;
      if (asli === null || asli.trim().length === 0) throw appError("BAGIAN_LOWONGAN_KOSONG");

      let keluaran: SimplifyKeluaran;
      try {
        const jawaban = await ai.prompt(
          { userId: actor.userId, feature: "simplify_text" },
          template,
          { teks: asli },
        );
        keluaran = jawaban.data;
      } catch (err) {
        if (isKuotaHabis(err)) return degradasi("kuota_habis");
        if (err instanceof AiProviderError) {
          // Kode saja — tanpa userId, tanpa isi teks/jawaban.
          logger.warn({ kode: err.code }, "Sederhanakan teks gagal — teks asli tetap dipakai");
          return degradasi("ai_tidak_tersedia");
        }
        throw err;
      }

      const teks = teksPolos(keluaran.teks);
      if (teks.length === 0) return degradasi("ai_tidak_tersedia");
      if (!angkaTerjaga(asli, teks)) {
        logger.warn(
          { kode: "ANGKA_TIDAK_ADA_DI_ASLI" },
          "Hasil sederhanakan memuat angka yang tidak ada di teks asli — ditolak",
        );
        return degradasi("ai_tidak_tersedia");
      }
      return { teks, alasan: null };
    },
  };
}

export type SimplifyService = ReturnType<typeof createSimplifyService>;
