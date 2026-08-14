// Kolom isian teks — AC PR-027: fokus ring terlihat, target sentuh ≥ 44px.
//
// Di atas <input> NATIF (alasan sama dengan Tombol: elemen natif sudah memenuhi
// pola WAI-ARIA, dan tiap lapisan tambahan adalah kesempatan merusaknya).
//
// KOMPONEN INI TIDAK MENGURUS LABEL. Itu tugas KolomForm, yang menghubungkan
// label, pesan bantuan, dan pesan galat lewat id. Menaruh label di sini akan
// melahirkan DUA cara melabeli kolom yang sama — dan yang kedua selalu menjadi
// yang lupa diperbarui.
//
// Sambungannya diambil dari konteks (PR-027c), bukan dititipkan pemakai: id dan
// `aria-describedby` yang harus diketik ulang di tiap pemakaian adalah id yang
// cepat atau lambat tertinggal. Prop yang ditulis eksplisit tetap MENANG, agar
// kontrol ini masih bisa dipakai di luar KolomForm.
import { forwardRef, type InputHTMLAttributes } from "react";
import { gabungKelas } from "./gabung-kelas.js";
import { useKonteksKolom } from "./konteks-kolom.js";

export interface MasukanProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Tandai kolom bermasalah.
   *
   * Menulis `aria-invalid` DAN mengubah tampilan sekaligus, supaya keduanya
   * tidak bisa menyimpang. Kolom yang terlihat merah tetapi tidak menyatakan
   * `aria-invalid` tidak terbaca sebagai galat oleh screen reader — cacat yang
   * hanya menimpa pengguna yang paling bergantung padanya.
   *
   * Bila dibiarkan kosong, diambil dari KolomForm.
   */
  bermasalah?: boolean;
}

export const Masukan = forwardRef<HTMLInputElement, MasukanProps>(function Masukan(
  { bermasalah, className, type, id, required, "aria-describedby": describedBy, ...sisa },
  ref,
) {
  const kolom = useKonteksKolom();
  const salah = bermasalah ?? kolom?.bermasalah ?? false;

  return (
    <input
      ref={ref}
      id={id ?? kolom?.id}
      required={required ?? kolom?.wajib}
      aria-describedby={describedBy ?? kolom?.describedBy}
      // `type="text"` eksplisit. Bawaan HTML memang "text", tetapi menuliskannya
      // membuat `type` selalu ada di DOM — sebagian teknologi bantu memakainya
      // untuk mengumumkan jenis kolom.
      type={type ?? "text"}
      aria-invalid={salah || undefined}
      className={gabungKelas(
        "min-h-sentuh w-full rounded px-3 py-2 text-base",
        "border bg-white text-gray-900",
        // Placeholder BUKAN pengganti label, dan warnanya tetap dijaga agar
        // terbaca: gray-500 di atas putih = 4,6:1, tepat di atas ambang AA.
        "placeholder:text-gray-500",
        salah ? "border-red-700" : "border-gray-400",
        "disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70",
        className,
      )}
      {...sisa}
    />
  );
});
