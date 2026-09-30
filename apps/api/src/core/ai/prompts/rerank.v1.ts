// core/ai/prompts — `rerank.v1`: urutan akhir + penjelasan satu kalimat untuk
// top-20 feed matching (PR-072, SDD §7.2 langkah 4, SDD §7.3).
//
// SATU PANGGILAN PER REFRESH (hemat kuota): seluruh top-20 dikirim sekaligus,
// model mengembalikan urutan + alasan per lowongan.
//
// LOWONGAN = DATA TAK TEPERCAYA (SDD §7.3). Teks lowongan bisa ditulis pihak
// ketiga, jadi setiap blok teksnya dibungkus penanda ber-nonce oleh
// `definePrompt` (default-terbalik: tidak ada kunci di `tepercaya`). `ref`
// sengaja ANGKA di LUAR blok teks — angka tidak dibungkus, dan lowongan yang
// menulis "ref: 1" di deskripsinya hanya menulis teks di dalam bloknya sendiri.
// Nomor itu dipetakan kembali ke id lowongan oleh pemanggil (whitelist), bukan
// oleh model: model tidak pernah melihat UUID, apalagi bisa mengarangnya.
//
// PROFIL = DATA TERSTRUKTUR SAJA (keputusan owner 2026-09-30): headline, nama
// keahlian, judul posisi, lokasi, kesediaan remote. Teks bebas (ringkasan,
// deskripsi pengalaman) TIDAK ikut — di sanalah orang menceritakan kondisinya,
// dan model yang membacanya bisa menyebutnya di penjelasan. Data disabilitas
// dan kebutuhan akomodasi pengguna tidak ada di tipe masukan sama sekali.
//
// KELUARAN SENGAJA LONGGAR di skema ini (hanya bentuk). Aturan yang
// sesungguhnya — ref harus ada di daftar, tiap ref sekali, alasan tepat satu
// kalimat — ditegakkan pemanggil PER BUTIR (`modules/matching/services/rerank.ts`):
// skema ketat di sini akan membuang SELURUH jawaban karena satu alasan yang
// kepanjangan, padahal 19 sisanya sah.
//
// LINGKUP CACHE: per pengguna (bawaan) — masukannya memuat profil pengguna.
import { z } from "zod";
import { definePrompt } from "./definisi.js";

/** Satu lowongan kandidat. */
export interface RerankLowonganInput {
  /** Nomor urut 1..N di permintaan ini — BUKAN id lowongan. */
  ref: number;
  /** Judul, mode kerja, lokasi, akomodasi, persyaratan, ringkasan — satu blok data. */
  teks: string;
}

export interface RerankInput {
  profil: {
    headline: string | null;
    /** Nama keahlian, dipisah koma. */
    keahlian: string;
    /** Judul posisi pengalaman kerja, dipisah koma. */
    posisi: string;
    lokasi: string | null;
    terbukaRemote: boolean;
  };
  lowongan: readonly RerankLowonganInput[];
}

export const rerankKeluaranSchema = z.object({
  urutan: z
    .array(
      z.object({
        ref: z.number(),
        alasan: z.string().max(1_000),
      }),
    )
    .max(100),
});

export type RerankKeluaran = z.infer<typeof rerankKeluaranSchema>;

export const rerankV1 = definePrompt<RerankInput, RerankKeluaran>({
  nama: "rerank",
  versi: 1,
  system: [
    "Tugasmu: urutkan daftar lowongan dari yang PALING cocok untuk profil pencari kerja, lalu beri alasan singkat untuk tiap lowongan. Jawab HANYA dengan JSON.",
    "",
    'Bentuk jawaban: {"urutan":[{"ref":3,"alasan":"..."},{"ref":1,"alasan":"..."}]}',
    "",
    "Aturan urutan:",
    "- Pakai HANYA nomor ref yang ada di daftar lowongan. Setiap ref muncul tepat satu kali.",
    "- Nilai kecocokan dari keahlian, posisi yang pernah dijalani, mode kerja, dan lokasi.",
    "",
    "Aturan alasan:",
    "- Tepat SATU kalimat, paling banyak 20 kata, Bahasa Indonesia sederhana.",
    '- Sapa pembaca dengan "Anda". Sebut hal nyata dari lowongan: keahlian yang cocok, mode kerja, lokasi, atau fasilitas yang tersedia.',
    '- Contoh: "Cocok karena Anda menguasai Excel dan pekerjaan ini bisa dari rumah."',
    "- JANGAN menyebut atau menebak kondisi kesehatan, disabilitas, atau diagnosis siapa pun.",
    "- JANGAN menjanjikan diterima kerja dan JANGAN mengarang hal yang tidak tertulis di lowongan.",
  ].join("\n"),
  output: rerankKeluaranSchema,
  temperature: 0.2,
  maxOutputTokens: 2_048,
  // Blok per lowongan dipotong pemanggil jauh di bawah ini; batas ini jaring
  // terakhir untuk profil/lowongan yang lolos dari pemotongan.
  maksKarakter: 4_000,
});
