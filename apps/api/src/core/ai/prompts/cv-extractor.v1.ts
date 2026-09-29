// core/ai/prompts — `cv-extractor.v1`: transkrip AI CV Builder → isi CV JSON
// (PR-067, PRD FR-3.1, SDD §7.3 "finalize memakai prompt ekstraksi → JSON sesuai
// resumeSchema").
//
// KELUARAN SENGAJA `unknown` DI SINI, bukan `resumeContentInputSchema`. Adapter
// JSON (`chatJson`) memvalidasi terhadap skema template dan, bila gagal, hanya
// melempar `AI_INVALID_OUTPUT` dengan ringkasan jalur — bukan daftar masalah
// lengkap. Retry-with-feedback (SDD §7.3) justru membutuhkan daftar itu untuk
// dikirim balik ke model. Jadi skema template hanya menuntut "JSON yang sah",
// dan validasi SESUNGGUHNYA terhadap kontrak CV dilakukan pemanggil
// (`cv-ekstraksi.service.ts`) — tetap SEBELUM apa pun disimpan. Sanitasi
// keluaran (`bersihkanKeluaran`) tetap ditempelkan `definePrompt` di atasnya.
//
// KONTAK TIDAK DIEKSTRAK. Pewawancara tidak pernah menanyakannya, dan nomor HP
// atau alamat yang terucap sambil lalu tidak pantas disalin model ke berkas yang
// akan dikirim ke perusahaan. Editor CV mengisinya dari profil (PR-061).
//
// Tidak ada field disabilitas di keluaran — ditegakkan dua kali: instruksi di
// bawah, dan `.strict()` pada `resumeContentInputSchema` yang menolak kunci
// tambahan apa pun (PR-060).
import { z } from "zod";
import { definePrompt } from "./definisi.js";

export interface CvExtractorInput {
  /** Transkrip berformat "Pewawancara: …" / "Pengguna: …" — DIBUNGKUS sebagai data. */
  percakapan: string;
  /**
   * Daftar masalah keluaran sebelumnya (retry-with-feedback), atau null pada
   * percobaan pertama. TIDAK tepercaya: jalurnya bisa memuat nama kunci yang
   * dikarang model sendiri.
   */
  perbaikan: string | null;
  /** Konstanta kita — dasar menafsirkan "tahun lalu", "sekarang". */
  tahunSekarang: number;
}

export const cvExtractorV1 = definePrompt<CvExtractorInput, unknown>({
  nama: "cv-extractor",
  versi: 1,
  system: [
    "Tugasmu: ubah percakapan wawancara CV menjadi SATU objek JSON isi CV. Jawab HANYA dengan JSON.",
    "",
    "Bentuk objek (semua kunci persis seperti ini, camelCase):",
    "{",
    '  "headline": string|null        // maks 160 karakter, mis. "Kasir berpengalaman"',
    '  "summary": string|null         // 2–4 kalimat, maks 2000 karakter, orang pertama ("Saya …")',
    '  "experiences": [ { "title": string, "company": string|null, "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null, "description": string|null } ]',
    '  "educations": [ { "institution": string, "degree": string|null, "field": string|null, "year": number|null } ]',
    '  "skills": [ { "name": string, "level": string|null } ]',
    '  "certifications": [ { "name": string, "issuer": string|null, "year": number|null } ]',
    '  "organizations": [ { "name": string, "role": string|null, "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null, "description": string|null } ]',
    "}",
    "",
    "Aturan:",
    "- Ambil HANYA yang diucapkan Pengguna. Jangan mengarang nama tempat, tanggal, atau pencapaian.",
    "- Yang tidak disebut: null (untuk teks/tanggal/tahun) atau larik kosong [].",
    "- Tanggal: bila hanya tahun yang diketahui, pakai YYYY-01-01. endDate null berarti MASIH berlangsung — pakai hanya bila Pengguna berkata masih bekerja di sana.",
    "- Tanggal selesai tidak boleh lebih awal dari tanggal mulai.",
    "- Pengalaman informal (usaha sendiri, membantu keluarga, sukarela) tetap dimasukkan ke experiences.",
    "- Tulis dalam Bahasa Indonesia yang rapi dan sederhana.",
    "- JANGAN memasukkan kontak (email, nomor HP, alamat) dan JANGAN menambah kunci lain di luar bentuk di atas.",
    "- JANGAN menulis jenis disabilitas, diagnosis, atau kondisi kesehatan di bagian mana pun, termasuk summary — meski Pengguna menceritakannya.",
    "- Bila ada bagian 'perbaikan', keluaranmu sebelumnya ditolak karena masalah itu: perbaiki SEMUANYA.",
  ].join("\n"),
  output: z.unknown(),
  tepercaya: ["tahunSekarang"],
  // Transkrip maksimal 256 KiB (AI_CHAT_LIMITS) — batas blok dinaikkan supaya
  // transkrip panjang tidak terpotong diam-diam di tengah pengalaman kerja.
  maksKarakter: 200_000,
  temperature: 0,
  maxOutputTokens: 4_096,
  // Transkrip + jawaban: data pribadi. Satu jam (bawaan) cukup untuk finalize
  // yang diulang cepat; lingkup per pengguna (bawaan).
});
