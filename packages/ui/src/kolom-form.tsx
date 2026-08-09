// KolomForm — AC PR-027 nomor 2 (label terasosiasi programatik) dan 3 (galat
// diumumkan lewat `aria-describedby` + `aria-invalid`).
//
// Membungkus SATU kontrol bersama label, teks bantuan, dan pesan galatnya, lalu
// menyambungkan keempatnya. Penyambungan itu satu-satunya alasan komponen ini
// ada — kalau id-nya ditulis manual di tiap pemakaian, cepat atau lambat ada
// yang tertinggal, dan kolom yang tertinggal hanya rusak bagi pengguna yang
// paling bergantung padanya.
import { useId, type ReactNode } from "react";
import { gabungKelas } from "./gabung-kelas.js";
import { PenyediaKonteksKolom } from "./konteks-kolom.js";

export interface KolomFormProps {
  /** Teks label. WAJIB — kolom tanpa label adalah cacat, bukan pilihan gaya. */
  label: ReactNode;
  children: ReactNode;
  /** Penjelasan tambahan yang selalu tampak (mis. format yang diharapkan). */
  bantuan?: ReactNode;
  /** Pesan galat. Kehadirannya yang menjadikan kolom bermasalah. */
  galat?: ReactNode;
  wajib?: boolean;
  className?: string;
}

export function KolomForm({
  label,
  children,
  bantuan,
  galat,
  wajib = false,
  className,
}: KolomFormProps) {
  // `useId` memberi id stabil yang sama di server maupun klien, dan unik tanpa
  // penghitung global. Menyusun id sendiri dari nama kolom akan bertabrakan
  // begitu satu kolom muncul dua kali di satu halaman — dan `aria-describedby`
  // yang menunjuk ke id ganda menghasilkan pengumuman yang salah.
  const dasar = useId();
  const id = `${dasar}-kontrol`;
  const idBantuan = `${dasar}-bantuan`;
  const idGalat = `${dasar}-galat`;

  const bermasalah = galat != null && galat !== false;

  // Urutan berarti: screen reader membacakan deskripsi sesuai urutan id di
  // sini. Bantuan dulu (apa yang diminta), baru galat (apa yang salah) — sebab
  // "apa yang salah" tanpa "apa yang diminta" tidak bisa ditindaklanjuti.
  const describedBy = [bantuan != null ? idBantuan : null, bermasalah ? idGalat : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={gabungKelas("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-medium text-gray-900">
        {label}
        {wajib && (
          <>
            {/* Tanda bintang saja tidak cukup: ia hanya bermakna bagi yang
                melihatnya, dan artinya harus ditebak. Teks "wajib diisi"
                dibacakan screen reader, bintangnya disembunyikan darinya. */}
            <span aria-hidden="true" className="ml-1 text-red-700">
              *
            </span>
            <span className="sr-only"> (wajib diisi)</span>
          </>
        )}
      </label>

      <PenyediaKonteksKolom
        value={{ id, describedBy: describedBy || undefined, bermasalah, wajib }}
      >
        {children}
      </PenyediaKonteksKolom>

      {bantuan != null && (
        <p id={idBantuan} className="text-sm text-gray-700">
          {bantuan}
        </p>
      )}

      {bermasalah && (
        // `role="alert"` mengumumkan galat SAAT MUNCUL, tanpa memindahkan
        // fokus. Tanpa itu, galat yang lahir setelah submit hanya terlihat —
        // pengguna screen reader tidak akan tahu ada yang berubah sampai ia
        // menjelajah ulang formnya.
        <p id={idGalat} role="alert" className="text-sm font-medium text-red-700">
          {galat}
        </p>
      )}
    </div>
  );
}
