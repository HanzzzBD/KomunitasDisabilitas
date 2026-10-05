// PDF CV di Android (PR-092): unduh ke cache app → buka aplikasi PDF.
//
// Murni (platform disuntikkan) supaya urutan dan jalur cadangannya diuji Vitest:
//   1. unduh URL presigned (berumur pendek) ke cache app, menimpa versi lama;
//   2. ubah ke content:// (file:// tidak boleh diberikan ke app lain, Android 7+);
//   3. ACTION_VIEW type application/pdf + izin baca → pemilih aplikasi PDF;
//   4. tidak ada aplikasi PDF → lembar Bagikan (simpan ke Drive/Files, kirim).
import type { ResumePdfStatus } from "@nawasena/schemas";

export interface PlatformPdf {
  unduh(url: string, namaBerkas: string): Promise<string>;
  keContentUri(uriBerkas: string): Promise<string>;
  bukaViewer(contentUri: string): Promise<void>;
  bagikan(uriBerkas: string): Promise<void>;
}

export type HasilBuka = "viewer" | "bagikan";

/** Nama berkas stabil per CV: unduhan ulang menimpa, tidak menumpuk salinan. */
export const namaBerkasPdf = (resumeId: string): string => `cv-${resumeId}.pdf`;

export async function bukaPdfCv(
  platform: PlatformPdf,
  resumeId: string,
  downloadUrl: string,
): Promise<HasilBuka> {
  const berkas = await platform.unduh(downloadUrl, namaBerkasPdf(resumeId));
  try {
    await platform.bukaViewer(await platform.keContentUri(berkas));
    return "viewer";
  } catch {
    // ActivityNotFound: HP tanpa aplikasi PDF. Lembar Bagikan tetap memberi
    // jalan menyimpan berkasnya ke tempat lain.
    await platform.bagikan(berkas);
    return "bagikan";
  }
}

/** Status yang masih berjalan → klien memeriksa ulang berkala. */
export const pdfSedangDibuat = (s: ResumePdfStatus | undefined): boolean =>
  s?.status === "queued" || s?.status === "processing";

/** Kalimat status untuk pengguna (bahasa sederhana, paritas `resume.pdf.status.*`). */
export function pesanStatusPdf(s: ResumePdfStatus | undefined, gagalJaringan: boolean): string {
  if (gagalJaringan) return "Tidak bisa terhubung. Cek internet Anda, lalu coba lagi.";
  switch (s?.status) {
    case undefined:
      return "Sedang memeriksa PDF…";
    case "idle":
      return "PDF belum dibuat.";
    case "queued":
      return "PDF sedang antre dibuat.";
    case "processing":
      return "PDF sedang dibuat. Tunggu sebentar.";
    case "ready":
      return "PDF siap dibuka.";
    case "failed":
      return "PDF gagal dibuat. Coba buat lagi.";
  }
}
