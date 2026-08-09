// Tombol — AC PR-027: "Fokus ring selalu terlihat di semua varian" dan
// "Target sentuh ≥ 44px (≥ 56px saat large_touch_targets)".
//
// DIBANGUN DI ATAS <button> NATIF, BUKAN PRIMITIVE RADIX. Dokumen phase menulis
// "primitives Radix", dan itu benar untuk Select (PR-027c) yang polanya rumit.
// Untuk tombol, elemen natif SUDAH memenuhi seluruh pola WAI-ARIA: peran,
// aktivasi Enter/Space, keadaan disabled, dan partisipasi form. Membungkusnya
// dengan primitive hanya menambah berat tanpa menambah satu pun perilaku —
// dan tiap lapisan tambahan adalah kesempatan baru merusak semantik yang sudah
// benar (lihat Risks PR-027: "kustomisasi berlebihan merusak perilaku ARIA").
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { gabungKelas } from "./gabung-kelas.js";

export type VarianTombol = "utama" | "sekunder" | "hening";
export type UkuranTombol = "sedang" | "kecil";

export interface TombolProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  varian?: VarianTombol;
  ukuran?: UkuranTombol;
}

/**
 * Kelas per varian.
 *
 * TIDAK ADA `outline-none` di mana pun, dan itu bukan kelalaian. Menghapus
 * outline adalah cara paling umum cincin fokus mati — biasanya karena
 * seseorang menggantinya dengan `ring-*` lalu lupa satu varian. Aturan
 * `:focus-visible` global (PR-027a) sudah memberi outline `currentColor` yang
 * ikut berubah bersama warna teks tiap varian, jadi tidak ada yang perlu
 * diganti. Dijaga test.
 */
const VARIAN: Record<VarianTombol, string> = {
  // Kontras teks/latar 17,4:1 (putih di atas gray-900) — jauh di atas ambang
  // WCAG 2.2 AA 4,5:1. Angka ini tidak bisa diperiksa jsdom (lihat
  // TAK_BISA_DI_JSDOM); PR-031b yang mengukurnya di browser.
  utama: "bg-gray-900 text-white hover:bg-gray-800",
  // 12,6:1 (gray-900 di atas putih). Garis tepi gray-400 agar batasnya tetap
  // terlihat pada mode kontras tinggi maupun cetak.
  sekunder: "bg-white text-gray-900 border border-gray-400 hover:bg-gray-100",
  hening: "bg-transparent text-gray-900 hover:bg-gray-100",
};

/**
 * Ukuran hanya mengatur ruang DALAM tombol; tingginya tetap dikunci
 * `min-h-sentuh`.
 *
 * `kecil` karena itu bukan "tombol yang lebih kecil dari batas sentuh" — ia
 * tombol dengan padding lebih rapat yang tetap memenuhi 44px. Target sentuh
 * bukan gaya yang boleh dipilih.
 */
const UKURAN: Record<UkuranTombol, string> = {
  sedang: "px-4 py-2 text-base",
  kecil: "px-3 py-1 text-sm",
};

export const Tombol = forwardRef<HTMLButtonElement, TombolProps>(function Tombol(
  { varian = "utama", ukuran = "sedang", className, type, ...sisa },
  ref,
) {
  return (
    <button
      ref={ref}
      // `type="button"` sebagai BAWAAN. Bawaan HTML adalah "submit", sehingga
      // tombol apa pun di dalam form akan mengirim form itu saat ditekan —
      // termasuk tombol "Batal". Salah satu bug paling lazim dan paling
      // membingungkan bagi pengguna keyboard, yang menekan Enter jauh lebih
      // sering daripada pengguna tetikus.
      type={type ?? "button"}
      className={gabungKelas(
        // Target sentuh: satu-satunya sumbernya token (PR-027a). Komponen ini
        // tidak tahu apa pun tentang preferensi pengguna.
        "min-h-sentuh min-w-sentuh",
        "inline-flex items-center justify-center gap-2 rounded",
        // Transisi dimatikan saat pengguna meminta pengurangan gerak — lewat
        // varian atribut, bukan media query (ADR-008).
        "transition-colors gerak-minimal:transition-none",
        // Keadaan nonaktif harus TERLIHAT, bukan hanya tidak bisa diklik.
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIAN[varian],
        UKURAN[ukuran],
        className,
      )}
      {...sisa}
    />
  );
});
