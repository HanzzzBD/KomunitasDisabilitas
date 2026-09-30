// modules/matching — penyusun masukan + pengurai hasil re-rank (PR-072).
//
// MURNI: tanpa I/O, tanpa jam. Dua pertanyaan keamanan PR ini dijawab dengan
// membaca berkas ini dan test-nya, bukan dengan menelusuri alur:
//
//   1. "Apa yang dikirim ke LLM?" → `susunMasukanRerank`. Tipe masukannya tidak
//      punya tempat bagi data disabilitas/akomodasi PENGGUNA, dan penyusun hanya
//      membaca field yang disebut namanya (objek yang membawa properti lebih
//      tetap tidak bisa menyelundupkannya — dibuktikan test).
//   2. "Bisakah LLM memasukkan lowongan di luar kandidat?" → `uraiHasilRerank`.
//      Model hanya melihat nomor `ref` 1..N; nomor dipetakan kembali lewat peta
//      yang KITA buat. Ref di luar peta, ganda, atau bukan bilangan bulat
//      dibuang. Tidak ada jalan bagi keluaran model untuk menambah baris.
//
// URUTAN AKHIR = urutan model untuk ref yang sah, lalu kandidat yang dilewatkan
// model menurut skor deterministik. Tidak ada kandidat yang hilang dari feed
// karena model lupa menyebutnya.
import type { AccommodationNeed, WorkMode } from "@nawasena/schemas";
import type { RerankInput, RerankKeluaran } from "../../../core/ai/index.js";

/** Top-N yang dikirim ke LLM (SDD §7.2 langkah 4). */
export const JUMLAH_RERANK = 20;

/** Panjang maksimum penjelasan (karakter) — ±20 kata Bahasa Indonesia. */
export const MAKS_PENJELASAN = 160;

/** Potongan teks bebas lowongan di prompt — hemat token, 20 lowongan sekaligus. */
export const MAKS_TEKS_LOWONGAN = 400;

/** Label akomodasi untuk prompt. `Record` penuh: nilai taksonomi baru memaksa label baru. */
export const LABEL_AKOMODASI: Record<AccommodationNeed, string> = {
  akses_kursi_roda: "akses kursi roda",
  ramah_screen_reader: "ramah pembaca layar",
  wawancara_via_teks: "wawancara lewat teks",
  jam_kerja_fleksibel: "jam kerja fleksibel",
  ruang_kerja_tenang: "ruang kerja tenang",
  juru_bahasa_isyarat: "juru bahasa isyarat",
};

const LABEL_MODE: Record<WorkMode, string> = {
  remote: "jarak jauh (remote)",
  hybrid: "hybrid",
  onsite: "di kantor",
};

/**
 * Istilah KONDISI — penjelasan yang memuatnya dibuang (jatuh ke template
 * deterministik PR-073). Konservatif dengan sengaja: "ramah disabilitas" yang
 * menggambarkan perusahaan pun ikut terbuang, sebab pembaca penjelasan adalah
 * pengguna, dan kalimat tentang disabilitas di feed-nya terbaca sebagai
 * kalimat tentang DIRINYA (AC PR-073: penjelasan tidak pernah menyebut
 * disabilitas pengguna). Fasilitas ("juru bahasa isyarat", "kursi roda") BUKAN
 * kondisi dan tetap boleh.
 */
const ISTILAH_KONDISI =
  /\b(disabilitas|difabel|penyandang|tuli|tunarungu|netra|tunanetra|buta|daksa|tunadaksa|autis|autisme|diagnosis|diagnosa|cacat)\b/i;

/** Bagian profil NON-sensitif yang boleh masuk prompt (keputusan owner 2026-09-30). */
export interface ProfilUntukRerank {
  headline: string | null;
  city: string | null;
  province: string | null;
  openToRemote: boolean;
  keahlian: ReadonlyArray<{ name: string }>;
  pengalaman: ReadonlyArray<{ title: string }>;
}

export interface LowonganUntukRerank {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  workMode: WorkMode;
  city: string | null;
  province: string | null;
  accommodations: readonly AccommodationNeed[];
}

export interface MasukanRerank {
  input: RerankInput;
  /** `ref` → id lowongan. Satu-satunya jalan kembali dari jawaban model. */
  refKeJobId: ReadonlyMap<number, string>;
}

export interface HasilRerank {
  jobId: string;
  /** 1 = teratas. */
  rank: number;
  /** `null` = alasan model tidak sah → template deterministik (PR-073). */
  explanation: string | null;
}

function bersih(teks: string | null | undefined): string {
  return (teks ?? "").replace(/\s+/g, " ").trim();
}

function potong(teks: string, maks: number): string {
  return teks.length <= maks ? teks : `${teks.slice(0, maks).trimEnd()}…`;
}

function lokasi(city: string | null, province: string | null): string | null {
  const isi = [bersih(city), bersih(province)].filter((x) => x !== "").join(", ");
  return isi === "" ? null : isi;
}

function unik(daftar: readonly string[]): string[] {
  const dilihat = new Set<string>();
  return daftar.filter((x) => {
    const k = x.toLowerCase();
    if (x === "" || dilihat.has(k)) return false;
    dilihat.add(k);
    return true;
  });
}

function teksLowongan(l: LowonganUntukRerank): string {
  const akomodasi = l.accommodations.map((a) => LABEL_AKOMODASI[a]).filter(Boolean);
  return [
    `Judul: ${bersih(l.title)}`,
    `Mode kerja: ${LABEL_MODE[l.workMode]}`,
    `Lokasi: ${lokasi(l.city, l.province) ?? "tidak disebut"}`,
    `Fasilitas: ${akomodasi.length === 0 ? "tidak disebut" : akomodasi.join(", ")}`,
    `Persyaratan: ${potong(bersih(l.requirements), MAKS_TEKS_LOWONGAN) || "tidak disebut"}`,
    `Ringkasan: ${potong(bersih(l.description), MAKS_TEKS_LOWONGAN)}`,
  ].join("\n");
}

/**
 * Profil + lowongan (sudah terurut skor) → masukan template. `ref` = posisi
 * 1-based dalam urutan skor, jadi "tanpa pendapat model" dan "urutan ref"
 * adalah urutan yang sama.
 */
export function susunMasukanRerank(
  profil: ProfilUntukRerank,
  lowongan: readonly LowonganUntukRerank[],
): MasukanRerank {
  const refKeJobId = new Map<number, string>();
  const daftar = lowongan.map((l, i) => {
    refKeJobId.set(i + 1, l.id);
    return { ref: i + 1, teks: teksLowongan(l) };
  });

  const headline = bersih(profil.headline);
  return {
    input: {
      profil: {
        headline: headline === "" ? null : headline,
        keahlian: unik(profil.keahlian.map((k) => bersih(k.name))).join(", "),
        posisi: unik(profil.pengalaman.map((p) => bersih(p.title))).join(", "),
        lokasi: lokasi(profil.city, profil.province),
        terbukaRemote: profil.openToRemote,
      },
      lowongan: daftar,
    },
    refKeJobId,
  };
}

/**
 * Alasan model → penjelasan yang boleh tampil, atau `null`.
 *
 * Syarat (AC "≤ 1 kalimat, bahasa sederhana"): tidak kosong, ≤
 * `MAKS_PENJELASAN` karakter, TEPAT satu kalimat (tidak ada tanda akhir
 * kalimat yang diikuti kalimat lain), tanpa baris baru, tanpa istilah kondisi.
 * Titik akhir ditambahkan bila model lupa — kosmetik, bukan penolakan.
 */
export function rapikanPenjelasan(alasan: string): string | null {
  if (/[\r\n]/.test(alasan.trim())) return null;
  const teks = bersih(alasan);
  if (teks === "" || teks.length > MAKS_PENJELASAN) return null;
  if (/[.!?]\s+\S/.test(teks)) return null;
  if (ISTILAH_KONDISI.test(teks)) return null;
  return /[.!?]$/.test(teks) ? teks : `${teks}.`;
}

/**
 * Jawaban model → urutan akhir untuk SELURUH kandidat yang dikirim.
 *
 * `urutanSkor` = id lowongan yang dikirim, dalam urutan skor deterministik
 * (sama dengan urutan ref). Ref yang tidak sah dibuang; kandidat yang tidak
 * disebut model menyusul menurut urutan skor, tanpa penjelasan.
 */
export function uraiHasilRerank(
  keluaran: RerankKeluaran,
  refKeJobId: ReadonlyMap<number, string>,
  urutanSkor: readonly string[],
): HasilRerank[] {
  const hasil: HasilRerank[] = [];
  const sudah = new Set<string>();

  for (const butir of keluaran.urutan) {
    const jobId = Number.isInteger(butir.ref) ? refKeJobId.get(butir.ref) : undefined;
    if (jobId === undefined || sudah.has(jobId)) continue;
    sudah.add(jobId);
    hasil.push({ jobId, rank: hasil.length + 1, explanation: rapikanPenjelasan(butir.alasan) });
  }
  for (const jobId of urutanSkor) {
    if (sudah.has(jobId) || ![...refKeJobId.values()].includes(jobId)) continue;
    sudah.add(jobId);
    hasil.push({ jobId, rank: hasil.length + 1, explanation: null });
  }
  return hasil;
}
