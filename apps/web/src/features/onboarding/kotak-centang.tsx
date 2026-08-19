// Kotak centang berlabel — dipakai wizard onboarding (PR-035).
//
// TINGGAL DI SINI, BUKAN DI `packages/ui`, dan itu mengikuti disiplin yang
// sudah dipakai paket itu sendiri: varian `bahaya` pada `Tombol` menunggu
// pemakai kedua sebelum ditetapkan bentuknya (lihat `dialog-hapus-akun.tsx`).
// Onboarding adalah pemakai PERTAMA kotak centang di seluruh aplikasi;
// merancang API bersama untuk satu pemanggil berarti menebak kebutuhan
// pemanggil kedua yang belum ada. Bila panel preferensi (PR-036) memerlukan
// bentuk yang sama, di sanalah ia punya dua contoh untuk digeneralisasi.
//
// `<input type="checkbox">` NATIF, dibungkus `<label>`. Elemen natif sudah
// memenuhi seluruh pola: peran, keadaan `checked` yang diumumkan, aktivasi
// Space, dan partisipasi form. Membungkusnya dengan primitive hanya menambah
// lapisan yang bisa merusaknya (alasan yang sama dengan `Tombol`, PR-027b).
import { useId, type ReactNode } from "react";

export interface KotakCentangProps {
  label: ReactNode;
  /** Penjelasan tambahan yang selalu tampak; disambungkan lewat `aria-describedby`. */
  bantuan?: ReactNode;
  dicentang: boolean;
  onUbah: (dicentang: boolean) => void;
}

export function KotakCentang({ label, bantuan, dicentang, onUbah }: KotakCentangProps) {
  const dasar = useId();
  const idBantuan = `${dasar}-bantuan`;

  return (
    <div className="flex flex-col gap-1">
      {/*
        Teksnya DI DALAM `<label>`, bukan di sebelahnya dengan `htmlFor`: dengan
        begitu seluruh kalimat ikut menjadi sasaran klik/sentuh, bukan hanya
        kotak 16px-nya. `min-h-sentuh` menjaga tingginya tetap memenuhi ambang
        target sentuh (WCAG 2.2 §2.5.8) meski labelnya hanya satu kata.
      */}
      <label className="min-h-sentuh flex cursor-pointer items-center gap-3 text-base text-gray-900">
        <input
          type="checkbox"
          checked={dicentang}
          aria-describedby={bantuan == null ? undefined : idBantuan}
          onChange={(e) => {
            onUbah(e.target.checked);
          }}
          // `h-6 w-6` — kotak bawaan peramban berukuran ±13px dan sulit
          // dikenai pengguna dengan keterbatasan motorik (persona Sari).
          // `accent-gray-900` menjaga kontras keadaan tercentang.
          className="h-6 w-6 shrink-0 accent-gray-900"
        />
        <span>{label}</span>
      </label>

      {bantuan != null && (
        <p id={idBantuan} className="pl-9 text-sm text-gray-700">
          {bantuan}
        </p>
      )}
    </div>
  );
}
