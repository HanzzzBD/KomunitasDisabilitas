// Keadaan dialog lamar (PR-078) — fungsi murni, tanpa React.
//
// Dipisah dari komponennya supaya aturan yang paling sensitif di produk ini
// bisa diuji tanpa merender apa pun:
//
//   1. Pilihan pengungkapan MULAI KOSONG (keputusan owner 2026-10-02). Tidak
//      "Ya", tidak juga "Tidak": pilihan yang sudah terpilih adalah pilihan
//      yang dibuat sistem atas nama pengguna. Selama pengguna belum memilih,
//      lamaran TIDAK BERANGKAT — dan yang berangkat ke server pun tidak pernah
//      "tidak diisi", sebab `applyJobSchema` menolak ketiadaan pilihan.
//   2. "Ya" hanya boleh dipilih bila memang ada yang diungkap. Lamaran
//      ber-pengungkapan yang kosong menyesatkan admin (server menolaknya
//      dengan `DATA_DISABILITAS_KOSONG`; di sini pilihan itu tidak ditawarkan).
//   3. CV diisi bawaan dengan CV yang paling baru disunting. Memilih CV bukan
//      keputusan privasi; mengisinya bawaan adalah yang membuat alur ini
//      "satu ketuk" bagi pemilik satu CV — pengguna terbanyak.
import type { ApplyJob, ResumeSummary, SeekerProfile, SensitiveProfile } from "@nawasena/schemas";
import type { KunciTeks } from "../../shared/i18n/index.js";

export type PilihanUngkap = "ya" | "tidak";

export interface IsianLamar {
  resumeId: string | null;
  ungkap: PilihanUngkap | null;
}

export const ISIAN_AWAL: IsianLamar = { resumeId: null, ungkap: null };

export interface GalatIsian {
  cv?: KunciTeks;
  ungkap?: KunciTeks;
}

export type HasilPeriksa = { ok: true; input: ApplyJob } | { ok: false; galat: GalatIsian };

/** CV yang paling baru disunting, atau `null` bila belum punya CV sama sekali. */
export function cvBawaan(daftar: readonly ResumeSummary[]): string | null {
  let terbaru: ResumeSummary | null = null;
  for (const cv of daftar) {
    if (terbaru === null || cv.updatedAt > terbaru.updatedAt) terbaru = cv;
  }
  return terbaru?.id ?? null;
}

/**
 * Data yang AKAN disalin bila pengguna memilih "Ya" — atau `null` bila tidak
 * ada yang bisa diungkap (consent belum/tidak diberikan, atau semua kosong).
 *
 * Aturannya sama persis dengan `buatSnapshot` di `apply.service.ts`: yang
 * ditampilkan sebagai pratinjau harus sama dengan yang diterima perusahaan.
 */
export function dataUntukDiungkap(profil: SeekerProfile | undefined): SensitiveProfile | null {
  const s = profil?.sensitive ?? null;
  if (s === null) return null;
  const kosong =
    s.disabilityTypes.length === 0 &&
    s.accommodationNeeds.tags.length === 0 &&
    s.accommodationNeeds.notes === null;
  return kosong ? null : s;
}

/**
 * Isian → badan permintaan, atau galat per bagian.
 *
 * `bolehUngkap` dibawa masuk (bukan dibaca ulang dari profil) supaya "Ya" yang
 * tertinggal dari keadaan sebelumnya — profil dimuat ulang dan ternyata kosong
 * — tidak lolos diam-diam.
 */
export function periksaIsian(isian: IsianLamar, bolehUngkap: boolean): HasilPeriksa {
  const galat: GalatIsian = {};
  if (isian.resumeId === null) galat.cv = "lowongan.lamar.galat.cvKosong";
  if (isian.ungkap === null) galat.ungkap = "lowongan.lamar.galat.ungkapKosong";
  else if (isian.ungkap === "ya" && !bolehUngkap)
    galat.ungkap = "lowongan.lamar.galat.ungkapTakBisa";

  if (isian.resumeId === null || isian.ungkap === null || galat.ungkap !== undefined) {
    return { ok: false, galat };
  }
  return {
    ok: true,
    input: { resumeId: isian.resumeId, discloseDisability: isian.ungkap === "ya" },
  };
}

/**
 * Kunci idempotensi SATU percobaan melamar.
 *
 * Dibangkitkan sekali per pembukaan dialog dan dikirim ulang apa adanya pada
 * setiap klik "Kirim" berikutnya: klik ganda dan percobaan ulang sesudah
 * koneksi putus menjadi permintaan yang SAMA bagi server (Idempotency-Key
 * PR-075), bukan lamaran kedua.
 */
export function kunciIdempotensiBaru(): string {
  return crypto.randomUUID();
}
