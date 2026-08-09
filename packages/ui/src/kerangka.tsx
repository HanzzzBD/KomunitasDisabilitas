// Kerangka (Skeleton) — AC PR-028 nomor 4: "Skeleton menandai wilayah
// `aria-busy`".
//
// Perhatikan bunyi AC-nya: yang harus ditandai adalah WILAYAH, bukan bentuk
// abu-abunya. Itu bukan kerewelan istilah. `aria-busy` berarti "isi di sini
// belum final, tunggu dulu sebelum membacakannya"; menaruhnya pada bentuk
// abu-abu — yang memang tidak punya isi — tidak memberi tahu apa pun. Yang
// perlu ditandai justru bagian halaman yang SEDANG diganti.
//
// Karena itu berkas ini berisi dua hal yang tidak berdiri sendiri:
//   `Kerangka`      — bentuknya, murni visual;
//   `WilayahMemuat` — penandanya, yang menjadikan bentuk itu berarti.
import type { ReactNode } from "react";
import { gabungKelas } from "./gabung-kelas.js";

const BENTUK = gabungKelas(
  "rounded bg-gray-200",
  // Denyutnya dimatikan lewat varian atribut (ADR-008), bukan hanya `@media
  // prefers-reduced-motion`: atribut sudah memperhitungkan pilihan eksplisit
  // pengguna yang boleh menimpa setelan OS. Denyut yang berulang tanpa henti
  // termasuk gerak yang paling melelahkan bagi persona Dimas.
  "animate-pulse gerak-minimal:animate-none",
  // Abu muda di atas putih nyaris lenyap pada mode kontras tinggi — dan
  // pengguna yang menyalakannya jadi melihat halaman KOSONG selama pemuatan,
  // tanpa petunjuk apa pun bahwa ada yang sedang datang.
  "kontras-tinggi:bg-gray-500",
);

export interface KerangkaProps {
  /** Jumlah baris yang ditiru. Lebih dari satu meniru paragraf. */
  baris?: number;
  className?: string;
}

/**
 * Bentuk abu-abu yang meniru tata letak isi yang belum datang.
 *
 * SELALU `aria-hidden`. Ia tiruan, bukan isi: dibacakan screen reader ia hanya
 * menjadi sederet elemen kosong yang harus dilewati satu per satu. Yang
 * memberi tahu bahwa sesuatu sedang dimuat adalah `WilayahMemuat`, lewat teks
 * sungguhan.
 */
export function Kerangka({ baris = 1, className }: KerangkaProps) {
  if (baris <= 1) {
    return <div aria-hidden="true" className={gabungKelas(BENTUK, "h-4 w-full", className)} />;
  }

  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: baris }, (_, i) => (
        <div
          key={i}
          className={gabungKelas(
            BENTUK,
            "h-4",
            // Baris terakhir dibuat pendek supaya tumpukannya terbaca sebagai
            // paragraf, bukan sebagai tabel.
            i === baris - 1 ? "w-3/5" : "w-full",
            className,
          )}
        />
      ))}
    </div>
  );
}

export interface WilayahMemuatProps {
  memuat: boolean;
  children: ReactNode;
  /**
   * Diumumkan saat pemuatan berjalan, mis. "Memuat daftar lowongan".
   *
   * WAJIB dan spesifik. "Memuat" saja tidak menjawab pertanyaan yang muncul
   * pada halaman dengan beberapa wilayah: memuat APA.
   */
  label: string;
  /** Bentuk kerangka yang menggantikan isi. Bila kosong, tiga baris teks. */
  kerangka?: ReactNode;
  className?: string;
}

/**
 * Menandai satu wilayah sebagai sedang dimuat, dan menggantikan isinya dengan
 * kerangka selama itu.
 */
export function WilayahMemuat({
  memuat,
  children,
  label,
  kerangka,
  className,
}: WilayahMemuatProps) {
  return (
    <>
      {/*
        PENGUMUMANNYA DI LUAR WILAYAH SIBUK — DAN ITU BUKAN SOAL TATA LETAK.

        `aria-busy="true"` memerintahkan screen reader MENAHAN pembacaan
        perubahan di dalam wilayah itu sampai sibuknya selesai. Live region
        yang diletakkan di dalamnya ikut tertahan: pengumuman "Memuat…" baru
        terdengar setelah pemuatannya usai, yaitu tepat saat ia sudah tidak
        berguna. Bug ini tidak terlihat sama sekali di layar, jadi ia bertahan
        lama. Dijaga test yang memeriksa hubungan keduanya, bukan sekadar
        keberadaan atributnya.

        Selalu dirender, juga saat tidak memuat. Live region hanya mengumumkan
        PERUBAHAN di dalam region yang sudah ada — region yang lahir bersama
        pesannya kerap tidak terbaca sama sekali. Yang berubah isinya, bukan
        keberadaannya.
      */}
      <p role="status" className="sr-only">
        {memuat ? label : ""}
      </p>

      <div aria-busy={memuat} className={className}>
        {memuat ? (kerangka ?? <Kerangka baris={3} />) : children}
      </div>
    </>
  );
}
