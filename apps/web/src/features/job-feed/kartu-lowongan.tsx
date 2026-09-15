// Kartu lowongan — hasil pencarian publik (PR-058).
//
// AC "Kartu = satu kesatuan bagi SR (nama, perusahaan, akomodasi, lokasi)":
// keempatnya dirender BERURUTAN di dalam SATU `<Kartu>`/`<li>`, tanpa elemen
// fokusable di antaranya selain tautan "Lihat detail" di akhir — screen
// reader yang menjelajah per elemen tidak akan melompat keluar-masuk kartu
// ini sebelum sampai ke tautannya.
//
// TAKSONOMI JENIS/MODE KERJA DIPINJAM dari katalog `companies`
// (`companies.lowongan.tipe.*`/`mode.*`, lahir PR-054) — BUKAN diulang di
// katalog `lowongan`. Kandidat melihat kartu lowongan di DUA tempat (di sini,
// dan di profil publik perusahaan) dan harus membaca istilah yang SAMA
// PERSIS. Begitu pula label "Lihat detail" (`companies.lowongan.lihat*`) dan
// label akomodasi (`profil.akomodasi.*`, dipinjam LEWAT `DaftarAkomodasi`
// yang sudah ada — bukan ditulis ulang di sini).
//
// PEMULIHAN FOKUS (PR-059): tautan menerima `refTautan` supaya daftar bisa
// mengembalikan fokus ke kartu yang tadi dibuka saat pengguna kembali dari
// halaman detail, dan membawa `state.dariDaftar` supaya tautan "Kembali" di
// halaman detail tahu ia boleh memakai riwayat (bukan membuka daftar baru).
import type { Ref } from "react";
import { Link } from "react-router";
import type { EmploymentType, JobSearchResult, WorkMode } from "@nawasena/schemas";
import { Kartu } from "@nawasena/ui";
import { useTeks, type KunciTeks } from "../../shared/i18n/index.js";
import { DaftarAkomodasi } from "../companies-publik/akomodasi-daftar.js";

/** Sama persis dengan `KUNCI_TIPE` di `companies-publik/lowongan-daftar.tsx`. Dipakai juga halaman detail. */
export const KUNCI_TIPE: Readonly<Record<EmploymentType, KunciTeks>> = {
  full_time: "companies.lowongan.tipe.full_time",
  part_time: "companies.lowongan.tipe.part_time",
  contract: "companies.lowongan.tipe.contract",
  internship: "companies.lowongan.tipe.internship",
  freelance: "companies.lowongan.tipe.freelance",
};

/** Sama persis dengan `KUNCI_MODE` di `companies-publik/lowongan-daftar.tsx`. Dipakai juga halaman detail. */
export const KUNCI_MODE: Readonly<Record<WorkMode, KunciTeks>> = {
  onsite: "companies.lowongan.mode.onsite",
  hybrid: "companies.lowongan.mode.hybrid",
  remote: "companies.lowongan.mode.remote",
};

/** State navigasi yang dibawa tautan kartu ke halaman detail. */
export interface StateDariDaftar {
  dariDaftar: true;
}

export interface KartuLowonganProps {
  lowongan: JobSearchResult;
  /** Ref tautan "Lihat detail" — dipakai daftar untuk memulihkan fokus saat kembali. */
  refTautan?: Ref<HTMLAnchorElement>;
  /** Dipanggil tepat sebelum berpindah ke halaman detail. */
  onBuka?: () => void;
}

export function KartuLowongan({ lowongan, refTautan, onBuka }: KartuLowonganProps) {
  const t = useTeks();

  const lokasi = [lowongan.city, lowongan.province].filter((v): v is string => v !== null);
  const meta = [
    lowongan.companyName,
    t(KUNCI_TIPE[lowongan.employmentType]),
    t(KUNCI_MODE[lowongan.workMode]),
  ];
  if (lokasi.length > 0) meta.push(lokasi.join(", "));
  else meta.push(t("lowongan.kartu.lokasiTakDisebut"));

  const state: StateDariDaftar = { dariDaftar: true };

  return (
    <Kartu
      judul={lowongan.title}
      tingkatJudul={3}
      aksi={
        <Link
          ref={refTautan}
          to={`/lowongan/${lowongan.id}`}
          state={state}
          onClick={onBuka}
          aria-label={t("companies.lowongan.lihatLabel", { judul: lowongan.title })}
          className="text-base font-medium text-gray-900 underline hover:no-underline"
        >
          {t("companies.lowongan.lihat")}
        </Link>
      }
    >
      {/* `<p>` tunggal, bukan `<dl>`: ini metadata ringkas dibaca sebagai satu
          kalimat ("PT Contoh • Purna waktu • Di kantor • Jakarta"), bukan
          daftar istilah yang menuntut navigasi baris-demi-baris. */}
      <p className="text-base text-gray-900">{meta.join(" • ")}</p>

      {lowongan.accommodations.length > 0 ? (
        <DaftarAkomodasi akomodasi={lowongan.accommodations} />
      ) : (
        <p className="text-sm text-gray-700">{t("lowongan.kartu.akomodasiKosong")}</p>
      )}
    </Kartu>
  );
}
