// Kartu (Card) — wadah visual untuk satu satuan isi. Menutup bagian AC PR-028
// nomor 5 (lolos axe); ia tidak punya AC perilaku sendiri.
//
// TANPA PRIMITIVE, dan itu bukan kemalasan: kartu tidak punya perilaku. Ia
// tidak menerima fokus, tidak punya keadaan, tidak menangkap tombol. Yang
// dibungkus primitive hanyalah yang punya pola interaksi — membungkus wadah
// diam hanya menambah lapisan yang bisa merusak semantik isinya.
import type { ReactNode } from "react";
import { gabungKelas } from "./gabung-kelas.js";

export type TingkatJudul = 2 | 3 | 4 | 5 | 6;

interface DasarKartu {
  children: ReactNode;
  /** Baris aksi di bawah isi (mis. tombol "Lamar"). */
  aksi?: ReactNode;
  className?: string;
}

/**
 * `judul` dan `tingkatJudul` HARUS datang berpasangan — dijaga tipe, bukan
 * anjuran.
 *
 * Tingkat heading tidak bisa punya nilai bawaan yang benar. Pengguna screen
 * reader menjelajah halaman dengan melompat antar heading, dan urutan tingkat
 * itulah kerangka halamannya. Kartu yang selalu menulis `<h3>` menghasilkan
 * kerangka yang rusak begitu ia dipakai di dalam bagian dengan kedalaman lain:
 * tingkat yang melompat 1 → 3, atau sederet h3 yang sebenarnya bersarang.
 * Karena tingkat yang benar hanya diketahui di tempat pemakaian, ia diminta di
 * sana — dan lupa memberinya menjadi galat kompilasi, bukan cacat diam.
 */
export type KartuProps = DasarKartu &
  (
    | { judul: ReactNode; tingkatJudul: TingkatJudul }
    | { judul?: undefined; tingkatJudul?: undefined }
  );

export function Kartu({ children, judul, tingkatJudul, aksi, className }: KartuProps) {
  const Judul = `h${tingkatJudul ?? 3}` as const;

  return (
    <div
      className={gabungKelas(
        "flex flex-col gap-3 rounded-lg border p-4",
        // Garis tepi, bukan hanya bayangan. Bayangan lenyap di mode kontras
        // tinggi dan saat dicetak; tanpa garis, batas antar kartu hilang dan
        // isinya terbaca sebagai satu blok panjang.
        "border-gray-300 bg-white text-gray-900",
        className,
      )}
    >
      {judul != null && <Judul className="text-lg font-semibold">{judul}</Judul>}

      <div className="flex flex-col gap-2">{children}</div>

      {aksi != null && <div className="flex flex-wrap gap-2">{aksi}</div>}
    </div>
  );
}
