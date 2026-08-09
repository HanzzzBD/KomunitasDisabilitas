// KeadaanKosong (empty state) — pola untuk "belum ada apa-apa di sini".
// AC PR-032 nomor 4 memberinya rumah; pemakainya lahir di PR fitur.
//
// KENAPA INI KOMPONEN, BUKAN ANJURAN. Keadaan kosong adalah layar yang paling
// jarang dilihat saat mengembangkan — data uji hampir selalu ada — dan paling
// sering dilihat pengguna baru, yang belum punya apa pun. Dibiarkan sebagai
// pola tulis-sendiri, ia lahir berbeda-beda di tiap halaman: sebagian hanya
// menulis "Tidak ada data", sebagian lupa tingkat headingnya, sebagian tidak
// terdengar sama sekali oleh screen reader.
import type { ReactNode } from "react";
import { gabungKelas } from "./gabung-kelas.js";
import type { TingkatJudul } from "./kartu.js";

export interface KeadaanKosongProps {
  /**
   * Apa yang kosong — disebutkan, bukan diisyaratkan. "Belum ada lamaran",
   * bukan "Kosong".
   */
  judul: ReactNode;
  /**
   * Tingkat heading WAJIB, dengan alasan yang sama seperti `Kartu`: tingkat
   * yang benar hanya diketahui di tempat pemakaian, dan komponen yang selalu
   * menulis `<h3>` merusak kerangka halaman begitu ia dipakai di kedalaman
   * lain — padahal urutan tingkat itulah peta halaman bagi pengguna screen
   * reader.
   */
  tingkatJudul: TingkatJudul;
  /**
   * Penjelasan — dan ia WAJIB, bukan opsional.
   *
   * Layar kosong tanpa penjelasan meninggalkan pengguna menebak apakah ia salah
   * memakai aplikasinya, salah memfilter, atau memang belum punya apa-apa.
   * Yang ketiga menenangkan; dua yang pertama membuat orang berhenti mencoba.
   * Karena tidak ada nilai bawaan yang benar, ia diminta.
   */
  children: ReactNode;
  /** Aksi yang MENGUBAH keadaan ini (mis. "Hapus filter", "Cari lowongan"). */
  aksi?: ReactNode;
  className?: string;
}

export function KeadaanKosong({
  judul,
  tingkatJudul,
  children,
  aksi,
  className,
}: KeadaanKosongProps) {
  const Judul = `h${tingkatJudul}` as const;

  return (
    // `role="status"` TANPA prop untuk mematikannya, dan itu aman justru karena
    // cara kerja live region: isi yang SUDAH ADA saat region dipasang tidak
    // diumumkan — hanya perubahan sesudahnya. Jadi keadaan kosong yang muncul
    // sejak awal halaman diam, sementara yang muncul karena pencarian tidak
    // menemukan apa pun terdengar. Yang kedua itulah kasus yang paling sering
    // terlupakan: pengguna menekan "Cari", tidak ada yang berubah di telinganya,
    // dan ia menekan lagi.
    //
    // `aria-atomic` bawaan `status` membuat judul, penjelasan, dan aksinya
    // dibacakan sebagai satu kesatuan — bukan potongan yang kehilangan konteks.
    <div
      role="status"
      className={gabungKelas(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center",
        // Garis putus-putus, bukan bayangan: ia tetap terlihat di mode kontras
        // tinggi dan saat dicetak, dan bentuk putus-putusnya sendiri sudah
        // membedakan wilayah ini dari kartu berisi tanpa mengandalkan warna.
        "border-gray-300 bg-white text-gray-900",
        className,
      )}
    >
      <Judul className="text-lg font-semibold">{judul}</Judul>
      <div className="flex flex-col gap-2 text-base">{children}</div>
      {aksi != null && <div className="flex flex-wrap justify-center gap-2">{aksi}</div>}
    </div>
  );
}
