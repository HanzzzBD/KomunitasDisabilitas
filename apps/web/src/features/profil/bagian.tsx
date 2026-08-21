// Kerangka SATU bagian profil (PR-040) — inilah wujud "simpan per bagian".
//
// AC-nya berbunyi: "kegagalan satu bagian tidak menghanguskan lainnya". Yang
// membuat itu benar bukan disiplin penulisnya, melainkan bentuk komponen ini:
// setiap bagian membawa mutation, pesan galat, dan pengumuman keberhasilannya
// SENDIRI. Tidak ada satu pun keadaan bersama yang bisa dirusak satu bagian
// untuk bagian lain.
//
// Halaman profil bisa saja dibuat dengan satu tombol simpan di bawah. Itu akan
// lebih sedikit kode, dan salah untuk formulir sepanjang ini: pengguna yang
// mengisi tiga puluh kolom lalu kehilangan semuanya karena satu tanggal salah
// tidak akan mengisinya untuk kedua kali. Bagi pengguna yang mengetik dengan
// satu tangan atau dengan tombol saklar, "isi ulang dari awal" bukan gangguan
// kecil melainkan alasan berhenti memakai produknya.
import type { ReactNode } from "react";
import { Kartu, Tombol } from "@nawasena/ui";
import { useTeks } from "../../shared/i18n/index.js";

export interface BagianProfilProps {
  judul: string;
  /** Nama bagian sebagaimana disebut dalam pengumuman "… sudah disimpan". */
  namaPengumuman: string;
  deskripsi?: ReactNode;
  /** Penanda di sebelah judul (mis. "Data sensitif"). */
  penanda?: ReactNode;
  children: ReactNode;
  onSimpan: () => void;
  sedangMenyimpan: boolean;
  /** Kalimat kegagalan; null = tidak ada kegagalan. */
  galat: string | null;
  /** Sudah tersimpan sejak perubahan terakhir? Menggerakkan live region. */
  tersimpan: boolean;
  /** Sembunyikan tombol simpan — dipakai bagian yang menyimpan per baris. */
  tanpaTombolSimpan?: boolean;
}

export function BagianProfil({
  judul,
  namaPengumuman,
  deskripsi,
  penanda,
  children,
  onSimpan,
  sedangMenyimpan,
  galat,
  tersimpan,
  tanpaTombolSimpan = false,
}: BagianProfilProps) {
  const t = useTeks();

  return (
    <Kartu
      judul={
        <span className="flex flex-wrap items-center gap-2">
          {judul}
          {penanda}
        </span>
      }
      // Tingkat 2: bersarang langsung di bawah <h1> "Profil karier saya".
      tingkatJudul={2}
      aksi={
        tanpaTombolSimpan ? undefined : (
          <Tombol
            // `aria-disabled`, BUKAN `disabled`: tombol yang dinonaktifkan SAAT
            // memegang fokus melepaskan fokus itu ke awal dokumen di sebagian
            // peramban — dan tombol ini pasti sedang dipegang fokus ketika
            // ditekan. Yang menahan klik kedua adalah penjaga di handler.
            aria-disabled={sedangMenyimpan}
            aria-busy={sedangMenyimpan}
            onClick={() => {
              if (sedangMenyimpan) return;
              onSimpan();
            }}
          >
            {sedangMenyimpan ? t("profil.aksi.menyimpan") : t("profil.aksi.simpan")}
          </Tombol>
        )
      }
    >
      {deskripsi != null && <p className="text-base text-gray-900">{deskripsi}</p>}

      <div className="flex flex-col gap-4">{children}</div>

      {galat !== null && (
        // `role="alert"`: kegagalan muncul tanpa pengguna meminta apa pun, jadi
        // ia harus TERDENGAR — bukan hanya terlihat oleh yang menatap layar.
        <p role="alert" className="text-base font-medium text-red-700">
          {galat}
        </p>
      )}

      {/*
        Selalu dirender, juga saat kosong: live region yang lahir BERSAMA
        pesannya kerap tidak terbaca sama sekali (pola yang sama dengan
        `WilayahMemuat` PR-028b dan indikator progres wizard PR-035).
      */}
      <p role="status" className="sr-only">
        {tersimpan ? t("profil.status.tersimpan", { bagian: namaPengumuman }) : ""}
      </p>
    </Kartu>
  );
}
