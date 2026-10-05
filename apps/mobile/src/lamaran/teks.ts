import { ApiError } from "@nawasena/api-client";
import type { ApplicationStatus } from "@nawasena/schemas";

import { pesanGalat } from "../auth/alur-masuk";

export const STATUS: Readonly<Record<ApplicationStatus, string>> = {
  submitted: "Terkirim",
  viewed: "Sudah dilihat",
  in_review: "Sedang ditinjau",
  interview: "Wawancara",
  offered: "Penawaran kerja",
  hired: "Diterima",
  rejected: "Belum berhasil",
  withdrawn: "Ditarik",
};

export const ARTI_STATUS: Readonly<Record<ApplicationStatus, string>> = {
  submitted: "Lamaran Anda sudah diterima sistem. Tim akan meneruskannya ke perusahaan.",
  viewed: "Lamaran Anda sudah dibuka oleh tim.",
  in_review: "Perusahaan sedang meninjau lamaran Anda.",
  interview: "Anda masuk tahap wawancara. Tim akan menghubungi Anda untuk jadwalnya.",
  offered: "Perusahaan menawarkan pekerjaan kepada Anda.",
  hired: "Anda diterima bekerja. Konfirmasikan jika Anda sudah mulai bekerja.",
  rejected: "Lamaran ini belum berhasil. Anda tetap bisa mencoba lowongan lain.",
  withdrawn: "Anda sudah menarik lamaran ini. Lamaran tidak dilanjutkan.",
};

export const TANGGAL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
export const WAKTU = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const GALAT: Record<string, string> = {
  DATA_DISABILITAS_KOSONG:
    "Data disabilitas belum tersedia. Pilih Tidak atau isi profil terlebih dahulu.",
  LOWONGAN_TIDAK_DITEMUKAN: "Lowongan sudah ditutup. Anda bisa mencari lowongan lain.",
  CV_TIDAK_DITEMUKAN: "CV ini sudah tidak ada. Muat ulang daftar CV dan pilih lagi.",
  LAMARAN_SEDANG_DIPROSES: "Lamaran sedang diproses. Tunggu sebentar, lalu coba lagi.",
  LAMARAN_TIDAK_DITEMUKAN: "Lamaran tidak ditemukan atau bukan milik akun ini.",
  STATUS_LAMARAN_TIDAK_VALID:
    "Status lamaran sudah berubah. Muat ulang untuk melihat status terbaru.",
};
export function pesanGalatLamaran(galat: unknown): string {
  return galat instanceof ApiError ? (GALAT[galat.code] ?? pesanGalat(galat)) : pesanGalat(galat);
}
