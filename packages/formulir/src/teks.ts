// Konversi nilai kolom formulir ↔ nilai kontrak (dipindah dari apps/web, PR-092).
//
// DUA varian "teks atau null", dan perbedaannya disengaja:
// - `teksAtauNull` MERAPIKAN (trim) — dipakai saat MENYIMPAN satu formulir
//   utuh (profil, daftar karier).
// - `teksMentahAtauNull` TIDAK merapikan — dipakai editor yang menulis state
//   pada SETIAP ketukan (CV). Merapikan di sana memakan spasi yang baru saja
//   diketik di ujung kata ("Jakarta " → "Jakarta"), sehingga kata kedua tidak
//   pernah bisa ditulis. Skema zod tetap me-trim saat dikirim.

/** Teks "" / spasi saja → null; selain itu dirapikan. */
export function teksAtauNull(nilai: string | undefined): string | null {
  const bersih = (nilai ?? "").trim();
  return bersih === "" ? null : bersih;
}

/** Teks kosong → null; selain itu APA ADANYA (untuk state yang ditulis per ketukan). */
export function teksMentahAtauNull(nilai: string): string | null {
  return nilai.trim() === "" ? null : nilai;
}

/**
 * Tahun "" → null, selain itu angka. Bukan angka dibiarkan lewat sebagai NaN
 * supaya skema zod yang menolaknya — pesannya sudah ditulis di sana.
 */
export function angkaAtauNull(nilai: string | undefined): number | null {
  const bersih = (nilai ?? "").trim();
  return bersih === "" ? null : Number(bersih);
}

/** Nilai kontrak → isi kolom teks. */
export function baca(nilai: string | number | null): string {
  return nilai === null ? "" : String(nilai);
}

/** Gabung keterangan ringkas sebuah baris ("PT A · 2020-01-01"), tanpa bagian kosong. */
export function gabungKeterangan(...bagian: ReadonlyArray<string | null>): string | null {
  const isi = bagian.filter((b): b is string => b !== null && b !== "");
  return isi.length === 0 ? null : isi.join(" · ");
}
