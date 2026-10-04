// core/ai/prompts — `simplify.v1`: tulis ulang teks lowongan dalam Bahasa
// Indonesia sederhana (PR-087, Gap G1, SDD §4.3 & §11).
//
// MASUKAN = SATU BLOK TEKS LOWONGAN, DAN ITU DATA TAK TEPERCAYA. Deskripsi dan
// persyaratan ditulis pihak ketiga, jadi `teks` dibungkus penanda ber-nonce
// (default-terbalik `definePrompt`: tidak ada kunci di `tepercaya`). Teks itu
// tidak pernah datang dari body permintaan — pemanggil membacanya sendiri dari
// lowongan aktif (keputusan owner 2026-10-04), sehingga endpoint ini tidak bisa
// dipakai sebagai LLM serba-guna untuk teks sembarang.
//
// LINGKUP CACHE: BERSAMA. Seluruh masukannya teks lowongan publik — yang sama
// persis dengan yang dilihat pengunjung anonim di `/lowongan/:id`. Satu entri
// melayani semua pengguna, dan kuncinya adalah ISI teks: lowongan yang disunting
// otomatis mendapat kunci baru. Alasan ini juga terdaftar di
// `__tests__/prompt-cache-lingkup.test.ts`.
//
// FAKTA TIDAK BOLEH BERUBAH. Larangan di prompt adalah lapis pertama; lapis
// kedua deterministik ada di pemanggil (`modules/ai/services/simplify.service.ts`):
// setiap angka di hasil wajib ada di teks asli, kalau tidak hasilnya ditolak.
import { z } from "zod";
import { definePrompt } from "./definisi.js";

/** Batas panjang teks hasil. Lebih longgar dari deskripsi (5000): kalimat pendek memanjangkan. */
export const SIMPLIFY_MAKS_KARAKTER_HASIL = 8_000;

export interface SimplifyInput {
  /** Deskripsi ATAU persyaratan satu lowongan — satu bagian per panggilan. */
  teks: string;
}

export const simplifyKeluaranSchema = z.object({
  teks: z.string().trim().min(1).max(SIMPLIFY_MAKS_KARAKTER_HASIL),
});

export type SimplifyKeluaran = z.infer<typeof simplifyKeluaranSchema>;

export const simplifyV1 = definePrompt<SimplifyInput, SimplifyKeluaran>({
  nama: "simplify",
  versi: 1,
  system: [
    "Tugasmu: tulis ulang teks lowongan kerja dalam Bahasa Indonesia yang sederhana, supaya mudah dipahami pembaca dengan kesulitan membaca atau memproses bahasa. Jawab HANYA dengan JSON.",
    "",
    'Bentuk jawaban: {"teks":"..."}',
    "",
    "Cara menulis:",
    "- Kalimat pendek, paling banyak 15 kata. Satu kalimat, satu gagasan.",
    "- Pakai kata sehari-hari. Ganti istilah asing atau istilah teknis dengan penjelasan singkat.",
    '- Pakai kalimat aktif. Sapa pembaca dengan "Anda".',
    '- Daftar boleh ditulis per baris, diawali "- ".',
    "- Teks polos saja: tanpa HTML, tanpa tanda bintang, tanpa tanda pagar, tanpa tautan.",
    "",
    "Yang TIDAK BOLEH berubah:",
    "- Gaji, angka, tanggal, jam kerja, lokasi, nama perusahaan, nama alat, dan syarat. Tulis semua angka persis seperti di teks asli.",
    "- Jangan menambah syarat, tunjangan, atau janji yang tidak tertulis di teks asli.",
    "- Jangan menghapus syarat. Setiap syarat di teks asli harus tetap ada.",
    "- Jangan menyebut atau menebak kondisi kesehatan, disabilitas, atau diagnosis siapa pun.",
  ].join("\n"),
  output: simplifyKeluaranSchema,
  temperature: 0.2,
  maxOutputTokens: 4_096,
  // Deskripsi lowongan dibatasi 5000 karakter di skema tulisnya; batas ini
  // jaring terakhir untuk data lama yang lahir sebelum batas itu.
  maksKarakter: 6_000,
  lingkup: "bersama",
  // Plafon 24 jam. Mitigasi PDP plafon itu (purge akun tidak menjangkau Redis)
  // tidak relevan di sini — tidak ada data pengguna di masukan — jadi umur
  // terpanjang yang diizinkan dipakai demi hit-rate.
  cacheTtlDetik: 86_400,
});
