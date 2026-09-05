// core/ai/prompts — SPESIMEN. Bukan prompt produk (PR-044a).
//
// KENAPA IA ADA. Registry tanpa satu pun instance membuat penjaga kelengkapan
// lulus secara HAMPA dan membiarkan mekanisme (batas tipe, pembungkusan data,
// sanitasi keluaran) tak pernah terbukti ujung-ke-ujung. Berkas ini adalah satu
// instance minimum yang membuktikannya.
//
// KENAPA IA BUKAN PRODUK. Prompt fitur lahir di PR-066/067/072/087 (Out of
// Scope PR-044). Supaya spesimen ini tidak diam-diam menjadi prompt produk,
// `__tests__/prompt-sensitif-jangkauan.test.ts` MENOLAK impor berkas ini dari
// `src/modules/**` — build merah, bukan diskusi.
import { z } from "zod";
import { definePrompt } from "./definisi.js";

/**
 * Masukan spesimen. Perhatikan bentuknya: `bahasa` adalah konstanta yang KITA
 * tulis (jadi tepercaya), sedangkan `pertanyaan` dan `kutipan` datang dari
 * pengguna — dan karena default-nya terbalik, keduanya dibungkus tanpa penulis
 * template perlu menuliskan apa pun.
 */
export interface SpesimenInput {
  bahasa: "id";
  pertanyaan: string;
  kutipan: readonly string[];
}

export const spesimenKeluaranSchema = z.object({
  ringkasan: z.string(),
  yakin: z.boolean(),
});

export type SpesimenKeluaran = z.infer<typeof spesimenKeluaranSchema>;

export const spesimenV1 = definePrompt<SpesimenInput, SpesimenKeluaran>({
  nama: "spesimen",
  versi: 1,
  system:
    "Kamu meringkas kutipan menjadi satu kalimat Bahasa Indonesia sederhana. " +
    "Jawab hanya dengan JSON sesuai skema yang diminta.",
  output: spesimenKeluaranSchema,
  tepercaya: ["bahasa"],
  temperature: 0,
});
