// core/ai/prompts — `definePercakapan`: template PERCAKAPAN teks polos (PR-066).
//
// KENAPA BUKAN `definePrompt`. `definePrompt` sengaja hanya jalur JSON: masukannya
// satu objek, keluarannya divalidasi zod. Percakapan berbeda di kedua ujung —
// masukannya RIWAYAT giliran, keluarannya teks yang mengalir token demi token
// dan tidak bisa divalidasi skema sebelum selesai. Menjejalkannya ke
// `definePrompt` berarti melonggarkan dua jaminan yang justru menjadi alasan
// `definePrompt` ada. Jadi ia punya pintunya sendiri, dengan dua jaminan yang
// sama bentuknya:
//
//   1. DATA PENGGUNA SELALU DIBUNGKUS. Setiap giliran `user` masuk ke prompt
//      lewat `bungkusDataTakTepercaya` (penanda ber-nonce + penggosokan) —
//      pemanggil tidak bisa lupa, sebab ia tidak pernah menyusun pesan sendiri.
//      Instruksi anti-injeksi SELALU di `system`, SELALU lebih dulu.
//   2. KELUARAN SELALU DIRAPIKAN oleh template, bukan oleh pemanggil
//      (`rapikan`): sanitasi markup + normalisasi bentuk giliran. Inilah yang
//      membuat jawaban Gemini dan Groq tersimpan dengan format yang SAMA.
//
// Giliran `assistant` di riwayat TIDAK dibungkus: isinya keluaran model yang
// sudah melewati `rapikan` sebelum disimpan, bukan teks pengguna.
import { createHash } from "node:crypto";
import { bersihkanTeksModel, bungkusDataTakTepercaya, INSTRUKSI_ANTI_INJEKSI } from "../guard.js";
import type { AiChatMessage, AiChatRequest } from "../types.js";
import type { PromptMeta } from "./tipe.js";

/** Satu giliran riwayat yang dikirim ke model. */
export interface GiliranRiwayat {
  role: "user" | "assistant";
  content: string;
}

export interface PercakapanSpec {
  nama: string;
  versi: number;
  system: string;
  /** Contoh percakapan; HARUS berselang-seling user → assistant. */
  fewShot?: readonly AiChatMessage[];
  /**
   * Kalimat pembuka yang disimpan sebagai giliran asisten PERTAMA tanpa
   * memanggil model — gratis, deterministik, tidak memotong kuota (keputusan
   * owner 2026-09-28).
   */
  salamPembuka: string;
  /**
   * Berapa giliran TERAKHIR yang dikirim ke model. Membatasi token per panggilan
   * (dan biaya) tanpa memotong transkrip yang tersimpan — ekstraksi PR-067
   * tetap membaca semuanya.
   */
  maksRiwayat: number;
  /** Panjang maksimum giliran asisten SETELAH dirapikan (karakter). */
  maksKarakterJawaban: number;
  temperature?: number;
  maxOutputTokens?: number;
  /** Sumber nonce penanda; disuntik di test. */
  nonces?: () => string;
}

export interface PercakapanTemplate extends PromptMeta {
  readonly system: string;
  readonly fewShot: readonly AiChatMessage[];
  readonly salamPembuka: string;
  readonly maksRiwayat: number;
  /** Sidik bagian statis — sama gunanya dengan `PromptTemplate.sidik`. */
  readonly sidik: string;
  /** Rakit permintaan dari riwayat (terlama → terbaru). */
  bangun(riwayat: readonly GiliranRiwayat[]): AiChatRequest;
  /**
   * Teks mentah model → isi giliran yang disimpan. String kosong berarti
   * jawaban tidak layak disimpan (hanya markup/label) — pemanggil
   * memperlakukannya sebagai `AI_INVALID_OUTPUT`.
   */
  rapikan(teks: string): string;
}

/**
 * Penanda awal percakapan — teks KITA, bukan data pengguna, jadi tidak
 * dibungkus. Ia ada karena dua provider tidak sepakat soal urutan peran: riwayat
 * yang dibuka giliran `assistant` (salam statis) setelah few-shot yang juga
 * berakhir `assistant` akan menjadi dua giliran model berturut-turut.
 */
const PENANDA_MULAI = "(Percakapan baru dimulai.)";

/** Label peran yang kadang ditulis model di depan jawabannya sendiri. */
const LABEL_PERAN = /^\s*(?:asisten|assistant|ai|pewawancara|model|nawasena)\s*:\s*/i;

/**
 * Gabungkan giliran berurutan dengan peran sama. Terjadi nyata: pesan pengguna
 * yang jawabannya gagal lalu disusul pesan berikutnya. Gemini menuntut peran
 * berselang-seling; menggabungkan lebih jujur daripada membuang salah satunya.
 */
function gabungBeruntun(pesan: readonly AiChatMessage[]): AiChatMessage[] {
  const hasil: AiChatMessage[] = [];
  for (const p of pesan) {
    const akhir = hasil.at(-1);
    if (akhir !== undefined && akhir.role === p.role) {
      hasil[hasil.length - 1] = { role: p.role, content: `${akhir.content}\n\n${p.content}` };
    } else {
      hasil.push({ ...p });
    }
  }
  return hasil;
}

/** Potong per code point (bukan unit UTF-16) supaya emoji di tepi tidak terbelah. */
function potong(teks: string, maks: number): string {
  const titik = Array.from(teks);
  return titik.length <= maks
    ? teks
    : `${titik
        .slice(0, maks - 1)
        .join("")
        .trimEnd()}…`;
}

export function definePercakapan(spec: PercakapanSpec): PercakapanTemplate {
  const id = `${spec.nama}.v${spec.versi}`;
  const fewShot = spec.fewShot ?? [];
  const opsiBungkus = spec.nonces === undefined ? {} : { nonces: spec.nonces };
  const sidik = createHash("sha256")
    .update(
      JSON.stringify([
        id,
        spec.system,
        fewShot.map((p) => [p.role, p.content]),
        spec.salamPembuka,
        spec.maksRiwayat,
        spec.maksKarakterJawaban,
        spec.temperature ?? null,
        spec.maxOutputTokens ?? null,
      ]),
      "utf8",
    )
    .digest("hex")
    .slice(0, 16);

  return {
    nama: spec.nama,
    versi: spec.versi,
    id,
    system: spec.system,
    fewShot,
    salamPembuka: spec.salamPembuka,
    maksRiwayat: spec.maksRiwayat,
    sidik,

    bangun(riwayat) {
      const terbaru = riwayat.slice(-spec.maksRiwayat);
      const percakapan: AiChatMessage[] = [
        // Penanda hanya bila riwayat yang terkirim dimulai dari salam. Riwayat
        // yang sudah terpotong tidak "baru dimulai".
        ...(terbaru.length === riwayat.length
          ? [{ role: "user" as const, content: PENANDA_MULAI }]
          : []),
        ...terbaru.map((g) => ({
          role: g.role,
          content: g.role === "user" ? bungkusDataTakTepercaya(g.content, opsiBungkus) : g.content,
        })),
      ];
      return {
        messages: [
          { role: "system", content: `${INSTRUKSI_ANTI_INJEKSI}\n\n${spec.system}` },
          ...fewShot,
          ...gabungBeruntun(percakapan),
        ],
        ...(spec.temperature === undefined ? {} : { temperature: spec.temperature }),
        ...(spec.maxOutputTokens === undefined ? {} : { maxOutputTokens: spec.maxOutputTokens }),
      };
    },

    rapikan(teks) {
      const bersih = bersihkanTeksModel(teks)
        .teks.replace(/\r\n?/g, "\n")
        .replace(LABEL_PERAN, "")
        // Penekanan markdown dibuang: klien merender TEKS MURNI (PR-068), jadi
        // `**` hanya menjadi bintang yang dibacakan screen reader satu per satu.
        .replace(/\*\*|__/g, "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return bersih === "" ? "" : potong(bersih, spec.maksKarakterJawaban);
    },
  };
}
