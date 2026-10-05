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
import type { ReactNode, Ref } from "react";
import { Link } from "react-router";
import type { JobSearchResult } from "@nawasena/schemas";
import { Kartu } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";
import { DaftarAkomodasi } from "../companies-publik/akomodasi-daftar.js";
import { KUNCI_MODE, KUNCI_TIPE } from "@nawasena/lowongan";

/** State navigasi yang dibawa tautan kartu ke halaman detail. */
// Peta kunci taksonomi: `@nawasena/lowongan` (PR-093), sama dengan mobile.
export { KUNCI_MODE, KUNCI_TIPE };

export interface StateDariDaftar {
  dariDaftar: true;
}

export interface KartuLowonganProps {
  lowongan: JobSearchResult;
  /** Ref tautan "Lihat detail" — dipakai daftar untuk memulihkan fokus saat kembali. */
  refTautan?: Ref<HTMLAnchorElement>;
  /** Dipanggil tepat sebelum berpindah ke halaman detail. */
  onBuka?: () => void;
  /**
   * Isi tambahan tepat di bawah judul (PR-074: skor + alasan kecocokan).
   * Dirender DI DALAM kartu yang sama, sebelum tautan — satu kesatuan bagi
   * screen reader, dan satu komponen kartu untuk pencarian maupun feed.
   */
  pembuka?: ReactNode;
}

export function KartuLowongan({ lowongan, refTautan, onBuka, pembuka }: KartuLowonganProps) {
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
      {pembuka}
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
