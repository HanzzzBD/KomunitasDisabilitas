// Menggabungkan kelas Tailwind, dengan yang belakangan MENANG.
//
// Kenapa `twMerge`, bukan sekadar menyambung string: Tailwind menghasilkan
// kelas yang saling bertabrakan (`p-2` dan `p-4` keduanya menulis padding), dan
// pemenangnya ditentukan urutan di lembar gaya — BUKAN urutan di atribut class.
// Akibatnya `class="p-4 p-2"` bisa menghasilkan padding 4, kebalikan dari yang
// dimaksud penulisnya.
//
// Itu penting justru bagi komponen yang bisa di-override pemakainya: tanpa
// penggabungan yang benar, `<Button className="min-h-0">` akan tampak berhasil
// di sebagian kasus dan diam-diam gagal di sebagian lain — dan yang paling
// mungkin ditimpa tanpa sengaja adalah ukuran target sentuh.
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `twMerge` perlu diberi tahu kelas kustom kita, jika tidak ia tidak akan
 * mengenali `min-h-sentuh` sebagai anggota grup yang sama dengan `min-h-*`
 * bawaan — dan dua kelas yang bertabrakan akan sama-sama lolos.
 */
const gabung = extendTailwindMerge({
  extend: {
    classGroups: {
      "min-h": [{ "min-h": ["sentuh"] }],
      "min-w": [{ "min-w": ["sentuh"] }],
      p: [{ p: ["sentuh"] }],
    },
  },
});

export function gabungKelas(...kelas: ClassValue[]): string {
  return gabung(clsx(kelas));
}
