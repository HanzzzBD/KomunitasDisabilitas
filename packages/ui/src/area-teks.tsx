// Kolom isian teks PANJANG — saudara `Masukan` untuk jawaban berbaris banyak.
//
// LAHIR DI PR-040, bersama pemakai pertamanya. Ringkasan profil (2000 karakter)
// dan deskripsi pekerjaan tidak muat di satu baris, dan `<input>` yang dipaksa
// menampungnya menyembunyikan sebagian besar isian pengguna di balik gulir
// mendatar — yang paling menyulitkan justru pengguna yang memeriksa ulang
// tulisannya dengan pembesaran layar.
//
// SELURUH ALASAN BENTUKNYA SAMA DENGAN `Masukan`, dan itu disengaja: di atas
// `<textarea>` natif, tanpa mengurus label (itu tugas `KolomForm`), dan
// menyambungkan diri lewat konteks supaya tidak ada id yang perlu diketik ulang.
// Yang berbeda hanya elemennya.
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { gabungKelas } from "./gabung-kelas.js";
import { useKonteksKolom } from "./konteks-kolom.js";

export interface AreaTeksProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Tandai kolom bermasalah. Bila kosong, diambil dari KolomForm. */
  bermasalah?: boolean;
}

export const AreaTeks = forwardRef<HTMLTextAreaElement, AreaTeksProps>(function AreaTeks(
  { bermasalah, className, id, required, rows, "aria-describedby": describedBy, ...sisa },
  ref,
) {
  const kolom = useKonteksKolom();
  const salah = bermasalah ?? kolom?.bermasalah ?? false;

  return (
    <textarea
      ref={ref}
      id={id ?? kolom?.id}
      required={required ?? kolom?.wajib}
      aria-describedby={describedBy ?? kolom?.describedBy}
      // Empat baris: cukup untuk melihat satu paragraf utuh tanpa menggulir,
      // dan tidak sebesar itu sehingga kolom di bawahnya terdorong keluar layar
      // ponsel. Pemakai boleh menimpanya.
      rows={rows ?? 4}
      aria-invalid={salah || undefined}
      className={gabungKelas(
        "min-h-sentuh w-full rounded px-3 py-2 text-base",
        "border bg-white text-gray-900",
        "placeholder:text-gray-500",
        salah ? "border-red-700" : "border-gray-400",
        // `resize-y`, bukan `resize` penuh: melebarkan mendatar bisa membuat
        // kolom melampaui lebar layar dan memaksa halaman digeser dua arah
        // (WCAG 1.4.10). Memanjangkan ke bawah tidak punya akibat itu, dan
        // justru itulah arah yang dibutuhkan orang saat tulisannya panjang.
        "resize-y",
        "disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70",
        className,
      )}
      {...sisa}
    />
  );
});
